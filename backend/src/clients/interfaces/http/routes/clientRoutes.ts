import { NextFunction, Request, Response, Router } from 'express';
import { RecordScopeResolver } from '../../../../access/application/RecordScopeResolver';
import { PrismaTeamRoster } from '../../../../access/infrastructure/PrismaTeamRoster';
import multer from 'multer';
import { ClientController } from '../controllers/ClientController';
import { CreateClientUseCase } from '../../../application/use-cases/CreateClientUseCase';
import { UpdateClientUseCase } from '../../../application/use-cases/UpdateClientUseCase';
import { SearchClientsUseCase } from '../../../application/use-cases/SearchClientsUseCase';
import { GetClientHistoryUseCase } from '../../../application/use-cases/GetClientHistoryUseCase';
import { AddInteractionUseCase } from '../../../application/use-cases/AddInteractionUseCase';
import { UpdateInteractionUseCase } from '../../../application/use-cases/UpdateInteractionUseCase';
import { DefineCustomFieldUseCase } from '../../../application/use-cases/DefineCustomFieldUseCase';
import { UpdateCustomFieldUseCase } from '../../../application/use-cases/UpdateCustomFieldUseCase';
import { DeleteCustomFieldUseCase } from '../../../application/use-cases/DeleteCustomFieldUseCase';
import { ReorderCustomFieldsUseCase } from '../../../application/use-cases/ReorderCustomFieldsUseCase';
import { EnsureDefaultClientFieldsUseCase } from '../../../application/use-cases/EnsureDefaultClientFieldsUseCase';
import { GetClientUseCase } from '../../../application/use-cases/GetClientUseCase';
import { GetCustomFieldsUseCase } from '../../../application/use-cases/GetCustomFieldsUseCase';
import { ArchiveClientUseCase } from '../../../application/use-cases/ArchiveClientUseCase';
import { RestoreClientUseCase } from '../../../application/use-cases/RestoreClientUseCase';
import { GetClientRelatedCountsUseCase } from '../../../application/use-cases/GetClientRelatedCountsUseCase';
import { GetOutcomeCategoriesUseCase } from '../../../application/use-cases/GetOutcomeCategoriesUseCase';
import { ImportCustomFieldsUseCase } from '../../../application/use-cases/ImportCustomFieldsUseCase';
import { ImportClientsUseCase } from '../../../application/use-cases/ImportClientsUseCase';
import { CompanyReadModel } from '../../../application/CompanyReadModel';
import { IMPORT_MIME, MAX_IMPORT_BYTES } from '../../../infrastructure/excel/sheet';
import { PrismaClientRepository } from '../../../infrastructure/repositories/PrismaClientRepository';
import { PrismaClientWriteTransaction } from '../../../infrastructure/repositories/PrismaClientWriteTransaction';
import { PrismaContactPersonRepository } from '../../../infrastructure/repositories/PrismaContactPersonRepository';
import { companyTimelineSources } from '../../../infrastructure/timeline/companyTimelineSources';
import { AddContactPersonUseCase } from '../../../application/use-cases/AddContactPersonUseCase';
import { UpdateContactPersonUseCase } from '../../../application/use-cases/UpdateContactPersonUseCase';
import { RemoveContactPersonUseCase } from '../../../application/use-cases/RemoveContactPersonUseCase';
import { SetPrimaryContactUseCase } from '../../../application/use-cases/SetPrimaryContactUseCase';
import { PrismaLookupStore } from '../../../../lookups/infrastructure/PrismaLookupStore';
import { PrismaCustomFieldDefinitionRepository } from '../../../infrastructure/repositories/PrismaCustomFieldDefinitionRepository';
import { PrismaCustomFieldWriteTransaction } from '../../../infrastructure/PrismaCustomFieldWriteTransaction';
import { PrismaInteractionRepository } from '../../../infrastructure/repositories/PrismaInteractionRepository';
import { PrismaInteractionWriteTransaction } from '../../../infrastructure/repositories/PrismaInteractionWriteTransaction';
import { PrismaOutcomeCategoryRepository } from '../../../infrastructure/repositories/PrismaOutcomeCategoryRepository';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission, requireAnyPermission } from '../../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
import { defaultResolveAccessContext } from '../../../../access/infrastructure/defaultResolveAccessContext';
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
  notificationService?: NotificationService,
  /** Defaults to a real Prisma-backed one on `prisma`, for the direct-construction test call sites. */
  resolveAccessContext?: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  const accessContext = resolveAccessContext ?? defaultResolveAccessContext(prisma);

  // Repositories
  const clientRepo = new PrismaClientRepository(prisma);
  const clientWriteTx = new PrismaClientWriteTransaction(prisma);
  const contactRepo = new PrismaContactPersonRepository(prisma);
  const lookupStore = new PrismaLookupStore(prisma);
  const customFieldRepo = new PrismaCustomFieldDefinitionRepository(prisma);
  const customFieldWriteTransaction = new PrismaCustomFieldWriteTransaction(prisma);
  const interactionRepo = new PrismaInteractionRepository(prisma);
  const outcomeCategoryRepo = new PrismaOutcomeCategoryRepository(prisma);
  const scopes = new RecordScopeResolver(new PrismaTeamRoster(prisma));

  const notifications =
    notificationService ??
    new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository());

  // Use Cases
  const ensureDefaultClientFieldsUseCase = new EnsureDefaultClientFieldsUseCase(customFieldRepo, clientRepo);
  const createClientUseCase = new CreateClientUseCase(clientRepo, customFieldRepo, ensureDefaultClientFieldsUseCase, lookupStore, notifications, clientWriteTx);
  const updateClientUseCase = new UpdateClientUseCase(clientRepo, customFieldRepo, ensureDefaultClientFieldsUseCase, scopes, clientWriteTx, lookupStore, notifications);
  const searchClientsUseCase = new SearchClientsUseCase(clientRepo, scopes);
  const getClientHistoryUseCase = new GetClientHistoryUseCase(
    clientRepo,
    scopes,
    companyTimelineSources(prisma),
    new PrismaUserRepository(prisma)
  );
  const activityReaders = { contacts: contactRepo, lookups: lookupStore, scopes };
  const interactionWriteTx = new PrismaInteractionWriteTransaction(prisma);
  const addInteractionUseCase = new AddInteractionUseCase(clientRepo, activityReaders, interactionWriteTx);
  const updateInteractionUseCase = new UpdateInteractionUseCase(clientRepo, interactionRepo, activityReaders, interactionWriteTx);
  const defineCustomFieldUseCase = new DefineCustomFieldUseCase(customFieldRepo);
  const updateCustomFieldUseCase = new UpdateCustomFieldUseCase(customFieldWriteTransaction);
  const deleteCustomFieldUseCase = new DeleteCustomFieldUseCase(customFieldRepo);
  const reorderCustomFieldsUseCase = new ReorderCustomFieldsUseCase(customFieldRepo);
  const getClientUseCase = new GetClientUseCase(clientRepo, scopes);
  const getCustomFieldsUseCase = new GetCustomFieldsUseCase(ensureDefaultClientFieldsUseCase);
  const getOutcomeCategoriesUseCase = new GetOutcomeCategoriesUseCase(outcomeCategoryRepo);
  const importCustomFieldsUseCase = new ImportCustomFieldsUseCase(customFieldRepo);
  const archiveClientUseCase = new ArchiveClientUseCase(clientRepo, scopes, clientWriteTx);
  const restoreClientUseCase = new RestoreClientUseCase(clientRepo, scopes, clientWriteTx);
  const getClientRelatedCountsUseCase = new GetClientRelatedCountsUseCase(clientRepo, scopes);
  const importClientsUseCase = new ImportClientsUseCase(createClientUseCase, ensureDefaultClientFieldsUseCase);
  const companyReadModel = new CompanyReadModel(lookupStore);
  const addContactPersonUseCase = new AddContactPersonUseCase(clientRepo, contactRepo, scopes, clientWriteTx);
  const updateContactPersonUseCase = new UpdateContactPersonUseCase(clientRepo, contactRepo, scopes, clientWriteTx);
  const removeContactPersonUseCase = new RemoveContactPersonUseCase(clientRepo, contactRepo, scopes, clientWriteTx);
  const setPrimaryContactUseCase = new SetPrimaryContactUseCase(clientRepo, contactRepo, scopes, clientWriteTx);

  // Controller
  const clientController = new ClientController(
    createClientUseCase,
    updateClientUseCase,
    searchClientsUseCase,
    getClientHistoryUseCase,
    addInteractionUseCase,
    defineCustomFieldUseCase,
    updateCustomFieldUseCase,
    deleteCustomFieldUseCase,
    reorderCustomFieldsUseCase,
    updateInteractionUseCase,
    getClientUseCase,
    getCustomFieldsUseCase,
    getOutcomeCategoriesUseCase,
    importCustomFieldsUseCase,
    importClientsUseCase,
    archiveClientUseCase,
    restoreClientUseCase,
    getClientRelatedCountsUseCase,
    companyReadModel,
    contactRepo,
    addContactPersonUseCase,
    updateContactPersonUseCase,
    removeContactPersonUseCase,
    setPrimaryContactUseCase
  );

  // Middlewares applied to all routes in this router
  const authMw = authenticate(tokenService);
  const resolveTenantMw = resolveTenant(tenantRepository);
  const loadAccessMw = loadAccess(accessContext);

  router.use(authMw);
  router.use(resolveTenantMw);
  router.use(loadAccessMw);

  // settings.manage: custom fields and outcome categories are workspace
  // configuration, same bucket as lookup lists (Slice 8) and role editing.
  // Outcome categories are read-only since M2 Slice 7, for one milestone:
  // activities take their result from Settings → Lists → Activity results.
  router.get('/settings/custom-fields', requirePermission('settings.manage'), clientController.getCustomFields);
  router.get(
    '/settings/custom-fields/template',
    requirePermission('settings.manage'),
    clientController.downloadCustomFieldTemplate
  );
  router.get('/import/template', requirePermission('companies.edit'), clientController.downloadClientTemplate);
  router.get(
    '/settings/outcome-categories',
    requirePermission('settings.manage'),
    clientController.getOutcomeCategories
  );

  router.post('/', requirePermission('companies.edit'), clientController.createClient);
  router.get('/search', requirePermission('companies.view'), clientController.searchClients);
  router.get('/:clientId', requirePermission('companies.view'), clientController.getClient);
  router.put('/:clientId', requirePermission('companies.edit'), clientController.updateClient);
  router.get('/:clientId/history', requirePermission('companies.view'), clientController.getHistory);
  // D3: a NOTE is `notes.add`, everything else is `activities.add` — the
  // exact check is body-dependent and lives in AddInteractionUseCase; this
  // only screens out someone with neither.
  router.post(
    '/:clientId/interactions',
    requireAnyPermission(['activities.add', 'notes.add']),
    clientController.addInteraction
  );
  // FR-ACT-06: same screen as above; the 24-hour rule lives in
  // UpdateInteractionUseCase. There is no delete route.
  router.patch(
    '/:clientId/interactions/:interactionId',
    requireAnyPermission(['activities.add', 'notes.add']),
    clientController.updateInteraction
  );
  router.get(
    '/:clientId/related-counts',
    requirePermission('companies.view'),
    clientController.getClientRelatedCounts
  );
  router.delete('/:clientId', requirePermission('companies.delete'), clientController.archiveClient);
  router.post('/:clientId/restore', requirePermission('companies.delete'), clientController.restoreClient);

  // Contact persons (FR-CMP-04): visible under companies.view (Reception
  // included), writable under companies.edit — same split as the rest of
  // the company record.
  router.post('/:clientId/contacts', requirePermission('companies.edit'), clientController.addContactPerson);
  router.patch(
    '/:clientId/contacts/:contactId',
    requirePermission('companies.edit'),
    clientController.updateContactPerson
  );
  router.delete(
    '/:clientId/contacts/:contactId',
    requirePermission('companies.edit'),
    clientController.removeContactPerson
  );
  router.post(
    '/:clientId/contacts/:contactId/primary',
    requirePermission('companies.edit'),
    clientController.setPrimaryContact
  );

  router.post('/settings/custom-fields', requirePermission('settings.manage'), clientController.defineCustomField);
  router.patch(
    '/settings/custom-fields/:fieldId',
    requirePermission('settings.manage'),
    clientController.updateCustomField
  );
  router.delete(
    '/settings/custom-fields/:fieldId',
    requirePermission('settings.manage'),
    clientController.deleteCustomField
  );
  router.post(
    '/settings/custom-fields/reorder',
    requirePermission('settings.manage'),
    clientController.reorderCustomFields
  );
  router.post(
    '/settings/custom-fields/import',
    requirePermission('settings.manage'),
    receiveSpreadsheet,
    clientController.importCustomFields
  );
  router.post('/import', requirePermission('companies.edit'), receiveSpreadsheet, clientController.importClients);

  return router;
};
