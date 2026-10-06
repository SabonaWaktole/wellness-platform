import { IAuditEntryReader } from '../../../audit/application/ports/IAuditEntryReader';
import { AuditedEntityType } from '../../../audit/domain/AuditQuery';
import { attentionItems, lastChange } from '../../domain/ExecutiveDefinitions';
import { DashboardInput, ensureDashboardKind, refuseNarrowing } from './dashboardContext';
import { count, DashboardResponse, Figure, hasNothing, periodOf } from './dashboardShape';
import { resolveRequestedPeriod } from './performanceAudience';
import { IAdministratorDashboardReader } from './ports/IAdministratorDashboardReader';
import { IDashboardReader } from './ports/IDashboardReader';

export const RECENT_CHANGES = 20;

/** Each part of the pricing configuration and the audit entries that record a change to it. */
const PRICING_PARTS: ReadonlyArray<{ key: string; entityType: AuditedEntityType; field?: string }> = [
  { key: 'DISCOUNT_CAP', entityType: 'PricingSettings', field: 'discountCapPercent' },
  { key: 'EMPLOYEE_BANDS', entityType: 'EmployeeBand' },
  { key: 'RISK_SURCHARGES', entityType: 'RiskSurcharge' },
  { key: 'VISIT_FREQUENCIES', entityType: 'VisitFrequency' },
  { key: 'PRICE_ZONES', entityType: 'PriceZone' },
];

/**
 * The Administrator's dashboard (FR-DSH-11): the pricing configuration with the date each part last changed,
 * the users per role and the inactive ones, the last 20 audit entries, and what needs attention. It reads
 * configuration, users and the audit trail only, so no sales figure can be in it: a deal, an offer's value, a
 * contract or a payment is never read here. It describes the workspace now, so none of it follows a period.
 */
export class GetAdministratorDashboardUseCase {
  constructor(
    private readonly reader: IDashboardReader,
    private readonly admin: IAdministratorDashboardReader,
    private readonly audit: IAuditEntryReader,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: DashboardInput): Promise<DashboardResponse> {
    const { tenantId, timezone, access, params } = input;
    await ensureDashboardKind('ADMINISTRATOR', this.reader, access, tenantId);
    refuseNarrowing(params);
    const now = this.now();
    const { days } = resolveRequestedPeriod(params, now, timezone);
    const seeAudit = access.can('audit.view');

    const [pricing, changes, roles, cities, recent] = await Promise.all([
      this.admin.pricing(tenantId),
      this.admin.changeRecords(tenantId, PRICING_PARTS.map((part) => part.entityType)),
      this.admin.roleUsage(tenantId),
      this.admin.citiesInNoZone(tenantId),
      seeAudit ? this.audit.search(tenantId, { page: 1, limit: RECENT_CHANGES }) : null,
    ]);

    const countOf: Record<string, number> = {
      EMPLOYEE_BANDS: pricing.activeEmployeeBands,
      RISK_SURCHARGES: pricing.riskSurcharges,
      VISIT_FREQUENCIES: pricing.activeVisitFrequencies,
      PRICE_ZONES: pricing.activePriceZones,
    };
    const pricingRows = PRICING_PARTS.map((part) => ({
      key: part.key,
      ...(part.key === 'DISCOUNT_CAP' ? { discountCapPercent: pricing.discountCapPercent } : { count: countOf[part.key] }),
      lastChangedAt: lastChange(changes.get(part.entityType) ?? [], part.field)?.toISOString() ?? null,
    }));

    const attention = attentionItems({
      citiesInNoZone: cities,
      rolesWithoutUsers: roles.filter((role) => role.activeUsers === 0).map((role) => ({ id: role.roleId, name: role.nameEn ?? role.nameSq })),
    });
    const activeUsers = roles.reduce((sum, role) => sum + role.activeUsers, 0);
    const inactiveUsers = roles.reduce((sum, role) => sum + role.inactiveUsers, 0);

    const figures: Figure[] = [
      count('activeUsers', 'Active users', activeUsers, 'asOfNow'),
      count('inactiveUsers', 'Inactive users', inactiveUsers, 'asOfNow'),
      count('attentionItems', 'Items needing attention', attention.length, 'asOfNow'),
    ];

    return {
      kind: 'ADMINISTRATOR',
      period: periodOf(params.preset, days),
      calculatedAt: now.toISOString(),
      figures,
      tables: {
        pricing: pricingRows,
        usersPerRole: roles.map((role) => ({
          roleId: role.roleId,
          key: role.key,
          nameSq: role.nameSq,
          nameEn: role.nameEn,
          activeUsers: role.activeUsers,
          inactiveUsers: role.inactiveUsers,
        })),
        attention,
        // Who, when, what and which record; never the values that changed.
        recentChanges: (recent?.data ?? []).map((entry) => ({
          id: entry.id,
          at: entry.at.toISOString(),
          userName: entry.userName,
          action: entry.action,
          entityType: entry.entityType,
          entityLabel: entry.entityLabel,
        })),
      },
      charts: {},
      empty: hasNothing(figures) && pricingRows.every((row) => row.lastChangedAt === null) && roles.length === 0,
    };
  }
}
