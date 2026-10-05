import { Request, Response, Router } from 'express';
import { ZodError } from 'zod';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactFields } from '../../../access/domain/redactFields';
import { GetDashboardHomeUseCase } from '../../application/wellness/GetDashboardHomeUseCase';
import { GetSalesManagerDashboardUseCase } from '../../application/wellness/GetSalesManagerDashboardUseCase';
import { GetSalesUserDashboardUseCase } from '../../application/wellness/GetSalesUserDashboardUseCase';
import { InvalidLocationError } from '../../application/wellness/dashboardContext';
import { InvalidPeriodError } from '../../domain/PerformancePeriod';
import { dashboardSchema } from './dashboardSchemas';

/**
 * The role dashboards (M3 Slice 13, FR-DSH-01 to 10). Whose figures a viewer gets is decided by the use
 * cases from their role and access context, so a salesperson outside it is a 403 whatever the request
 * says (FR-RBAC-23). `redactFields` is the second line for the value fields (FR-DSH-08).
 */
export class DashboardController {
  public router = Router({ mergeParams: true });

  constructor(
    private readonly home: GetDashboardHomeUseCase,
    private readonly salesUser: GetSalesUserDashboardUseCase,
    private readonly salesManager: GetSalesManagerDashboardUseCase
  ) {
    this.router.get('/home', this.homeRoute.bind(this));
    // Both dashboards are about deals; which of them a viewer may open follows their role, checked in the use case.
    const deals = requirePermission('deals.view');
    this.router.get('/sales-user', deals, this.dashboard.bind(this, this.salesUser));
    this.router.get('/sales-manager', deals, this.dashboard.bind(this, this.salesManager));
  }

  private async homeRoute(req: Request, res: Response) {
    await this.respond(res, req, () => this.home.execute({ tenantId: requireTenantId(req), access: req.access! }));
  }

  private async dashboard(useCase: GetSalesUserDashboardUseCase | GetSalesManagerDashboardUseCase, req: Request, res: Response) {
    await this.respond(res, req, () =>
      useCase.execute({ tenantId: requireTenantId(req), timezone: req.tenant!.timezone, access: req.access!, params: dashboardSchema.parse(req.query) })
    );
  }

  private async respond(res: Response, req: Request, work: () => Promise<unknown>) {
    try {
      // A dashboard is calculated when it is opened, never cached (FR-DSH-07).
      res.setHeader('Cache-Control', 'no-store');
      res.json(redactFields(await work(), req.access!));
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      if (error instanceof InvalidLocationError || error instanceof InvalidPeriodError) return res.status(400).json({ error: error.message });
      res.status(500).json({ error: 'Unexpected error' });
    }
  }
}
