/**
 * Which input widget renders a field on this particular form.
 *
 * Deliberately NOT part of FieldType. A radio group stores exactly what a
 * SINGLE_SELECT stores and a checkbox grid stores exactly what a MULTI_SELECT
 * stores — duplicating them as types would split the tenant's data dictionary
 * into pairs with identical semantics, and would break the role/type coupling
 * in CustomFieldDefinition (ROLE_REQUIRED_TYPE pins STATUS to SINGLE_SELECT,
 * so a tenant who chose a radio group could no longer hold the STATUS role).
 *
 * Presentation belongs to the form; storage belongs to the field.
 */
export enum FormControlVariant {
  /** SINGLE_SELECT rendered as a <select>. Default. */
  DROPDOWN = 'DROPDOWN',
  /** SINGLE_SELECT rendered as a radio group. */
  RADIO = 'RADIO',
  /** MULTI_SELECT rendered as a checkbox grid. Default for MULTI_SELECT. */
  CHECKBOX_GROUP = 'CHECKBOX_GROUP',
  /** TEXT rendered as a single-line box. Default for text-ish types. */
  INPUT = 'INPUT',
  /** TEXT/LONG_TEXT rendered as a textarea. */
  TEXTAREA = 'TEXTAREA',
}
