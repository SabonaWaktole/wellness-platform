import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { addDays } from '../../../contracts/domain/calendarDay';
import { InvalidMemberError, MEMBER_LIMITS } from '../../domain/Member';
import { TIERS, type Tier } from '../../domain/Tier';
import { dayDate, dayText, effectiveTierAt } from '../memberPaymentQuote';
import { MEMBERS_MANAGE, MEMBERS_VIEW } from '../membershipPermissions';
import { presentMemberSummary, type MemberSummary } from '../presentMember';
import { SponsorValidity } from '../SponsorValidity';
import type { IEmployeeImportStore } from '../ports/IEmployeeImportStore';
import type { IMemberStore, MemberRecord } from '../ports/IMemberStore';
import type { IMembershipWriteTransaction, MembershipWriteRepos } from '../ports/IMembershipWriteTransaction';
import { ListEmployeeImportsUseCase, type EmployeeImportSummary } from './EmployeeImportUseCases';
import type { ExpireMemberTermsUseCase } from './MemberTermUseCases';
import { MemberNotFoundError } from './MemberUseCases';

const label = (member: { memberNumber: string; firstName: string; lastName: string }) => `${member.memberNumber} ${member.firstName} ${member.lastName}`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The most members one removal can name, so one transaction stays short (FR-EMP-15). */
export const MAX_REMOVALS = 500;

export const LEFT_COMPANY = 'Left company';

export class EmployeeRemovalRefusedError extends Error {
  readonly code = 'NOT_AN_EMPLOYEE';
  constructor(readonly memberId: string) {
    super('This member is not linked to a company.');
  }
}

/** The leaving date: a day, today by default, and not in the future (FR-EMP-12). */
function leavingDay(value: unknown, today: string): string {
  if (value === undefined || value === null || value === '') return today;
  if (typeof value !== 'string' || !DAY.test(value) || dayText(dayDate(value)) !== value) throw new InvalidMemberError('endsOn', 'The leaving date is a day, YYYY-MM-DD.');
  if (value > today) throw new InvalidMemberError('endsOn', 'The leaving date cannot be in the future.');
  return value;
}

function optionalReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvalidMemberError('reason', 'The reason is text.');
  const text = value.trim();
  if (text.length > MEMBER_LIMITS.reason) throw new InvalidMemberError('reason', `The reason is at most ${MEMBER_LIMITS.reason} characters.`);
  return text || null;
}

/**
 * Removes one employee inside the caller's transaction (FR-EMP-12): the employer
 * link is cleared, the company is kept as the former employer with the leaving
 * date, the sponsored term ends the day before, and the tier becomes the highest
 * term the member holds on their own, Bronze if none. Own paid and VIP terms are
 * not touched. The history says "Left company" when the tier changed, and the
 * audit entry records the removal either way.
 */
async function removeOne(
  repos: MembershipWriteRepos,
  ctx: { access: AccessContext; tenantId: string; today: string; leftOn: string; reason: string | null },
  memberId: string
): Promise<'REMOVED' | 'NOT_FOUND' | 'NOT_AN_EMPLOYEE'> {
  const { memberStore, paymentStore, settingsStore, relationshipStore, auditTrail } = repos;
  if (!(await paymentStore.lockMember(ctx.tenantId, memberId))) return 'NOT_FOUND';
  const member = (await memberStore.find(ctx.tenantId, memberId)) as MemberRecord;
  if (!member.employerClientId) return 'NOT_AN_EMPLOYEE';

  const deps = { paymentStore, settingsStore, memberStore: memberStore as IMemberStore, relationshipStore };
  const tierBefore = await effectiveTierAt(deps, ctx.tenantId, member, await paymentStore.listTerms(member.id), ctx.today);
  const company = member.employerName ?? member.employerClientId;

  await memberStore.removeEmployer(ctx.tenantId, member.id, member.employerClientId, ctx.leftOn);
  await paymentStore.endSponsoredTerms(member.id, dayText(addDays(dayDate(ctx.leftOn), -1)));
  const tierAfter = await effectiveTierAt(deps, ctx.tenantId, { ...member, employerClientId: null }, await paymentStore.listTerms(member.id), ctx.today);
  if (tierAfter !== member.currentTier) await paymentStore.setCurrentTier(ctx.tenantId, member.id, tierAfter);
  if (tierAfter !== tierBefore) {
    await paymentStore.addTierHistory({
      memberId: member.id,
      fromTier: tierBefore,
      toTier: tierAfter,
      reason: LEFT_COMPANY,
      comment: ctx.reason,
      changedByUserId: ctx.access.userId,
      effectiveOn: ctx.leftOn,
    });
  }
  await auditTrail.record({
    tenantId: ctx.tenantId,
    userId: ctx.access.userId,
    userRole: ctx.access.auditRole,
    action: AuditAction.StatusChange,
    entityType: 'Member',
    entityId: member.id,
    entityLabel: label(member),
    changes: [
      { field: 'employer', old: company, new: null },
      { field: 'formerEmployer', old: null, new: company },
      { field: 'leftCompanyAt', old: null, new: ctx.leftOn },
      { field: 'tier', old: tierBefore, new: tierAfter },
      ...(ctx.reason ? [{ field: 'reason', old: null, new: ctx.reason }] : []),
    ],
  });
  return 'REMOVED';
}

