import { FormItemKind } from '../enums/FormItemKind';
import { FormControlVariant } from '../enums/FormControlVariant';

/**
 * LEGACY (v2). No longer written, and no longer the shape stored in
 * ClientForm.layout — that is FormDocument.ts (v3) now. This module survives
 * for exactly one reason: `migrateLayoutToV2` is the first half of the
 * v1/v2 -> v3 upgrade that `migrateDocumentToV3` runs on READ, so the v2
 * types are still needed to describe its own input and output. Nothing in
 * the application, interface or infrastructure layers should import from
 * here; import FormDocument.ts instead.
 *
 * The original v2 documentation follows.
 *
 * The shape stored in ClientForm.layout (a Json column).
 *
 * A form is a PAGE. A section is a fixed-size CANVAS positioned on that page;
 * elements (fields, images, text) are positioned inside their section, freely
 * and absolutely — this is §16 of the spec ("A section should NOT simply be a
 * list of fields... it should behave as a canvas/container") and is the whole
 * reason v1's column-flow layout was replaced.
 *
 * Sections and elements are NOT tables, for the same reason v1 wasn't:
 * presentation metadata (colours, font size, alignment) churns constantly, and
 * every new knob would otherwise cost a Postgres migration folder AND a
 * hand-written MySQL script, because schema.mysql.prisma is maintained by
 * hand. `options`, `customFieldValues` and this column are all Json for that
 * reason.
 *
 * The price is no foreign key from an element to its CustomFieldDefinition.
 * That is absorbed on read: the read model resolves every `fieldId` against
 * the tenant's live definitions and drops the ones that no longer exist —
 * the same tolerance ClientFieldResolver already has for a deleted roled
 * field.
 *
 * `version` is the shape version of this JSON document, not the optimistic
 * concurrency counter — that is ClientForm.version, a separate column.
 * v1 was the grid/column layout; this module is v2, the canvas layout.
 * `migrateLayoutToV2` upgrades a v1 document on read so forms saved before
 * this change keep opening instead of rendering blank.
 */
export const FORM_LAYOUT_VERSION = 2;

/** Longest a serialized layout may be. Guards the Json column and the wire. */
export const MAX_LAYOUT_BYTES = 256 * 1024;

/** Element and section geometry bounds, in page pixels. */
export const MIN_SIZE_PX = 20;
export const MAX_SIZE_PX = 2000;
export const MIN_PAGE_WIDTH_PX = 320;
export const MAX_PAGE_WIDTH_PX = 2000;
export const MIN_PAGE_HEIGHT_PX = 200;
export const MAX_PAGE_HEIGHT_PX = 20000;

/** Default page — an A4-ish document width, the spec's "blank page". */
export const DEFAULT_PAGE_WIDTH = 900;
export const DEFAULT_PAGE_HEIGHT = 1200;

/** Six-digit hex only. Shorthand and named colours are rejected so the
 *  frontend never has to normalise before computing contrast. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FormPage {
  width: number;
  height: number;
  background?: string;
}

export interface FieldElementStyles {
  textColor?: string;
  labelColor?: string;
  background?: string;
  borderColor?: string;
  fontSize?: number;
}

export interface FormFieldElement extends Box {
  id: string;
  kind: FormItemKind.FIELD;
  /** CustomFieldDefinition.id. May appear at most once per form. */
  fieldId: string;
  control?: FormControlVariant;
  /** Overrides the definition's fieldName as the visible label. */
  label?: string;
  placeholder?: string;
  /**
   * May only tighten. A form cannot relax a definition the tenant marked
   * required, because Client.create validates against the definition and
   * would reject the submission anyway.
   */
  requiredOverride?: true;
  styles?: FieldElementStyles;
}

export interface FormImageElement extends Box {
  id: string;
  kind: FormItemKind.IMAGE;
  url: string;
  alt?: string;
}

export interface TextElementStyles {
  color?: string;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
}

/**
 * Static text. Not reachable from the current Add menu (§2/§24 offer only
 * Section / Input Field / Image) — this exists so a v1 HEADING/PARAGRAPH/
 * DIVIDER block has somewhere to land when an old layout is migrated forward,
 * per the generic-element architecture §22/§23 asks for.
 */
