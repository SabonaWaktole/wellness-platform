import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';
import { AccessContext } from '../../../../../../src/access/domain/AccessContext';
import { PermissionScope } from '../../../../../../src/access/domain/PermissionScope';
import { Request, Response, NextFunction } from 'express';

function accessWith(permissions: Record<string, PermissionScope | true>): AccessContext {
  return new AccessContext({ userId: 'u1', tenantId: 't1', roleKey: 'SALES_USER', permissions, isPlatformOperator: false });
}

describe('requirePermission middleware (FR-RBAC-05)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  it('carries the checked key for the route-coverage test to introspect', () => {
    expect(requirePermission('companies.view').permissionKey).toBe('companies.view');
  });

  it('fails loudly via next(err) when req.access is missing (a wiring bug, not a 403)', () => {
    const middleware = requirePermission('companies.view');
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when the permission is held', () => {
    req.access = accessWith({ 'companies.view': PermissionScope.Own });
    const middleware = requirePermission('companies.view');

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when the permission is not held', () => {
    req.access = accessWith({ 'companies.view': PermissionScope.Own });
    const middleware = requirePermission('users.manage');

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
