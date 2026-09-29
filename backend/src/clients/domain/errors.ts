import { DomainError } from '../../shared/domain/errors/DomainError';

/**
 * Coded errors for the Slice 11 company profile (FR-CMP-01, 02, 03),
 * following the pattern in src/lookups/domain/errors.ts: a `code` and,
 * where the error points at one input, a `field`, so the frontend can show
 * a translated message next to the right control.
 */

export class BusinessTypeRequiredError extends DomainError {
  readonly code = 'BUSINESS_TYPE_REQUIRED';
  readonly field = 'businessTypeId';

  constructor() {
    super('Choose a business type.');
  }
}

export class BusinessTypeInactiveError extends DomainError {
  readonly code = 'BUSINESS_TYPE_INACTIVE';
  readonly field = 'businessTypeId';

  constructor() {
    super('Choose an active business type.');
  }
}

export class EmployeeCountInvalidError extends DomainError {
  readonly code = 'EMPLOYEE_COUNT_INVALID';
  readonly field = 'employeeCount';

  constructor() {
    super('Number of employees must be a whole number of at least 1.');
  }
}

export class AreaRequiredError extends DomainError {
  readonly code = 'AREA_REQUIRED';
  readonly field = 'areaId';

  constructor() {
    super('Choose an area.');
  }
}

export class CityRequiredError extends DomainError {
  readonly code = 'CITY_REQUIRED';
  readonly field = 'cityId';

  constructor() {
    super('Choose a city.');
  }
}

export class CityNotInAreaError extends DomainError {
  readonly code = 'CITY_NOT_IN_AREA';
  readonly field = 'cityId';

  constructor() {
    super('This city does not belong to the chosen area.');
  }
}

export class CompanyAreaInactiveError extends DomainError {
  readonly code = 'AREA_INACTIVE';
  readonly field = 'areaId';

  constructor() {
    super('Choose an active area.');
  }
}

export class CompanyCityInactiveError extends DomainError {
  readonly code = 'CITY_INACTIVE';
  readonly field = 'cityId';

  constructor() {
    super('Choose an active city.');
  }
}

/** Another company in this workspace already uses this NIPT (Q8). Mapped to 409. */
export class TaxIdTakenError extends DomainError {
  readonly code = 'TAX_ID_TAKEN';
  readonly field = 'taxId';

  constructor() {
    super('Another company already uses this NIPT.');
  }
}

export class EmailInvalidError extends DomainError {
  readonly code = 'EMAIL_INVALID';

  constructor(readonly field: string) {
    super('Enter a valid email address.');
  }
}

export class PhoneInvalidError extends DomainError {
  readonly code = 'PHONE_INVALID';

  constructor(readonly field: string) {
    super('Enter a valid phone number.');
  }
}

export class WebsiteInvalidError extends DomainError {
  readonly code = 'WEBSITE_INVALID';
  readonly field = 'website';

  constructor() {
    super('Enter a valid website address.');
  }
}

/**
 * Coded errors for the Slice 12 contact persons (FR-CMP-04), following the
 * same pattern as the company-profile errors above.
 */

export class ContactNameRequiredError extends DomainError {
  readonly code = 'CONTACT_NAME_REQUIRED';
  readonly field = 'name';

  constructor() {
    super('Enter the contact’s name.');
  }
}

/** A contact needs at least a phone or an email to be reachable by. */
export class ContactReachRequiredError extends DomainError {
  readonly code = 'CONTACT_REACH_REQUIRED';

  constructor() {
    super('Enter a phone number or an email for this contact.');
  }
}

/** A company must be saved with at least one contact (FR-CMP-04). */
export class ContactsRequiredError extends DomainError {
  readonly code = 'CONTACTS_REQUIRED';

  constructor() {
    super('Add at least one contact person.');
  }
}

/** Removing the primary contact, or the last contact, without naming a replacement. */
export class PrimaryContactRequiredError extends DomainError {
  readonly code = 'PRIMARY_CONTACT_REQUIRED';

  constructor() {
    super('Choose which contact becomes primary before removing this one.');
  }
}

export class ContactNotFoundError extends DomainError {
  readonly code = 'CONTACT_NOT_FOUND';

  constructor() {
    super('Contact not found');
  }
}
