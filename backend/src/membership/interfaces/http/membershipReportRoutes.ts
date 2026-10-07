import { NextFunction, Request, Response, Router } from 'express';
import { ZodError } from 'zod';
import { requireTenant } from '@main/interfaces/http/tenantContext';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactMemberFields } from '../../../access/domain/redactFields';
import { PERIOD_PRESETS, type PeriodPreset, InvalidPeriodError } from '../../../dashboard/domain/PerformancePeriod';
import { csvRow, UTF8_BOM } from '../../../shared/infrastructure/csv/csvWriter';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { TIERS } from '../../domain/Tier';
import { MEMBERS_REPORTS_VIEW } from '../../application/membershipPermissions';
import type { ExportMembershipReportUseCase } from '../../application/reports/ExportMembershipReportUseCase';
import type { GetMembershipReportUseCase, MembershipReportParams } from '../../application/reports/GetMembershipReportUseCase';
import { REPORT_NAMES, type ReportName } from '../../application/reports/membershipReportTables';

export interface MembershipReportUseCases {
  get: GetMembershipReportUseCase;
  export: ExportMembershipReportUseCase;
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
const day = (value: unknown): string | undefined => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);
const id = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 && value.length <= 191 ? value : undefined);

const paramsOf = (q: Request['query']): MembershipReportParams => ({
  preset: oneOf<PeriodPreset>(q.preset, PERIOD_PRESETS),
  from: day(q.from),
  to: day(q.to),
  tier: oneOf(q.tier, TIERS),
  segment: oneOf(q.segment, ['CORPORATE', 'INDIVIDUAL'] as const),
  employerClientId: id(q.employerClientId),
  areaId: id(q.areaId),
  cityId: id(q.cityId),
});

/**
 * `/api/:tenantSlug/membership/reports` (M4 Slice 14, FR-RPT-01..10). Everything
 * here is "Members: view reports"; the CEO has it by default, Reception and the
 * Sales roles get 403. Revenue and upgrade amounts come only with "Members: view
 * payments", and `redactMemberFields` removes contact details and money a viewer
 * may not see (FR-RBAC-27). Opening a report is not audited; an export is.
 */
export const createMembershipReportRouter = (
  uc: MembershipReportUseCases,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  router.use(requirePermission(MEMBERS_REPORTS_VIEW));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const fail = (res: Response, next: NextFunction, error: unknown) => {
    if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
    if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
    if (error instanceof InvalidPeriodError) return res.status(400).json({ error: error.message, code: (error as { code?: string }).code ?? 'INVALID_PERIOD' });
    return next(error);
  };

  router.get('/', async (req, res, next) => {
    try {
      const tenant = requireTenant(req);
      const report = await uc.get.execute({ access: req.access!, tenantId: tenant.id, timezone: tenant.timezone, params: paramsOf(req.query) });
      res.json(redactMemberFields({ data: report }, req.access!));
    } catch (error) {
      fail(res, next, error);
    }
  });

  router.get('/export.csv', async (req, res, next) => {
    try {
      const tenant = requireTenant(req);
      const name = oneOf<ReportName>(req.query.report, REPORT_NAMES);
      if (!name) return res.status(400).json({ error: 'Choose a report to export.', code: 'INVALID_REPORT' });
      const table = await uc.export.execute({ access: req.access!, tenantId: tenant.id, timezone: tenant.timezone, params: paramsOf(req.query), name });
      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="wellness-plus-${name}-${dayKeyInZone(new Date(), tenant.timezone)}.csv"`);
      res.write(UTF8_BOM + csvRow(table.header));
      for (const row of table.rows) res.write(csvRow(row));
      res.end();
    } catch (error) {
      if (res.headersSent) return res.end();
      fail(res, next, error);
    }
  });

  return router;
};
