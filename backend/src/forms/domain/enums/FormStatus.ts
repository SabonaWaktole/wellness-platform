/**
 * Lifecycle of a ClientForm. Stored as a plain String column for the same
 * reason FieldType is — the authoritative list lives here, and adding a value
 * costs no migration on either provider.
 */
export enum FormStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}
