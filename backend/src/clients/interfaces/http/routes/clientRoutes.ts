import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { ClientController } from '../controllers/ClientController';
import { CreateClientUseCase } from '../../../application/use-cases/CreateClientUseCase';
import { UpdateClientUseCase } from '../../../application/use-cases/UpdateClientUseCase';
import { SearchClientsUseCase } from '../../../application/use-cases/SearchClientsUseCase';
import { GetClientHistoryUseCase } from '../../../application/use-cases/GetClientHistoryUseCase';
import { AddInteractionUseCase } from '../../../application/use-cases/AddInteractionUseCase';
import { DefineCustomFieldUseCase } from '../../../application/use-cases/DefineCustomFieldUseCase';
import { DefineOutcomeCategoryUseCase } from '../../../application/use-cases/DefineOutcomeCategoryUseCase';
import { GetClientUseCase } from '../../../application/use-cases/GetClientUseCase';
import { GetCustomFieldsUseCase } from '../../../application/use-cases/GetCustomFieldsUseCase';
import { GetOutcomeCategoriesUseCase } from '../../../application/use-cases/GetOutcomeCategoriesUseCase';
import { ImportCustomFieldsUseCase } from '../../../application/use-cases/ImportCustomFieldsUseCase';
import { ImportClientsUseCase } from '../../../application/use-cases/ImportClientsUseCase';
import { IMPORT_MIME, MAX_IMPORT_BYTES } from '../../../infrastructure/excel/sheet';
import { PrismaClientRepository } from '../../../infrastructure/repositories/PrismaClientRepository';
import { PrismaCustomFieldDefinitionRepository } from '../../../infrastructure/repositories/PrismaCustomFieldDefinitionRepository';
import { PrismaInteractionRepository } from '../../../infrastructure/repositories/PrismaInteractionRepository';
import { PrismaOutcomeCategoryRepository } from '../../../infrastructure/repositories/PrismaOutcomeCategoryRepository';
import { PrismaAppointmentRepository } from '../../../../appointments/infrastructure/repositories/PrismaAppointmentRepository';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { authorize } from '../../../../main/interfaces/http/middlewares/authorize';
import { UserRole } from '../../../../auth/domain/enums/UserRole';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';
import { NotificationService } from '../../../../notifications/application/NotificationService';
import { PrismaNotificationRepository } from '../../../../notifications/infrastructure/PrismaNotificationRepository';
import { PrismaUserRepository } from '../../../../auth/infrastructure/repositories/PrismaUserRepository';


/**
 * Spreadsheets are parsed straight from memory — nothing is written to disk, and
 * the small cap keeps that safe. Mirrors the product-image uploader's setup.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!IMPORT_MIME.includes(file.mimetype) && !/\.(xlsx|xls|csv)$/i.test(file.originalname)) {
      cb(new Error('UNSUPPORTED_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/** Translates multer's thrown errors so the uploader can say *why* it refused. */
const receiveSpreadsheet = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `The file must be smaller than ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`,
      });
    }
    return res.status(400).json({
      error: 'Unsupported file. Upload an .xlsx, .xls or .csv spreadsheet.',
    });
  });
};

export const createClientRouter = (
  prisma: PrismaClient,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  /**
   * Supplied by `createApp` so client events reach the email dispatcher too.
   *
   * Optional with a local fallback because the router is also constructed
   * directly by integration tests, which have no interest in wiring an email
   * stack. The fallback emits in-app notifications and sends no mail — the
   * previous behaviour, now explicit rather than accidental.
   */
  notificationService?: NotificationService
): Router => {
  const router = Router({ mergeParams: true });

  // Repositories
  const clientRepo = new PrismaClientRepository(prisma);
  const customFieldRepo = new PrismaCustomFieldDefinitionRepository(prisma);
  const interactionRepo = new PrismaInteractionRepository(prisma);
  const outcomeCategoryRepo = new PrismaOutcomeCategoryRepository(prisma);
  const appointmentRepo = new PrismaAppointmentRepository(prisma);

  const notifications =
    notificationService ??
    new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository());

  // Use Cases
  const createClientUseCase = new CreateClientUseCase(clientRepo, customFieldRepo, notifications);
  const updateClientUseCase = new UpdateClientUseCase(clientRepo, customFieldRepo, notifications);
  const searchClientsUseCase = new SearchClientsUseCase(clientRepo);
  const getClientHistoryUseCase = new GetClientHistoryUseCase(clientRepo, interactionRepo, appointmentRepo);
  const addInteractionUseCase = new AddInteractionUseCase(clientRepo, interactionRepo, outcomeCategoryRepo);
  const defineCustomFieldUseCase = new DefineCustomFieldUseCase(customFieldRepo);
  const defineOutcomeCategoryUseCase = new DefineOutcomeCategoryUseCase(outcomeCategoryRepo);
  const getClientUseCase = new GetClientUseCase(clientRepo);
  const getCustomFieldsUseCase = new GetCustomFieldsUseCase(customFieldRepo);
  const getOutcomeCategoriesUseCase = new GetOutcomeCategoriesUseCase(outcomeCategoryRepo);
  const importCustomFieldsUseCase = new ImportCustomFieldsUseCase(customFieldRepo);
  const importClientsUseCase = new ImportClientsUseCase(createClientUseCase, customFieldRepo);

  // Controller
  const clientController = new ClientController(
    createClientUseCase,
    updateClientUseCase,
    searchClientsUseCase,
    getClientHistoryUseCase,
    addInteractionUseCase,
    defineCustomFieldUseCase,
    defineOutcomeCategoryUseCase,
    getClientUseCase,
    getCustomFieldsUseCase,
    getOutcomeCategoriesUseCase,
    importCustomFieldsUseCase,
    importClientsUseCase
  );

  // Middlewares applied to all routes in this router
  const authMw = authenticate(tokenService);
  const resolveTenantMw = resolveTenant(tenantRepository);

  router.use(authMw);
  router.use(resolveTenantMw);
  router.use(authorize([UserRole.BUSINESS_OWNER, UserRole.STAFF]));

  router.get('/settings/custom-fields', clientController.getCustomFields);
  router.get('/settings/custom-fields/template', clientController.downloadCustomFieldTemplate);
  router.get('/import/template', clientController.downloadClientTemplate);
  router.get('/settings/outcome-categories', clientController.getOutcomeCategories);

  router.post('/', clientController.createClient);
  router.get('/search', clientController.searchClients);
  router.get('/:clientId', clientController.getClient);
  router.put('/:clientId', clientController.updateClient);
  router.get('/:clientId/history', clientController.getHistory);
  router.post('/:clientId/interactions', clientController.addInteraction);
  
  router.post('/settings/custom-fields', clientController.defineCustomField);
  router.post('/settings/custom-fields/import', receiveSpreadsheet, clientController.importCustomFields);
  router.post('/import', receiveSpreadsheet, clientController.importClients);
  router.post('/settings/outcome-categories', clientController.defineOutcomeCategory);

  return router;
};
