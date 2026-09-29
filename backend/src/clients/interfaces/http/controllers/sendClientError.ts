import { Response } from 'express';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '../../../../access/domain/errors';
import { DomainError } from '../../../../shared/domain/errors/DomainError';
import {
  AreaRequiredError,
  BusinessTypeInactiveError,
  BusinessTypeRequiredError,
  CityNotInAreaError,
  CityRequiredError,
  CompanyAreaInactiveError,
  CompanyCityInactiveError,
  EmailInvalidError,
  EmployeeCountInvalidError,
  PhoneInvalidError,
  TaxIdTakenError,
  WebsiteInvalidError,
} from '../../../domain/errors';

const BAD_REQUEST_ERRORS = [
  BusinessTypeRequiredError,
  BusinessTypeInactiveError,
  EmployeeCountInvalidError,
  AreaRequiredError,
  CityRequiredError,
  CityNotInAreaError,
  CompanyAreaInactiveError,
  CompanyCityInactiveError,
  EmailInvalidError,
  PhoneInvalidError,
  WebsiteInvalidError,
];

/**
 * Maps a create/update failure to its HTTP response — the coded Slice 11
 * company-profile errors first (400/409, with `code` and, where the error
 * points at one input, `field`, so the frontend can show a translated
 * message next to it), then the pre-existing DomainError/permission cases.
 */
export function sendClientError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_FAILED', details: error.issues });
    return;
  }
  if (error instanceof PermissionDeniedError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof TaxIdTakenError) {
    res.status(409).json({ error: error.message, code: error.code, field: error.field });
    return;
  }
  for (const ErrorClass of BAD_REQUEST_ERRORS) {
    if (error instanceof ErrorClass) {
      res.status(400).json({ error: error.message, code: error.code, field: (error as any).field });
      return;
    }
  }
  if (error instanceof DomainError && error.message.includes('not found')) {
    res.status(404).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  res.status(400).json({ error: message });
}
