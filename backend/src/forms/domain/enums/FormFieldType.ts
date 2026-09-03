/**
 * The data type a form-owned field collects. Deliberately a SUPERSET-shaped
 * mirror of clients/domain/enums/FieldType, not a re-export of it: a form
 * field may exist with NO CustomFieldDefinition at all (spec §11 — a form
 * owns its own fields; a CRM binding is optional, see FieldSpec.clientFieldId
 * on FormDocument). SIGNATURE has no equivalent in FieldType because a
 * signature is stored as an uploaded image asset, never as a client column.
 *
 * Where a value here maps onto a CustomFieldDefinition (TEXT, LONG_TEXT,
 * NUMBER, DATE, BOOLEAN, SINGLE_SELECT, MULTI_SELECT, EMAIL) the two enums
 * are kept in sync by convention, checked in FormDocumentValidator whenever a
 * field carries a clientFieldId.
 */
export enum FormFieldType {
  TEXT = 'TEXT',
  LONG_TEXT = 'LONG_TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
  SINGLE_SELECT = 'SINGLE_SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  EMAIL = 'EMAIL',
  /** No client-record equivalent. Always stored as an uploaded image asset. */
  SIGNATURE = 'SIGNATURE',
  /**
   * The id of a User in the same tenant. Present because the tenant's own
   * "Assigned To" client field is a USER_REFERENCE and the default intake
   * form has rendered it as a people picker since before v3 — degrading it to
   * a plain text box would silently break assignment on every existing
   * workspace. The option list is supplied by the caller at render time, never
   * stored in the document.
   */
  USER_REFERENCE = 'USER_REFERENCE',
}
