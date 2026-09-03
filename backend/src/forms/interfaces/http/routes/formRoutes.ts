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
import { authorize } from '../../../../main/interfaces/http/middlewares/authorize';
import { UserRole } from '../../../../auth/domain/enums/UserRole';
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
  tenantRepository: ITenantRepository
): Router => {
  const router = Router({ mergeParams: true });

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
  router.use(authorize([UserRole.BUSINESS_OWNER, UserRole.STAFF]));

  router.get('/', formController.listForms);
  router.post('/', formController.createForm);

  // Static path before '/:formId': that param would otherwise swallow
  // '/default' and try to look up a form whose id is the literal "default".
  router.get('/default', formController.getDefaultForm);

  router.get('/:formId', formController.getForm);
  router.patch('/:formId', formController.updateSettings);
  router.delete('/:formId', formController.deleteForm);
  router.post('/:formId/duplicate', formController.duplicateForm);
  router.put('/:formId/layout', formController.updateLayout);
  router.post('/:formId/assets', receiveImage, formController.uploadAsset);
  router.post('/:formId/publish', formController.publishForm);
  router.get('/:formId/versions', formController.listVersions);
  router.get('/:formId/versions/:versionNumber', formController.getVersion);
  router.get('/:formId/submissions', formController.listSubmissions);
  router.get('/:formId/submissions/:submissionId', formController.getSubmission);

  return router;
};
