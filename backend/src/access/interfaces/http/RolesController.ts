import { NextFunction, Request, Response } from 'express';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { ListRolePermissionsUseCase } from '../../application/use-cases/ListRolePermissionsUseCase';
import { UpdateRolePermissionsUseCase } from '../../application/use-cases/UpdateRolePermissionsUseCase';
import { CopyRoleUseCase } from '../../application/use-cases/CopyRoleUseCase';
import { RenameRoleUseCase } from '../../application/use-cases/RenameRoleUseCase';
import { DeleteCustomRoleUseCase } from '../../application/use-cases/DeleteCustomRoleUseCase';
import {
  InvalidPermissionGrantError,
  LastRoleManagerError,
  PermissionDeniedError,
  RoleInUseError,
  RoleNameTakenError,
  RoleNotFoundError,
  SystemRoleLockedError,
} from '../../domain/errors';

/** Maps the access module's errors to a status; anything else goes to the app's error handler. */
function sendRoleError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof RoleNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  if (error instanceof InvalidPermissionGrantError) {
    return res.status(400).json({ error: error.message, code: error.code, permissionKey: error.permissionKey });
  }
  if (error instanceof RoleInUseError) {
    return res.status(409).json({ error: error.message, code: error.code, users: error.users, invitations: error.invitations });
  }
  if (error instanceof LastRoleManagerError || error instanceof SystemRoleLockedError || error instanceof RoleNameTakenError) {
    return res.status(409).json({ error: error.message, code: error.code });
  }
  return next(error);
}

/** The Roles & permissions screen (Slice 6). Parses, calls one use case, maps the result. */
export class RolesController {
  constructor(
    private readonly listRoles: ListRolePermissionsUseCase,
    private readonly updatePermissions: UpdateRolePermissionsUseCase,
    private readonly copyRole: CopyRoleUseCase,
    private readonly renameRole: RenameRoleUseCase,
    private readonly deleteRole: DeleteCustomRoleUseCase
  ) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await this.listRoles.execute({ access: req.access!, tenantId: requireTenantId(req) }));
    } catch (error) {
      sendRoleError(res, next, error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await this.updatePermissions.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        roleId: req.params.id as string,
        permissions: req.body.permissions,
      });
      res.status(200).json({ role });
    } catch (error) {
      sendRoleError(res, next, error);
    }
  };

  copy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await this.copyRole.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        sourceRoleId: req.params.id as string,
        nameSq: req.body.nameSq,
        nameEn: req.body.nameEn,
      });
      res.status(201).json({ role });
    } catch (error) {
      sendRoleError(res, next, error);
    }
  };

  rename = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.renameRole.execute({
        access: req.access!,
        tenantId: requireTenantId(req),
        roleId: req.params.id as string,
        nameSq: req.body.nameSq,
        nameEn: req.body.nameEn,
      });
      res.status(200).json({ success: true });
    } catch (error) {
      sendRoleError(res, next, error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.deleteRole.execute({ access: req.access!, tenantId: requireTenantId(req), roleId: req.params.id as string });
      res.status(204).send();
    } catch (error) {
      sendRoleError(res, next, error);
    }
  };
}
