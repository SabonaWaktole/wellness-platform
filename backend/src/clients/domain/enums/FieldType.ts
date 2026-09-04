export enum FieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
  /** Letters, digits and spaces only — see Client.create for the value rule. */
  ALPHANUMERIC = 'ALPHANUMERIC',
  /**
   * Free text over several lines. Stored and validated exactly like TEXT — the
   * difference is purely which control renders it (CustomFieldInput's
   * 'multiline' variant), which is why it is a separate type rather than a
   * form-level control variant: the tenant is declaring the shape of the data,
   * not how one form displays it.
   */
  LONG_TEXT = 'LONG_TEXT',
  /** Requires a non-empty `options` list — see CustomFieldDefinition.create. */
  SINGLE_SELECT = 'SINGLE_SELECT',
  /**
   * Like SINGLE_SELECT but the stored value is an ARRAY of chosen options
   * rather than one string. Also requires a non-empty `options` list.
   */
  MULTI_SELECT = 'MULTI_SELECT',
  /** Validated as an email address — see Client.create. */
  EMAIL = 'EMAIL',
  /** Value must be the id of a User in the same tenant — see Client.create. */
  USER_REFERENCE = 'USER_REFERENCE',
}