export interface FormTextElement extends Box {
  id: string;
  kind: FormItemKind.TEXT;
  text: string;
  styles?: TextElementStyles;
}

export type FormElement = FormFieldElement | FormImageElement | FormTextElement;

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

/** A section is a canvas: a fixed box on the page, positioned and resized
 *  independently, holding freely-placed elements (§3, §16). */
export interface FormSection extends Box {
  id: string;
  title: string;
  titleStyles?: TitleStyles;
  styles?: SectionStyles;
  elements: FormElement[];
}

export interface FormLayout {
  version: number;
  page: FormPage;
  sections: FormSection[];
}

export const emptyLayout = (): FormLayout => ({
  version: FORM_LAYOUT_VERSION,
  page: { width: DEFAULT_PAGE_WIDTH, height: DEFAULT_PAGE_HEIGHT },
  sections: [],
});

/** Every FIELD element in the layout, flattened across sections. */
export const fieldElementsOf = (layout: FormLayout): FormFieldElement[] =>
  layout.sections.flatMap(section =>
    section.elements.filter((el): el is FormFieldElement => el.kind === FormItemKind.FIELD)
  );

/** Ids of the definitions this layout places. */
export const placedFieldIds = (layout: FormLayout): string[] =>
  fieldElementsOf(layout).map(el => el.fieldId);

// ---------------------------------------------------------------------------
// v1 → v2 migration
//
// v1 laid a section out as 1 or 2 flowing columns of items (colSpan, no
// coordinates). Forms saved before this change must keep opening — a blank
// canvas where a business owner's form used to be is a worse failure than an
// imperfectly-reflowed one. Migration runs on READ (GetClientFormUseCase),
// never on write: every save always produces v2.
// ---------------------------------------------------------------------------

interface V1Item {
  id: string;
  kind: string;
  fieldId?: string;
  control?: FormControlVariant;
  label?: string;
  placeholder?: string;
  helpText?: string;
  colSpan?: 1 | 2;
  widthPx?: number;
  accentHex?: string;
  requiredOverride?: true;
  url?: string;
  alt?: string;
  align?: 'left' | 'center' | 'right';
  text?: string;
  level?: 2 | 3;
  heightPx?: number;
}

interface V1Section {
  id: string;
  title: string;
  subtitle?: string;
  columns: 1 | 2;
  items: V1Item[];
}

interface V1Layout {
  version: number;
  sections: V1Section[];
}

const V1_ROW_HEIGHT = 76;
const V1_SECTION_PADDING = 16;
const V1_COLUMN_WIDTH = 400;
const V1_SECTION_GAP = 32;

/**
 * Lays a v1 section's items out top-to-bottom, honouring `colSpan` the same
 * way the old CSS grid did: a colSpan-2 item takes its own full-width row,
 * everything else pairs up two-per-row (or stacks one-per-row in a
 * `columns: 1` section). This is a best-effort reflow, not a byte-for-byte
 * reproduction — free positioning has no CSS grid equivalent to fall back to,
 * so "looks close to how it used to" is the bar, not "pixel identical".
 */
function layoutV1Items(section: V1Section): { elements: FormElement[]; height: number } {
  const elements: FormElement[] = [];
  let cursorY = V1_SECTION_PADDING;
  let pendingHalfWidth: V1Item | null = null;

  const placeRow = (items: V1Item[], rowY: number, colWidth: number) => {
    items.forEach((item, index) => {
      const el = migrateV1Item(item, V1_SECTION_PADDING + index * (colWidth + V1_SECTION_PADDING), rowY, colWidth);
      if (el) elements.push(el);
    });
  };

  for (const item of section.items) {
    const spansFull = section.columns === 1 || item.colSpan === 2;

    if (spansFull) {
      if (pendingHalfWidth) {
        placeRow([pendingHalfWidth], cursorY, V1_COLUMN_WIDTH);
        cursorY += V1_ROW_HEIGHT;
        pendingHalfWidth = null;
      }
      placeRow([item], cursorY, V1_COLUMN_WIDTH * 2 + V1_SECTION_PADDING);
      cursorY += V1_ROW_HEIGHT;
    } else if (pendingHalfWidth) {
      placeRow([pendingHalfWidth, item], cursorY, V1_COLUMN_WIDTH);
      cursorY += V1_ROW_HEIGHT;
      pendingHalfWidth = null;
    } else {
      pendingHalfWidth = item;
    }
  }
  if (pendingHalfWidth) {
    placeRow([pendingHalfWidth], cursorY, V1_COLUMN_WIDTH);
    cursorY += V1_ROW_HEIGHT;
  }

  return { elements, height: cursorY + V1_SECTION_PADDING };
}

