import { requireScope } from '@main/interfaces/http/middlewares/requirePermission';
import { AccessContext } from '../../../../../../src/access/domain/AccessContext';
import { PermissionScope } from '../../../../../../src/access/domain/PermissionScope';
import { Request, Response, NextFunction } from 'express';

function accessWith(permissions: Record<string, PermissionScope | true>): AccessContext {
  return new AccessContext({ userId: 'u1', tenantId: 't1', roleKey: 'SALES_USER', permissions, isPlatformOperator: false });
}

describe('requireScope middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  it('calls next() when the held scope meets the minimum', () => {
    req.access = accessWith({ 'inventory.manage': PermissionScope.All });
    requireScope('inventory.manage', PermissionScope.All)(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns 403 when the held scope is narrower than the minimum', () => {
    req.access = accessWith({ 'inventory.manage': PermissionScope.Own });
    requireScope('inventory.manage', PermissionScope.All)(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the key is not held at all', () => {
    req.access = accessWith({});
    requireScope('inventory.manage', PermissionScope.All)(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('a scope that already meets a lower minimum also passes a lower requirement', () => {
    req.access = accessWith({ 'inventory.manage': PermissionScope.All });
    requireScope('inventory.manage', PermissionScope.Own)(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('fails loudly via next(err) when req.access is missing', () => {
    requireScope('inventory.manage', PermissionScope.All)(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
