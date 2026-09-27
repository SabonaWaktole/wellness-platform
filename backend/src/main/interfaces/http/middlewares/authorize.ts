import { NextFunction, Request, Response } from 'express';
import { UserRole } from '../../../../auth/domain/enums/UserRole';

/**
 * Slice 3 restricts this to SUPER_ADMIN-only platform routes
 * (`tenantRoutes.ts`, `platformSettingsRoutes.ts`) — every tenant-scoped
 * route uses `requirePermission` instead. `authorizedRoles` is read by
 * `tests/integration/access/routeCoverage.test.ts`, which walks the router
 * tree and would otherwise have no way to tell "deliberately role-gated"
 * apart from "nobody added a check".
 */
export const authorize = (roles: UserRole[]) => {
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    if (!roles.includes(req.user.role as UserRole)) {
      return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    }

    next();
  };
  middleware.authorizedRoles = roles;
  return middleware;
};
