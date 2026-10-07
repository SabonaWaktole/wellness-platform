/** Why an employee upload is refused, with a stable code the screen can translate (FR-EMP-01, FR-EMP-03, Q9). */
export type EmployeeImportRefusal =
  | 'NO_VALID_CONTRACT'
  | 'COMPANY_NOT_FOUND'
  | 'NO_FILE'
  | 'NOT_XLSX'
  | 'HAS_MACROS'
  | 'TOO_LARGE'
  | 'TOO_MANY_ROWS'
  | 'MISSING_COLUMNS'
  | 'EMPTY_FILE'
  | 'ALREADY_CONFIRMED'
  | 'EXPIRED'
  | 'BAD_TOKEN';

export class EmployeeImportRefusedError extends Error {
  readonly code = 'EMPLOYEE_IMPORT_REFUSED';
  constructor(
    readonly reason: EmployeeImportRefusal,
    message: string
  ) {
    super(message);
  }
}

export class EmployeeImportNotFoundError extends Error {
  readonly code = 'EMPLOYEE_IMPORT_NOT_FOUND';
  constructor() {
    super('Employee upload not found.');
  }
}
