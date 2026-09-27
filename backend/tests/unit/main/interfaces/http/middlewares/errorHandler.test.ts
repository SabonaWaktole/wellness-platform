import { errorHandler } from '@main/interfaces/http/middlewares/errorHandler';
import { NextFunction, Request, Response } from 'express';
import { PermissionDeniedError } from '../../../../../../src/access/domain/errors';

describe('errorHandler middleware', () => {
  let res: Partial<Response>;
  let next: NextFunction;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };
    next = jest.fn();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const invoke = (err: any) =>
    errorHandler(err, {} as Request, res as Response, next);

  it('responds 500 with a generic body', () => {
    invoke(new Error('boom'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('FR-RBAC-05 answers a PermissionDeniedError with 403 and a fixed body', () => {
    invoke(new PermissionDeniedError('users.manage'));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden. Insufficient permissions.' });
  });

  it('never leaks the error message to the client', () => {
    invoke(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(body).not.toHaveProperty('message');
  });

  it('never leaks a stack trace to the client', () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at D:\\nevacrm\\backend\\src\\secret\\path.ts:42:1';

    invoke(err);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('.ts');
  });

  it('returns exactly one key, so no future field can leak by accident', () => {
    invoke(new Error('boom'));

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(Object.keys(body)).toEqual(['error']);
  });

  it('still logs the full error internally for diagnosis', () => {
    const err = new Error('boom');
    invoke(err);

    expect(consoleErrorSpy).toHaveBeenCalledWith('GLOBAL ERROR:', err);
  });

  it('does not attempt to respond if headers were already sent', () => {
    res.headersSent = true;

    invoke(new Error('boom'));

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
