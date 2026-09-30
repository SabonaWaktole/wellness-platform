import { Request, Response, NextFunction, Router } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { FormController } from '../controllers/FormController';
import { EnsureDefaultClientFormUseCase } from '../../../application/use-cases/EnsureDefaultClientFormUseCase';
import { GetClientFormUseCase } from '../../../application/use-cases/GetClientFormUseCase';
import { GetClientFormsUseCase } from '../../../application/use-cases/GetClientFormsUseCase';
import { CreateClientFormUseCase } from '../../../application/use-cases/CreateClientFormUseCase';
import { UpdateClientFormSettingsUseCase } from '../../../application/use-cases/UpdateClientFormSettingsUseCase';
import { DuplicateClientFormUseCase } from '../../../application/use-cases/DuplicateClientFormUseCase';
import { SaveAsTemplateUseCase } from '../../../application/use-cases/SaveAsTemplateUseCase';
import { CreateFormFromTemplateUseCase } from '../../../application/use-cases/CreateFormFromTemplateUseCase';
import { DeleteClientFormUseCase } from '../../../application/use-cases/DeleteClientFormUseCase';
import { StoreFormAssetUseCase } from '../../../application/use-cases/StoreFormAssetUseCase';
import { UpdateClientFormLayoutUseCase } from '../../../application/use-cases/UpdateClientFormLayoutUseCase';
import { PublishFormUseCase } from '../../../application/use-cases/PublishFormUseCase';
import { ListFormVersionsUseCase } from '../../../application/use-cases/ListFormVersionsUseCase';
import { GetFormVersionUseCase } from '../../../application/use-cases/GetFormVersionUseCase';
import { ListSubmissionsUseCase } from '../../../application/use-cases/ListSubmissionsUseCase';
import { GetSubmissionUseCase } from '../../../application/use-cases/GetSubmissionUseCase';
import { PrismaClientFormRepository } from '../../../infrastructure/repositories/PrismaClientFormRepository';
import { PrismaFormVersionRepository } from '../../../infrastructure/repositories/PrismaFormVersionRepository';
import { PrismaFormSubmissionRepository } from '../../../infrastructure/repositories/PrismaFormSubmissionRepository';
import { PrismaCustomFieldDefinitionRepository } from '../../../../clients/infrastructure/repositories/PrismaCustomFieldDefinitionRepository';
import { MediaService } from '../../../../media/MediaService';
import { ACCEPTED_MIME, MAX_UPLOAD_BYTES } from '../../../../media/MediaService';
import { authenticate } from '../../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission } from '../../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
import { defaultResolveAccessContext } from '../../../../access/infrastructure/defaultResolveAccessContext';
import { ITokenService } from '../../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';

/**
 * Images are buffered in memory and re-encoded by sharp before anything
 * touches disk — the same pattern as product photos and profile/branding
 * uploads (see inventoryRoutes.ts).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME.includes(file.mimetype)) {
      cb(new Error('UNSUPPORTED_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/** Translates multer's thrown errors so the uploader can say *why* it refused. */
