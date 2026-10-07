import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { requireTenant } from '@main/interfaces/http/tenantContext';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requireAnyPermission, requirePermission } from '../../../main/interfaces/http/middlewares/requirePermission';
import { validateRequest } from '../../../main/interfaces/http/middlewares/validateRequest';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactMemberFields } from '../../../access/domain/redactFields';
import { EMPLOYEE_IMPORT_LIMITS } from '../../domain/employeeImport';
import { EmployeeImportNotFoundError, EmployeeImportRefusedError, type EmployeeImportRefusal } from '../../application/employeeImportErrors';
import { MEMBERS_IMPORT, MEMBERS_VIEW } from '../../application/membershipPermissions';
import {
  ConfirmEmployeeImportUseCase,
  GetEmployeeImportResultUseCase,
  GetEmployeeTemplateUseCase,
  ListEmployeeImportsUseCase,
  PreviewEmployeeImportUseCase,
} from '../../application/use-cases/EmployeeImportUseCases';

export interface EmployeeImportUseCases {
  template: GetEmployeeTemplateUseCase;
  preview: PreviewEmployeeImportUseCase;
  confirm: ConfirmEmployeeImportUseCase;
  list: ListEmployeeImportsUseCase;
  result: GetEmployeeImportResultUseCase;
}

/** The confirmation carries the token of the preview and nothing else (FR-EMP-04). */
export const confirmSchema = z.object({ confirmToken: z.string() }).strict();

const STATUS: Record<EmployeeImportRefusal, number> = {
  NO_VALID_CONTRACT: 409,
  COMPANY_NOT_FOUND: 404,
  NO_FILE: 400,
  NOT_XLSX: 400,
  HAS_MACROS: 400,
  TOO_LARGE: 413,
  TOO_MANY_ROWS: 400,
  MISSING_COLUMNS: 400,
  EMPTY_FILE: 400,
  ALREADY_CONFIRMED: 409,
  EXPIRED: 410,
  BAD_TOKEN: 400,
};

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The file is held in memory and judged by its content in the reader, so no mime or extension filter is applied here (FR-EMP-03). */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: EMPLOYEE_IMPORT_LIMITS.bytes, files: 1 } });

const receiveFile = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    const tooLarge = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
    const reason: EmployeeImportRefusal = tooLarge ? 'TOO_LARGE' : 'NO_FILE';
    return res.status(STATUS[reason]).json({
      error: tooLarge ? `The file must be smaller than ${EMPLOYEE_IMPORT_LIMITS.bytes / 1024 / 1024} MB.` : 'Choose an Excel .xlsx file.',
      code: 'EMPLOYEE_IMPORT_REFUSED',
      reason,
    });
  });
};

/**
 * `/api/:tenantSlug/membership/employee-*` (M4 Slice 9). Uploading, previewing,
 * confirming, the template and the result file are "Members: import employees";
 * the history of a company's uploads is also open to "Members: view".
 */
export const createEmployeeImportRouter = (
  uc: EmployeeImportUseCases,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
): Router => {
  const router = Router({ mergeParams: true });
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));
  const importEmployees = requirePermission(MEMBERS_IMPORT);

  const fail = (res: Response, next: NextFunction, error: unknown) => {
    if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
    if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
    if (error instanceof EmployeeImportRefusedError) return res.status(STATUS[error.reason]).json({ error: error.message, code: error.code, reason: error.reason });
    if (error instanceof EmployeeImportNotFoundError) return res.status(404).json({ error: error.message, code: error.code });
    return next(error);
  };

  const json =
    (work: (req: Request, ctx: { access: NonNullable<Request['access']>; tenantId: string; timezone: string }) => Promise<unknown>, status = 200) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenant = requireTenant(req);
        const data = await work(req, { access: req.access!, tenantId: tenant.id, timezone: tenant.timezone });
        res.status(status).json(redactMemberFields({ data }, req.access!));
      } catch (error) {
        fail(res, next, error);
      }
    };

  const sendFile = (res: Response, name: string, file: Buffer) => {
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.\- ]/g, '_')}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file);
  };

  router.get('/employee-template.xlsx', importEmployees, async (req, res, next) => {
    try {
      sendFile(res, 'wellness-plus-employees.xlsx', await uc.template.execute({ access: req.access!, language: req.query.lang }));
    } catch (error) {
      fail(res, next, error);
    }
  });

  router.get(
    '/employee-imports',
    requireAnyPermission([MEMBERS_IMPORT, MEMBERS_VIEW]),
    json((req, ctx) => uc.list.execute({ ...ctx, clientId: typeof req.query.clientId === 'string' ? req.query.clientId : '' }))
  );

  router.post(
    '/employee-imports',
    importEmployees,
    receiveFile,
    json(
      (req, ctx) =>
        uc.preview.execute({
          ...ctx,
          clientId: typeof req.body?.clientId === 'string' ? req.body.clientId : '',
          fileName: req.file?.originalname ?? '',
          file: req.file?.buffer,
        }),
      201
    )
  );

  router.post(
    '/employee-imports/:id/confirm',
    importEmployees,
    validateRequest(confirmSchema),
    json((req, ctx) => uc.confirm.execute({ ...ctx, importId: String(req.params.id), confirmToken: req.body.confirmToken }))
  );

  router.get('/employee-imports/:id/result.xlsx', importEmployees, async (req, res, next) => {
    try {
      const tenant = requireTenant(req);
      const { fileName, file } = await uc.result.execute({ access: req.access!, tenantId: tenant.id, importId: String(req.params.id) });
      sendFile(res, fileName, file);
    } catch (error) {
      fail(res, next, error);
    }
  });

  return router;
};