function migrateV1Item(item: V1Item, x: number, y: number, width: number): FormElement | null {
  const height = item.kind === 'SPACER' ? 0 : V1_ROW_HEIGHT - 16;

  switch (item.kind) {
    case 'FIELD':
      return {
        id: item.id,
        kind: FormItemKind.FIELD,
        fieldId: item.fieldId!,
        control: item.control,
        label: item.label,
        placeholder: item.placeholder,
        requiredOverride: item.requiredOverride,
        x, y, width, height,
        styles: item.accentHex ? { borderColor: item.accentHex } : undefined,
      };
    case 'IMAGE':
      return { id: item.id, kind: FormItemKind.IMAGE, url: item.url!, alt: item.alt, x, y, width, height };
    case 'HEADING':
      return {
        id: item.id,
        kind: FormItemKind.TEXT,
        text: item.text ?? '',
        x, y, width, height,
        styles: { fontSize: item.level === 2 ? 20 : 16 },
      };
    case 'PARAGRAPH':
      return { id: item.id, kind: FormItemKind.TEXT, text: item.text ?? '', x, y, width, height };
    case 'DIVIDER':
      // Represented as a thin bordered text element rather than dropped
      // silently — a divider the owner placed is content, even if the current
      // Add menu has no way to create a new one (Divider is future-scope, §23).
      return {
        id: item.id,
        kind: FormItemKind.TEXT,
        text: '',
        x, y, width, height: 2,
        styles: undefined,
      };
    case 'SPACER':
      // No flow to preserve a gap in — absolute positions already encode
      // whatever spacing followed. Dropped rather than migrated to an
      // invisible element that would just clutter the layer list.
      return null;
    default:
      return null;
  }
}

export function migrateLayoutToV2(raw: unknown): FormLayout {
  if (!raw || typeof raw !== 'object') return emptyLayout();
  const candidate = raw as { version?: number };

  if (candidate.version === FORM_LAYOUT_VERSION) {
    const layout = raw as FormLayout;
    if (!layout.page || !Array.isArray(layout.sections)) return emptyLayout();
    return layout;
  }

  // Anything else (version 1, or missing/malformed) is treated as v1 —
  // tolerant on purpose, the same stance PrismaClientFormRepository already
  // takes for a layout that fails to parse at all.
  const v1 = raw as Partial<V1Layout>;
  const sections = Array.isArray(v1.sections) ? v1.sections : [];

  let cursorY = V1_SECTION_GAP;
  const migratedSections: FormSection[] = sections.map((section) => {
    const { elements, height } = layoutV1Items(section);
    const migrated: FormSection = {
      id: section.id,
      title: section.title,
      elements,
      x: V1_SECTION_GAP,
      y: cursorY,
      width: V1_COLUMN_WIDTH * 2 + V1_SECTION_PADDING * 2,
      height,
    };
    cursorY += height + V1_SECTION_GAP;
    return migrated;
  });

  return {
    version: FORM_LAYOUT_VERSION,
    page: {
      width: V1_COLUMN_WIDTH * 2 + V1_SECTION_PADDING * 2 + V1_SECTION_GAP * 2,
      height: Math.max(DEFAULT_PAGE_HEIGHT, cursorY + V1_SECTION_GAP),
    },
    sections: migratedSections,
  };
}
