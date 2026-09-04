/**
 * Every visual component a section canvas can hold. An OPEN registry, not a
 * closed switch — the frontend's componentRegistry.ts has one entry per
 * value here (brief §4, spec §36: tables, file upload, phone/currency,
 * ratings etc. must be addable later without a foundational rewrite).
 *
 * TEXT, IMAGE and DIVIDER are presentation-only and never carry a `field`.
 * Every other value is data-bearing and always carries a `field: FieldSpec`
 * on its FormElement (see FormDocument.ts) — the visual/data split is
 * enforced by which of these two groups a type falls into, not by an
 * `element.field` that's sometimes present sometimes not for the same type.
 */
export enum ComponentType {
  // Presentation-only — no FieldSpec.
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  DIVIDER = 'DIVIDER',

  // Data-bearing — always paired with a FieldSpec.
  INPUT = 'INPUT',
  TEXTAREA = 'TEXTAREA',
  CHECKBOX_GROUP = 'CHECKBOX_GROUP',
  RADIO_GROUP = 'RADIO_GROUP',
  DROPDOWN = 'DROPDOWN',
  DATE = 'DATE',
  SIGNATURE = 'SIGNATURE',
  /** People picker for a USER_REFERENCE field. */
  USER_SELECT = 'USER_SELECT',
}

export const PRESENTATION_ONLY_COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set([
  ComponentType.TEXT,
  ComponentType.IMAGE,
  ComponentType.DIVIDER,
]);

export const isDataBearingComponent = (type: ComponentType): boolean =>
  !PRESENTATION_ONLY_COMPONENT_TYPES.has(type);