/** FR-EMP-12, FR-AUD-14: "Members: manage" removes one employee from the company. */
export class RemoveEmployeeUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly members: IMemberStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; memberId: string; leftOn?: unknown; reason?: unknown }): Promise<MemberSummary> {
    input.access.ensure(MEMBERS_MANAGE);
    const today = dayKeyInZone(this.now(), input.timezone);
    const ctx = { access: input.access, tenantId: input.tenantId, today, leftOn: leavingDay(input.leftOn, today), reason: optionalReason(input.reason) };
    await this.writeTx.run(async (repos) => {
      const outcome = await removeOne(repos, ctx, input.memberId);
      if (outcome === 'NOT_FOUND') throw new MemberNotFoundError();
      if (outcome === 'NOT_AN_EMPLOYEE') throw new EmployeeRemovalRefusedError(input.memberId);
    });
    return presentMemberSummary((await this.members.find(input.tenantId, input.memberId)) as MemberRecord);
  }
}

/**
 * FR-EMP-15: removes several selected employees at once, one history row each,
 * in ONE transaction: if any removal fails none is kept. A member who is not
 * linked any more (removed by someone else a moment ago) is reported and left
 * alone, not an error for the others.
 */
export class RemoveEmployeesUseCase {
  constructor(private readonly writeTx: IMembershipWriteTransaction, private readonly now: () => Date = () => new Date()) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; memberIds: unknown; leftOn?: unknown; reason?: unknown }): Promise<{ removed: number; skipped: string[] }> {
    input.access.ensure(MEMBERS_MANAGE);
    const ids = Array.isArray(input.memberIds) ? [...new Set(input.memberIds.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
    if (ids.length === 0) throw new InvalidMemberError('memberId', 'Select at least one member.');
    if (ids.length > MAX_REMOVALS) throw new InvalidMemberError('memberId', `Select at most ${MAX_REMOVALS} members at once.`);
    const today = dayKeyInZone(this.now(), input.timezone);
    const ctx = { access: input.access, tenantId: input.tenantId, today, leftOn: leavingDay(input.leftOn, today), reason: optionalReason(input.reason) };

    return this.writeTx.run(
      async (repos) => {
        const skipped: string[] = [];
        let removed = 0;
        for (const id of ids) {
          const outcome = await removeOne(repos, ctx, id);
          if (outcome === 'REMOVED') removed += 1;
          else if (outcome === 'NOT_FOUND') throw new MemberNotFoundError();
          else skipped.push(id);
        }
        return { removed, skipped };
      },
      { timeoutMs: 60_000 }
    );
  }
}

/**
 * D8, FR-EMP-10, FR-EMP-11: after the contracts module commits a change, brings
 * every employee of the company up to the new validity. It is the daily job's
 * own per-member code, so the two can never disagree. A member that fails is
 * logged and left for the next daily run: a contract change is never blocked by
 * Wellness+.
 */
export class SyncEmployerMembersUseCase {
  constructor(
    private readonly members: Pick<IMemberStore, 'employeeIds'>,
    private readonly expire: ExpireMemberTermsUseCase
  ) {}

  async execute(input: { tenantId: string; clientId: string; today: Date }): Promise<{ changed: number; failed: number }> {
    let changed = 0;
    let failed = 0;
    for (const memberId of await this.members.employeeIds(input.tenantId, input.clientId)) {
      try {
        const result = await this.expire.execute({ tenantId: input.tenantId, memberId, today: input.today });
        if (result.terms > 0 || result.transitions > 0) changed += 1;
      } catch (error) {
        failed += 1;
        console.error(`Wellness+: could not sync member ${memberId} after a contract change; the daily job will repair it`, error);
      }
    }
    return { changed, failed };
  }
}

export interface CompanyMembership {
  company: { id: string; name: string; employeeCount: number | null };
  /** "N members of M employees" (FR-MEM-11): M is the company record's employee count, null when it is not filled in. */
  summary: { members: number; employees: number | null; formerEmployees: number; perTier: Record<Tier, number> };
  /** Whether the employer's contract covers today, and the end date sponsored members show (FR-EMP-09). */
  sponsor: { valid: boolean; endsOn: string | null };
  members: MemberSummary[];
  formerEmployees: Array<MemberSummary & { leftCompanyAt: string | null }>;
  uploads: EmployeeImportSummary[];
}

/**
 * FR-MEM-11, FR-EMP-13: the data of the company page's Wellness+ tab, in a fixed
 * number of queries however many employees there are (company, linked members,
 * former employees, contracts, uploads and user names). Tier counts come from
 * the stored tier, which every action and the daily job keep in step (D2).
 */
export class GetCompanyMembershipUseCase {
  constructor(
    private readonly members: IMemberStore,
    private readonly imports: IEmployeeImportStore,
    private readonly sponsor: SponsorValidity,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; clientId: string }): Promise<CompanyMembership | null> {
    input.access.ensure(MEMBERS_VIEW);
    const company = await this.imports.findCompany(input.tenantId, input.clientId);
    if (!company) return null;
    const today = dayKeyInZone(this.now(), input.timezone);

    const [linked, former, sponsor, uploads] = await Promise.all([
      this.members.listByEmployer(input.tenantId, company.id),
      this.members.listFormerEmployees(input.tenantId, company.id),
      this.sponsor.forCompanies(input.tenantId, [company.id], today),
      new ListEmployeeImportsUseCase(this.imports, this.members).execute({ access: input.access, tenantId: input.tenantId, clientId: company.id }),
    ]);
    const perTier = Object.fromEntries(TIERS.map((tier) => [tier, linked.filter((m) => m.currentTier === tier).length])) as Record<Tier, number>;
    const state = sponsor.get(company.id) ?? { valid: false, endsOn: null };
    return {
      company: { id: company.id, name: company.name, employeeCount: company.employeeCount },
      summary: { members: linked.length, employees: company.employeeCount, formerEmployees: former.length, perTier },
      sponsor: state,
      members: linked.map((m) => presentMemberSummary(m)),
      formerEmployees: former.map((m) => ({ ...presentMemberSummary(m), leftCompanyAt: m.leftCompanyAt })),
      uploads,
    };
  }
}
