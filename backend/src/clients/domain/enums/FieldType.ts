export enum FieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
  /** Letters, digits and spaces only — see Client.create for the value rule. */
  ALPHANUMERIC = 'ALPHANUMERIC',
  /** Requires a non-empty `options` list — see CustomFieldDefinition.create. */
  SINGLE_SELECT = 'SINGLE_SELECT',
  /** Validated as an email address — see Client.create. */
  EMAIL = 'EMAIL',
  /** Value must be the id of a User in the same tenant — see Client.create. */
  USER_REFERENCE = 'USER_REFERENCE',
}
