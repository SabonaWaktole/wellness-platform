import { loadAccess } from '@main/interfaces/http/middlewares/loadAccess';
import { ResolveAccessContextUseCase } from '../../../../../../src/access/application/use-cases/ResolveAccessContextUseCase';
import { UserNotAccessibleError } from '../../../../../../src/access/domain/errors';
import { AccessContext } from '../../../../../../src/access/domain/AccessContext';
import { Request, Response, NextFunction } from 'express';

describe('loadAccess middleware', () => {
  let resolveAccessContext: jest.Mocked<Pick<ResolveAccessContextUseCase, 'execute'>>;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    resolveAccessContext = { execute: jest.fn() };
    req = { user: { userId: 'u1', role: 'STAFF', tenantId: 't1', tenantSlug: 't1', warehouseId: null } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
    next = jest.fn();
  });

  it('returns 401 when req.user is missing (loadAccess must follow authenticate)', async () => {
    req.user = undefined;
    const middleware = loadAccess(resolveAccessContext as unknown as ResolveAccessContextUseCase);

    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.access and X-Permissions-Version on success', async () => {
    const access = new AccessContext({
      userId: 'u1',
      tenantId: 't1',
      roleKey: 'SALES_USER',
      permissions: { 'companies.view': 'OWN' as any },
      isPlatformOperator: false,
    });
    resolveAccessContext.execute.mockResolvedValue(access);
    const middleware = loadAccess(resolveAccessContext as unknown as ResolveAccessContextUseCase);

    await middleware(req as Request, res as Response, next);

    expect(req.access).toBe(access);
    expect(res.setHeader).toHaveBeenCalledWith('X-Permissions-Version', access.version);
    expect(next).toHaveBeenCalledWith();
  });

  it('FR-USR-04: maps UserNotAccessibleError to 401', async () => {
    resolveAccessContext.execute.mockRejectedValue(new UserNotAccessibleError());
    const middleware = loadAccess(resolveAccessContext as unknown as ResolveAccessContextUseCase);

    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes an unexpected error to next()', async () => {
    const boom = new Error('boom');
    resolveAccessContext.execute.mockRejectedValue(boom);
    const middleware = loadAccess(resolveAccessContext as unknown as ResolveAccessContextUseCase);

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
  });
});
