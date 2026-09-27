import { NextFunction, Request, Response } from 'express';
import { AccessContext } from '../../../../access/domain/AccessContext';
import { ResolveAccessContextUseCase } from '../../../../access/application/use-cases/ResolveAccessContextUseCase';
import { UserNotAccessibleError } from '../../../../access/domain/errors';

declare global {
  namespace Express {
    interface Request {
      access?: AccessContext;
    }
  }
}

/**
 * Resolves `req.access` from the already-authenticated `req.user` (FR-RBAC-01)
 * and sends `X-Permissions-Version` on every response, so the frontend can
 * tell when to refetch `/auth/me` (FR-USR-03). Mounted right after
 * `authenticate` and `resolveTenant` on every tenant-scoped router;
 * `requirePermission` reads `req.access` and assumes this ran first.
 *
 * A user who fails `ResolveAccessContextUseCase` (deactivated, deleted, or
 * gone) gets 401 here, on every request, not only at login — the same
 * per-request re-check `resolveTenant` does for tenant suspension, for the
 * same reason: an already-issued JWT (TD-010) carries no record of what
 * happened to the account since.
 */
export const loadAccess = (resolveAccessContext: ResolveAccessContextUseCase) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    try {
      const access = await resolveAccessContext.execute({
        userId: req.user.userId,
        tenantId: req.user.tenantId,
        legacyRole: req.user.role,
        impersonatorId: req.user.impersonatorId ?? null,
      });
      req.access = access;
      res.setHeader('X-Permissions-Version', access.version);
      next();
    } catch (err) {
      if (err instanceof UserNotAccessibleError) {
        return res.status(401).json({ error: err.message });
      }
      next(err);
    }
  };
};
