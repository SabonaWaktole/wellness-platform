import { Router } from 'express';
import { AppointmentController } from '../controllers/AppointmentController';
import { CreateAppointmentUseCase } from '../../../application/use-cases/CreateAppointmentUseCase';
import { UpdateAppointmentUseCase } from '../../../application/use-cases/UpdateAppointmentUseCase';
import { RescheduleAppointmentUseCase } from '../../../application/use-cases/RescheduleAppointmentUseCase';
import { CancelAppointmentUseCase } from '../../../application/use-cases/CancelAppointmentUseCase';
import { UpdateAppointmentStatusUseCase } from '../../../application/use-cases/UpdateAppointmentStatusUseCase';
import { SearchAppointmentsUseCase } from '../../../application/use-cases/SearchAppointmentsUseCase';
import { GetUpcomingAppointmentsUseCase } from '../../../application/use-cases/GetUpcomingAppointmentsUseCase';
import { GetAppointmentHistoryUseCase } from '../../../application/use-cases/GetAppointmentHistoryUseCase';
import { PrismaAppointmentRepository } from '../../../infrastructure/repositories/PrismaAppointmentRepository';
import { PrismaClientRepository } from '../../../../clients/infrastructure/repositories/PrismaClientRepository';
import { PrismaUserRepository } from '../../../../auth/infrastructure/repositories/PrismaUserRepository';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
import { defaultResolveAccessContext } from '../../../../access/infrastructure/defaultResolveAccessContext';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';
import { NotificationService } from '../../../../notifications/application/NotificationService';
import { PrismaNotificationRepository } from '../../../../notifications/infrastructure/PrismaNotificationRepository';


export const createAppointmentRouter = (
  prisma: PrismaClient,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  /**
   * Supplied by `createApp` so appointment events reach the email dispatcher.
   * Optional with a local fallback for integration tests — see the same
   * parameter on `createClientRouter`.
   */
  notificationService?: NotificationService,
  resolveAccessContext?: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  const accessContext = resolveAccessContext ?? defaultResolveAccessContext(prisma);

  // Repositories
  const appointmentRepo = new PrismaAppointmentRepository(prisma);
  const clientRepo = new PrismaClientRepository(prisma);
  const userRepo = new PrismaUserRepository(); // PrismaUserRepository creates its own PrismaClient inside, or we can use it directly depending on implementation

  // Notifications are optional on these use cases so unit tests can construct
  // them without a notification stack; here they are always provided.
  const notifications =
    notificationService ??
    new NotificationService(new PrismaNotificationRepository(prisma), userRepo);

  // Use Cases
  const createAppointmentUseCase = new CreateAppointmentUseCase(appointmentRepo, clientRepo, userRepo, notifications);
  const updateAppointmentUseCase = new UpdateAppointmentUseCase(appointmentRepo, clientRepo, userRepo);
  const rescheduleAppointmentUseCase = new RescheduleAppointmentUseCase(appointmentRepo, notifications);
  const cancelAppointmentUseCase = new CancelAppointmentUseCase(appointmentRepo, notifications);
  const updateAppointmentStatusUseCase = new UpdateAppointmentStatusUseCase(appointmentRepo);
  const searchAppointmentsUseCase = new SearchAppointmentsUseCase(appointmentRepo);
  const getUpcomingAppointmentsUseCase = new GetUpcomingAppointmentsUseCase(appointmentRepo);
  const getAppointmentHistoryUseCase = new GetAppointmentHistoryUseCase(appointmentRepo);

  // Controller
  const appointmentController = new AppointmentController(
    createAppointmentUseCase,
    updateAppointmentUseCase,
    rescheduleAppointmentUseCase,
    cancelAppointmentUseCase,
    updateAppointmentStatusUseCase,
    searchAppointmentsUseCase,
    getUpcomingAppointmentsUseCase,
    getAppointmentHistoryUseCase
  );

  // Middlewares applied to all routes in this router
  const authMw = authenticate(tokenService);
  const resolveTenantMw = resolveTenant(tenantRepository);
  const loadAccessMw = loadAccess(accessContext);

  router.use(authMw);
  router.use(resolveTenantMw);
  router.use(loadAccessMw);

  router.post('/', requirePermission('activities.add'), appointmentController.createAppointment);
  router.get('/search', requirePermission('calendar.view'), appointmentController.searchAppointments);
  router.get('/upcoming', requirePermission('calendar.view'), appointmentController.getUpcomingAppointments);
  router.get(
    '/:appointmentId/history',
    requirePermission('calendar.view'),
    appointmentController.getAppointmentHistory
  );

  router.put('/:appointmentId', requirePermission('activities.add'), appointmentController.updateAppointment);

  router.put(
    '/:appointmentId/reschedule',
    requirePermission('activities.add'),
    appointmentController.rescheduleAppointment
  );
  router.put('/:appointmentId/cancel', requirePermission('activities.add'), appointmentController.cancelAppointment);
  router.put(
    '/:appointmentId/status',
    requirePermission('activities.add'),
    appointmentController.updateAppointmentStatus
  );

  return router;
};
