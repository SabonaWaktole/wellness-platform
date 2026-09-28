import { NextFunction, Request, Response } from 'express';
import { PermissionDeniedError } from '../../../../access/domain/errors';

/**
 * Terminal error handler.
 *
 * Logs the full error (message, stack, cause) to the server log, and returns a
 * fixed generic body to the client. Error messages and stack traces disclose
 * absolute file paths, dependency versions, query fragments and internal
 * structure — all useful to an attacker and useless to a legitimate caller.
 *
 * Express identifies error handlers by arity, so all four parameters must stay
 * in the signature even though `next` is unused.
 */
export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  // A use case refusing the caller (FR-RBAC-05) is an expected outcome, not
  // a server fault: 403, with the same fixed body requirePermission sends.
  if (err instanceof PermissionDeniedError && !res.headersSent) {
    res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    return;
  }

  console.error('GLOBAL ERROR:', err);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
};
