/**
 * What a single free-positioned element inside a section canvas is.
 *
 * FIELD binds to a tenant CustomFieldDefinition and collects a value; IMAGE
 * and TEXT are static content that never reaches customFieldValues.
 *
 * Deliberately just these three. The spec's Add menu offers exactly Section /
 * Input Field / Image (§2, §24 acceptance criteria) — TEXT exists in the type
 * so a v1 (grid-era) HEADING/PARAGRAPH block has somewhere to migrate to on
 * read, and so a future "Add → Text" menu item costs no schema change, but
 * nothing in the builder creates a new TEXT element yet. Divider, Rich Text,
 * Table etc. are explicitly listed as FUTURE element types (§23) — adding them
 * now would be scope the spec itself defers.
 */
export enum FormItemKind {
  FIELD = 'FIELD',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT',
}