const receiveImage = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `That image is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      });
    }
    if (err.message === 'UNSUPPORTED_TYPE') {
      return res.status(400).json({ error: 'Unsupported image format. Use JPEG, PNG, WebP, GIF or AVIF.' });
    }
    return res.status(400).json({ error: 'That upload could not be read.' });
  });
};

/**
 * Tenant-authored client intake forms.
 *
 * Reads are open to STAFF because the client create/edit page renders from
 * `/default` and staff create clients. Writes are Business-Owner-only, enforced
 * in the use cases rather than by route middleware so the rule holds however
 * the use case is called (the existing custom-field use cases do the same).
 */
export const createFormRouter = (
  prisma: PrismaClient,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext?: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  const accessContext = resolveAccessContext ?? defaultResolveAccessContext(prisma);

  const formRepo = new PrismaClientFormRepository(prisma);
  const formVersionRepo = new PrismaFormVersionRepository(prisma);
  const formSubmissionRepo = new PrismaFormSubmissionRepository(prisma);
  const customFieldRepo = new PrismaCustomFieldDefinitionRepository(prisma);
  const mediaService = new MediaService();

  const ensureDefaultClientFormUseCase = new EnsureDefaultClientFormUseCase(
    formRepo,
    customFieldRepo
  );
  const getClientFormUseCase = new GetClientFormUseCase(
    formRepo,
    customFieldRepo,
    ensureDefaultClientFormUseCase
  );
  const updateClientFormLayoutUseCase = new UpdateClientFormLayoutUseCase(
    formRepo,
    customFieldRepo
  );
  const getClientFormsUseCase = new GetClientFormsUseCase(formRepo);
  const createClientFormUseCase = new CreateClientFormUseCase(formRepo);
  const updateClientFormSettingsUseCase = new UpdateClientFormSettingsUseCase(formRepo);
  const duplicateClientFormUseCase = new DuplicateClientFormUseCase(formRepo);
  const saveAsTemplateUseCase = new SaveAsTemplateUseCase(formRepo);
  const createFormFromTemplateUseCase = new CreateFormFromTemplateUseCase(formRepo);
  const deleteClientFormUseCase = new DeleteClientFormUseCase(formRepo);
  const storeFormAssetUseCase = new StoreFormAssetUseCase(mediaService);
  const publishFormUseCase = new PublishFormUseCase(formRepo, formVersionRepo);
  const listFormVersionsUseCase = new ListFormVersionsUseCase(formVersionRepo);
  const getFormVersionUseCase = new GetFormVersionUseCase(formVersionRepo);
  const listSubmissionsUseCase = new ListSubmissionsUseCase(formSubmissionRepo);
  const getSubmissionUseCase = new GetSubmissionUseCase(formSubmissionRepo, formVersionRepo);

  const formController = new FormController(
    getClientFormUseCase,
    updateClientFormLayoutUseCase,
    getClientFormsUseCase,
    createClientFormUseCase,
    updateClientFormSettingsUseCase,
    duplicateClientFormUseCase,
    saveAsTemplateUseCase,
    createFormFromTemplateUseCase,
    deleteClientFormUseCase,
    storeFormAssetUseCase,
    publishFormUseCase,
    listFormVersionsUseCase,
    getFormVersionUseCase,
    listSubmissionsUseCase,
    getSubmissionUseCase
  );

  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(accessContext));

  // companies.view: every one of the five roles holds it — reads stay open
  // the way they were to STAFF, since the client create/edit page renders
  // from '/default'. forms.manage (D8, Administrator only by default) gates
  // every write, matching what FormPermissions already enforced internally.
  router.get('/', requirePermission('companies.view'), formController.listForms);
  router.post('/', requirePermission('forms.manage'), formController.createForm);

  // Static paths before '/:formId': that param would otherwise swallow
  // '/default' or '/templates' and try to look up a form whose id is the
  // literal string.
  router.get('/default', requirePermission('companies.view'), formController.getDefaultForm);
  router.get('/templates', requirePermission('companies.view'), formController.listTemplates);
  router.post(
    '/templates/:templateId/instantiate',
    requirePermission('forms.manage'),
    formController.createFormFromTemplate
  );

  router.get('/:formId', requirePermission('companies.view'), formController.getForm);
  router.patch('/:formId', requirePermission('forms.manage'), formController.updateSettings);
  router.delete('/:formId', requirePermission('forms.manage'), formController.deleteForm);
  router.post('/:formId/duplicate', requirePermission('forms.manage'), formController.duplicateForm);
  router.post('/:formId/save-as-template', requirePermission('forms.manage'), formController.saveAsTemplate);
  router.put('/:formId/layout', requirePermission('forms.manage'), formController.updateLayout);
  router.post('/:formId/assets', requirePermission('forms.manage'), receiveImage, formController.uploadAsset);
  router.post('/:formId/publish', requirePermission('forms.manage'), formController.publishForm);
  router.get('/:formId/versions', requirePermission('companies.view'), formController.listVersions);
  router.get('/:formId/versions/:versionNumber', requirePermission('companies.view'), formController.getVersion);
  // Submissions hold respondents' personal data: the use case requires
  // forms.manage, so the route does too (a companies.view holder got a 403
  // from inside the use case instead of at the gate).
  router.get('/:formId/submissions', requirePermission('forms.manage'), formController.listSubmissions);
  router.get(
    '/:formId/submissions/:submissionId',
    requirePermission('forms.manage'),
    formController.getSubmission
  );

  return router;
};
