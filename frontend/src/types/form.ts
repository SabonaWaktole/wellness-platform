import type { CustomFieldDefinition } from './client';

/**
 * Mirrors backend src/forms/domain/value-objects/FormDocument.ts (v3).
 *
 * A form is a MULTI-PAGE A4 DOCUMENT. A page holds absolutely-positioned
 * sections; a section is a canvas holding absolutely-positioned elements; a
 * section NEVER spans two pages (spec §7).
 *
 * TWO LINKED REPRESENTATIONS, ONE DOCUMENT — every component carries two
 * disjoint sub-objects:
 *   - VISUAL identity: `id` + box + `styles`. Replaced on duplicate.
 *   - DATA identity:   `field.key` + dataType/validation. Stable across every
 *     visual edit; a NEW key is minted only on duplicate (§11, §20).
 * A pure geometry change must never touch `field`, and vice versa.
 */

/** Presentation-only types never carry a `field`; every other type always does. */
export type ComponentType =
  | 'TEXT'
  | 'IMAGE'
  | 'DIVIDER'
  | 'INPUT'
  | 'TEXTAREA'
  | 'CHECKBOX_GROUP'
  | 'RADIO_GROUP'
  | 'DROPDOWN'
  | 'DATE'
  | 'SIGNATURE'
  /** People picker for a USER_REFERENCE field. */
  | 'USER_SELECT';

export const PRESENTATION_ONLY_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>([
  'TEXT',
  'IMAGE',
  'DIVIDER',
]);

export const isDataBearing = (type: ComponentType): boolean =>
  !PRESENTATION_ONLY_TYPES.has(type);

export type FormFieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'BOOLEAN'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'EMAIL'
  | 'SIGNATURE'
  /** Id of a User in the tenant. Options are supplied at render time. */
  | 'USER_REFERENCE';

/** A4 portrait at 96 CSS DPI. The px->mm print mapping is applied by print.css. */
export const A4_PORTRAIT = { width: 794, height: 1123 } as const;
export const A4_LANDSCAPE = { width: 1123, height: 794 } as const;
export const DEFAULT_MARGIN = { top: 48, right: 48, bottom: 48, left: 48 } as const;

export const MIN_SIZE_PX = 20;
export const MAX_SIZE_PX = 2000;
export const MAX_PAGE_COUNT = 100;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FormPage {
  format: 'A4';
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  margin: Margin;
  background?: string;
}

export interface ElementStyles {
  textColor?: string;
  labelColor?: string;
  background?: string;
  borderColor?: string;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
}

export interface SectionStyles {
  background?: string;
  borderColor?: string;
  radius?: number;
}

export interface TitleStyles {
  fontSize?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** Fleshed out to the TipTap node/mark set in Phase 4. */
export interface RichTextDoc {
  type: 'doc';
  content: unknown[];
}

export interface ImageContent {
  url: string;
  alt?: string;
}

export interface DividerContent {
  orientation: 'horizontal' | 'vertical';
  thickness: number;
}

export type ElementContent = RichTextDoc | ImageContent | DividerContent;

export interface FieldValidationRules {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
}

export interface FieldOption {
  /** Stable even when `label` is edited (spec §15). */
  value: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  dataType: FormFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: FieldOption[];
  validation?: FieldValidationRules;
  /** Optional binding to a tenant CustomFieldDefinition. Bound fields also
   *  write to the Client record; unbound fields live only in the submission. */
  clientFieldId?: string;
}

export interface FormElement extends Box {
  id: string;
  type: ComponentType;
  locked?: boolean;
  styles?: ElementStyles;
  content?: ElementContent;
  /** Present iff isDataBearing(type). */
  field?: FieldSpec;
}

export interface FormSection extends Box {
  id: string;
  title?: string;
  titleStyles?: TitleStyles;
  styles?: SectionStyles;
  padding?: number;
  locked?: boolean;
  elements: FormElement[];
}

/** Ids are stable across every edit (spec §6) — insert/delete/reorder never
 *  renumber a surviving page's identity, so submissions stay traceable. */
export interface DocumentPage {
  id: string;
  sections: FormSection[];
}

export interface FormDocument {
  version: number;
  page: FormPage;
  pages: DocumentPage[];
}

export type FormStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/**
 * What GET /forms/:id returns: the document already reconciled against the
 * live definitions (dangling bindings cleared, unplaced fields rescued onto a
 * synthetic trailing page) plus those definitions.
 */
export interface ClientFormResponse {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  status: FormStatus;
  /** Optimistic concurrency token — send it back with the next save. */
  version: number;
  layout: FormDocument;
  definitions: CustomFieldDefinition[];
  unplacedFieldIds: string[];
  updatedAt: string;
  shareToken: string | null;
  publishedVersionId: string | null;
  /** True once the draft has changed since the last publish — see the
   *  backend `ClientForm.hasUnpublishedChanges()` doc for how this is
   *  computed (a version-counter comparison, never a document diff). */
  hasUnpublishedChanges: boolean;
}

/** The summary shape returned by GET /forms — no layout/definitions payload. */
export interface ClientFormSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  status: FormStatus;
  version: number;
  updatedAt: string;
  shareToken: string | null;
  publishedVersionId: string | null;
  hasUnpublishedChanges: boolean;
}

/** One row of GET /forms/:id/versions — no document payload, that is the
 *  "view" action's job (`FormVersionDetail`). */
export interface FormVersionSummary {
  id: string;
  versionNumber: number;
  publishedAt: string;
  publishedByUserId: string | null;
}

export interface FormVersionDetail extends FormVersionSummary {
  document: FormDocument;
}

/** What GET /public/forms/:token returns — the published snapshot only,
 *  never the mutable draft. */
export interface PublicFormView {
  formId: string;
  formName: string;
  formDescription: string | null;
  document: FormDocument;
  successMessage: string | null;
}

/** One row of GET /forms/:id/submissions. */
export interface FormSubmissionSummary {
  id: string;
  submittedAt: string;
  clientId: string | null;
  source: 'PUBLIC_LINK' | 'INTERNAL';
}

/** GET /forms/:id/submissions/:submissionId — rendered against the EXACT
 *  version the submission was filled against, never the form's current one. */
export interface FormSubmissionDetail extends FormSubmissionSummary {
  data: Record<string, unknown>;
  version: FormVersionSummary;
  document: FormDocument;
}

/** Synthetic read-model artefacts — never saved back. */
export const UNPLACED_SECTION_ID = 'unplaced';
export const UNPLACED_PAGE_ID = 'unplaced-page';

export const usablePageHeight = (page: FormPage): number =>
  page.height - page.margin.top - page.margin.bottom;

export const usablePageWidth = (page: FormPage): number =>
  page.width - page.margin.left - page.margin.right;

export const emptyPageGeometry = (): FormPage => ({
  format: 'A4',
  orientation: 'portrait',
  width: A4_PORTRAIT.width,
  height: A4_PORTRAIT.height,
  margin: { ...DEFAULT_MARGIN },
});
