import { Router } from 'express';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { ReportsController } from './ReportsController';

export const createReportRouter = (
  reportsController: ReportsController,
  tokenService: any,
  tenantRepository: any,
  resolveAccessContext: ResolveAccessContextUseCase
) => {
  const router = Router({ mergeParams: true });

  // Require authentication and resolve the tenant from the URL
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  // reports.view (D8, Administrator only by default) — was BUSINESS_OWNER + SUPER_ADMIN.
  router.use(requirePermission('reports.view'));

  router.get('/revenue', reportsController.getRevenue);
  router.get('/clients', reportsController.getClients);
  // Before nothing in particular, but kept adjacent to /clients so the pair
  // reads as two views of the same subject.
  router.get('/clients/trend', reportsController.getClientTrend);
  router.get('/inventory', reportsController.getInventory);
  router.get('/inventory/low-stock', reportsController.getLowStock);
  router.get('/appointments', reportsController.getAppointments);
  router.post('/export/pdf', reportsController.exportPdf);

  return router;
};
