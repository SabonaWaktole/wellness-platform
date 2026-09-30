import { NextFunction, Request, Response } from 'express';
import { PermissionScope, scopeAtLeast } from '../../../../access/domain/PermissionScope';

/**
 * A `requirePermission`-built middleware, tagged with the key it checks so
 * `tests/integration/access/routeCoverage.test.ts` can walk the router tree
 * and confirm every tenant-scoped route declares one (FR-RBAC-05: "hiding a
 * menu item in the UI is not enough").
 */
export interface PermissionCheckingMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
  permissionKey: string;
  /** Set by `requireScope` only, so the generated permission matrix can tell a scope-gated route apart. */
  minScope?: PermissionScope;
}

/**
 * The server-side half of FR-RBAC-05. Requires `loadAccess` to have run
 * first: a request with no `req.access` is a wiring bug, not a 403 — it fails
 * loudly via `next(err)` rather than silently denying.
 *
 * This only checks *whether* the permission is held (`AccessContext.can`).
 * The finer-grained "at what scope" (FR-RBAC-11..13, Slice 4) is a
 * repository-level filter the use case applies itself via
 * `access.scopeOf(key)`, not something a route-level middleware can express.
 */
export function requirePermission(key: string): PermissionCheckingMiddleware {
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.access) {
      return next(new Error(`requirePermission('${key}'): req.access is not set — is loadAccess mounted first?`));
    }
    if (!req.access.can(key)) {
      return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    }
    next();
  };
  middleware.permissionKey = key;
  return middleware;
}

/**
 * For an endpoint whose exact permission depends on the request body — e.g.
 * adding an interaction is `notes.add` for a NOTE and `activities.add` for
 * everything else (D3) — and so cannot be pinned to one key at the route
 * level. This only checks "is at least one of these held at all"; the use
 * case still makes the real, body-dependent check and is the actual
 * authorization boundary. `permissionKey` carries a joined label so the
 * route-coverage test still sees this route as declaring something.
 */
export function requireAnyPermission(keys: string[]): PermissionCheckingMiddleware {
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.access) {
      return next(new Error(`requireAnyPermission(${keys.join(',')}): req.access is not set — is loadAccess mounted first?`));
    }
    if (!keys.some((key) => req.access!.can(key))) {
      return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    }
    next();
  };
  middleware.permissionKey = keys.join('|');
  return middleware;
}

/**
 * Requires `key` at least at `minScope` (e.g. `PermissionScope.All`) — for a
 * route that a plain `can(key)` would open too widely. Used where a single
 * coarse permission (D8's module keys) covers both a broad grant (e.g.
 * `inventory.manage: OWN` for Sales User, scoped to their own warehouse) and
 * an administrator-only action on the same key (bulk edit, delete, warehouse
 * management) — see inventoryRoutes.ts.
 */
export function requireScope(key: string, minScope: PermissionScope): PermissionCheckingMiddleware {
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.access) {
      return next(new Error(`requireScope('${key}'): req.access is not set — is loadAccess mounted first?`));
    }
    const scope = req.access.scopeOf(key);
    const granted = scope !== null ? scopeAtLeast(scope, minScope) : req.access.can(key);
    if (!granted) {
      return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    }
    next();
  };
  middleware.permissionKey = key;
  middleware.minScope = minScope;
  return middleware;
}
