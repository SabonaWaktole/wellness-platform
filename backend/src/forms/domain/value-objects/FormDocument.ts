import { ComponentType, isDataBearingComponent } from '../enums/ComponentType';
import { FormFieldType } from '../enums/FormFieldType';
import { FormItemKind } from '../enums/FormItemKind';
import { FormControlVariant } from '../enums/FormControlVariant';
import { FormLayout, migrateLayoutToV2 } from './FormLayout';

/**
 * The shape stored in ClientForm.layout (a Json column) from v3 onward.
 *
 * A form is a MULTI-PAGE A4 DOCUMENT (spec §5, §6), replacing v2's single
 * elastic page. Everything else about v2's model survives: a page holds
 * absolutely-positioned sections, a section is a canvas holding
 * absolutely-positioned elements, and a section is never allowed to span two
 * pages (spec §7) — see the overflow ladder in layoutOps.ts on the frontend
 * and clampSectionToUsableHeight below, which migration and live editing both
 * call so the two paths cannot disagree about where a section is clipped.
 *
 * TWO LINKED REPRESENTATIONS, ONE DOCUMENT (brief §2, spec §2 and §11) — this
 * is a stated architectural decision, not an implementation detail:
 *
 *   - VISUAL identity: `element.id` (+ `box`, `styles`). Changes on every
 *     duplicate. Drives what renders and prints.
 *   - DATA identity: `field.key` (+ `field.dataType`, `field.validation`,
 *     ...). Stable across every visual edit; a NEW key is minted only when a
 *     component is duplicated (spec §11, §20). Drives what gets validated,
 *     submitted and stored — submissions key off `field.key` pinned to a
 *     FormVersion snapshot, never off geometry, which is exactly why a
 *     redesign cannot reinterpret a historical submission's meaning.
 *
 * These two are never merged into one blob — a pure geometry change (drag,
 * resize, restyle) touches only `box`/`styles` and must produce a
 * byte-identical `field` on every affected element; the reverse holds for a
 * label/validation edit. They are still ONE document, one Json column, one
 * atomic read/write/validate/version/publish unit — splitting storage into
 * two columns/tables would need a transaction on every access of what is
 * always edited as a whole, for no benefit the invariant above needs.
 *
 * `field` is present only on components where
 * `isDataBearingComponent(element.type)` is true (ComponentType.ts) — TEXT,
 * IMAGE and DIVIDER are presentation-only and never carry one.
 *
 * `version` is the shape version of this JSON document (this module is v3 —
 * the A4/multi-page/form-owned-field document), not ClientForm.version (the
 * optimistic-concurrency counter, a separate column). `migrateDocumentToV3`
 * upgrades a v1 or v2 document on READ, same boundary discipline as
 * `migrateLayoutToV2`: every SAVE always writes v3.
 */
export const FORM_DOCUMENT_VERSION = 3;

/** Longest a serialized document may be. 1 MB, up from v2's 256 KB, because a
 *  multi-page document with rich-text content is legitimately larger. */
export const MAX_DOCUMENT_BYTES = 1024 * 1024;

/** Element and section geometry bounds, in page pixels. Unchanged from v2. */
export const MIN_SIZE_PX = 20;
export const MAX_SIZE_PX = 2000;

/** A4 portrait at 96 CSS DPI. 210mm -> 793.7px, 297mm -> 1122.5px, rounded so
 *  px<->mm stays effectively 1:1 when printed (see print.css in Phase 7). */
export const A4_PORTRAIT = { width: 794, height: 1123 } as const;
export const A4_LANDSCAPE = { width: 1123, height: 794 } as const;

export const MIN_PAGE_COUNT = 1;
export const MAX_PAGE_COUNT = 100;

/** Default page margin, in pixels — roughly 12.7mm, a typical document margin. */
export const DEFAULT_MARGIN = { top: 48, right: 48, bottom: 48, left: 48 } as const;

/** Six-digit hex only — unchanged from v2. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

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

/**
 * A minimal rich-text document shape. Fleshed out to a whitelisted
 * node/mark set in Phase 4 (TipTap) — for now this only needs to survive a
 * v2 plain-string TEXT element being wrapped into it and round-trip through
 * save/reload untouched.
 */
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

/**
 * The DATA half of a data-bearing component. See the module doc for why
 * `key` (durable, data identity) is a separate thing from the owning
 * element's `id` (visual identity, replaced on duplicate).
 */
export interface FieldSpec {
  key: string;
  label: string;
  dataType: FormFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: FieldOption[];
  validation?: FieldValidationRules;
  /** Optional binding to a tenant CustomFieldDefinition — see FormDocument.ts
   *  module doc / the "form-owned fields with an optional client binding"
   *  decision. Bound fields also write to the Client record; unbound fields
   *  exist only in FormSubmission.data. */
  clientFieldId?: string;
}

/** A single visual component inside a section canvas. */
export interface FormElement extends Box {
  id: string;
  type: ComponentType;
  locked?: boolean;
  styles?: ElementStyles;
  content?: ElementContent;
  /** Present iff isDataBearingComponent(type). */
  field?: FieldSpec;
}

/** A section is a canvas: a fixed box on its page, holding freely-placed
 *  elements, never spanning more than one page (spec §7). */
export interface FormSection extends Box {
  id: string;
  title?: string;
  titleStyles?: TitleStyles;
  styles?: SectionStyles;
  padding?: number;
  locked?: boolean;
  elements: FormElement[];
}

/** Ids are stable across every edit (spec §6) — insertion, deletion and
 *  reorder never renumber a surviving page's identity. */
export interface DocumentPage {
  id: string;
  sections: FormSection[];
}

export interface FormDocument {
  version: number;
  page: FormPage;
  pages: DocumentPage[];
}

export const emptyPageGeometry = (): FormPage => ({
  format: 'A4',
  orientation: 'portrait',
  width: A4_PORTRAIT.width,
  height: A4_PORTRAIT.height,
  margin: { ...DEFAULT_MARGIN },
});

export const emptyDocument = (): FormDocument => ({
  version: FORM_DOCUMENT_VERSION,
  page: emptyPageGeometry(),
  pages: [{ id: newDocumentId(), sections: [] }],
});

function newDocumentId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** The usable area inside a page's margins — what a section is actually
 *  clamped against. Migration and live editing (frontend layoutOps.ts) both
 *  derive from this so a section can never be clipped to two different
 *  heights depending on which path touched it. */
export const usablePageHeight = (page: FormPage): number =>
  page.height - page.margin.top - page.margin.bottom;

export const usablePageWidth = (page: FormPage): number =>
  page.width - page.margin.left - page.margin.right;

/** Every FieldSpec in the document, flattened across every page and section. */
export const fieldSpecsOf = (doc: FormDocument): FieldSpec[] =>
  doc.pages.flatMap((page) =>
    page.sections.flatMap((section) =>
      section.elements
        .filter((el): el is FormElement & { field: FieldSpec } => el.field !== undefined)
        .map((el) => el.field)
    )
  );

/** Every element in the document, flattened, alongside the page/section it
 *  lives on — used by the validator and by bulk lookups. */
export const elementsOf = (doc: FormDocument): FormElement[] =>
  doc.pages.flatMap((page) => page.sections.flatMap((section) => section.elements));

/**
 * Fits a section inside one usable A4 page area — both axes, and position as
 * well as size.
 *
 * Deliberately the ONE place that answers "how big, and where, can a section
 * be": migration (below) and the frontend's live overflow ladder both derive
 * from it, so a section clipped during a v2->v3 migration and a section that
 * hits the same limit while being resized in the builder get the identical
 * answer, never two different ones.
 *
 * Width matters as much as height, and for a sharper reason than it looks:
 * v2 pages were up to 900px wide, so real forms carry sections up to ~832px —
 * comfortably wider than A4's 698px usable width. Clamping only the height
 * (as the first cut of this function did) produced documents that READ back
 * fine but were UNSAVEABLE, because FormDocumentValidator refuses a section
 * wider than the page. Migration has to land inside the very bounds that
 * guard saves.
 */
export const clampSectionToUsableArea = <
  T extends { x: number; y: number; width: number; height: number }
>(
  section: T,
  page: FormPage
): T => {
  const width = Math.min(section.width, usablePageWidth(page));
  const height = Math.min(section.height, usablePageHeight(page));
  const maxX = page.width - page.margin.right - width;
  const maxY = page.height - page.margin.bottom - height;

  return {
    ...section,
    width,
    height,
    x: Math.max(page.margin.left, Math.min(section.x, Math.max(page.margin.left, maxX))),
    y: Math.max(page.margin.top, Math.min(section.y, Math.max(page.margin.top, maxY))),
  };
};

/** Height-only variant, kept for callers that only ever grow vertically. */
export const clampSectionToUsableHeight = <T extends { height: number }>(
  section: T,
  page: FormPage
): T => {
  const max = usablePageHeight(page);
  return section.height > max ? { ...section, height: max } : section;
};

/** Keeps an element inside its (possibly clamped) section, horizontally. */
const clampElementToSectionWidth = (element: FormElement, sectionWidth: number): FormElement => {
  const width = Math.min(element.width, sectionWidth);
  const x = Math.max(0, Math.min(element.x, sectionWidth - width));
  return width === element.width && x === element.x ? element : { ...element, width, x };
};

// ---------------------------------------------------------------------------
// Field key generation
// ---------------------------------------------------------------------------

/**
 * Slugifies a label into a `snake_case` key and de-duplicates it against
 * every key already minted in this call — the same guarantee
 * FormDocumentValidator enforces at save time (a key unique within the
 * document), so migration can never itself produce two colliding keys.
 */
export class FieldKeyGenerator {
  private used = new Set<string>();

  constructor(seed: Iterable<string> = []) {
    for (const key of seed) this.used.add(key);
  }

  generate(seedLabel: string | undefined, fallbackSeed: string): string {
    const base = slugify(seedLabel?.trim() ? seedLabel : `field_${fallbackSeed}`);
    let candidate = base || `field_${fallbackSeed}`;
    let n = 2;
    while (this.used.has(candidate)) {
      candidate = `${base}_${n}`;
      n += 1;
    }
    this.used.add(candidate);
    return candidate;
  }
}

/**
 * A field key derived from a human-readable name.
 *
 * Submissions are stored as `{ [field.key]: value }` and are meant to be
 * readable by API consumers and analytics (spec §27 shows `company_name`,
 * `employee_count`). Seeding a key from a definition's UUID — as the first
 * cut of the seeder and the unplaced-rescue did — produced submission objects
 * keyed by opaque ids, which is exactly what §27 rules out.
 */
export const fieldKeyFromName = (name: string, fallback: string): string =>
  slugify(name) || `field_${slugify(fallback)}`;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// v1/v2 -> v3 migration
//
// Runs on READ (repository boundary), never on write — every save always
// produces v3. v1 documents are migrated to v2 first by the existing
// migrateLayoutToV2 (its own v1-detection logic is left untouched), then
// upgraded to v3 here, so this module only ever has to understand the v2
// shape.
// ---------------------------------------------------------------------------

const CONTROL_TO_COMPONENT: Record<FormControlVariant, ComponentType> = {
  [FormControlVariant.DROPDOWN]: ComponentType.DROPDOWN,
  [FormControlVariant.RADIO]: ComponentType.RADIO_GROUP,
  [FormControlVariant.CHECKBOX_GROUP]: ComponentType.CHECKBOX_GROUP,
  [FormControlVariant.INPUT]: ComponentType.INPUT,
  [FormControlVariant.TEXTAREA]: ComponentType.TEXTAREA,
};

const CONTROL_TO_DATA_TYPE: Record<FormControlVariant, FormFieldType> = {
  [FormControlVariant.DROPDOWN]: FormFieldType.SINGLE_SELECT,
  [FormControlVariant.RADIO]: FormFieldType.SINGLE_SELECT,
  [FormControlVariant.CHECKBOX_GROUP]: FormFieldType.MULTI_SELECT,
  [FormControlVariant.INPUT]: FormFieldType.TEXT,
  [FormControlVariant.TEXTAREA]: FormFieldType.LONG_TEXT,
};

function wrapPlainTextAsRichTextDoc(text: string): RichTextDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  };
}

/**
 * A v2 FIELD element carries no dataType/required/options of its own — those
 * live on the CustomFieldDefinition it points at, which this pure function
 * (no repository access, per the domain layer's framework-independence rule)
 * cannot read. It produces a safe, best-effort FieldSpec from what the v2
 * layout itself contains; GetClientFormUseCase already reconciles every
 * form's fields against the tenant's live definitions on every read (orphan
 * drop, unplaced rescue) and is extended, in the same pass, to overwrite
 * dataType/required/options/label from the live definition whenever
 * `clientFieldId` still resolves. A field whose definition was since deleted
 * simply keeps its migrated best-effort shape and becomes a plain unbound
 * form field — never dropped, per the "optional client binding" decision.
 */
function migrateFieldElement(
  el: Extract<import('./FormLayout').FormElement, { kind: FormItemKind.FIELD }>,
  keyGen: FieldKeyGenerator
): { type: ComponentType; field: FieldSpec } {
  const type = el.control ? CONTROL_TO_COMPONENT[el.control] : ComponentType.INPUT;
  const dataType = el.control ? CONTROL_TO_DATA_TYPE[el.control] : FormFieldType.TEXT;
  const key = keyGen.generate(el.label, el.id);

  return {
    type,
    field: {
      key,
      label: el.label?.trim() || 'Field',
      dataType,
      required: el.requiredOverride === true,
      placeholder: el.placeholder,
      clientFieldId: el.fieldId,
    },
  };
}

function migrateElement(
  el: import('./FormLayout').FormElement,
  keyGen: FieldKeyGenerator
): FormElement {
  const base: Box = { x: el.x, y: el.y, width: el.width, height: el.height };

  switch (el.kind) {
    case FormItemKind.FIELD: {
      const { type, field } = migrateFieldElement(el, keyGen);
      const styles = el.styles
        ? {
            textColor: el.styles.textColor,
            labelColor: el.styles.labelColor,
            background: el.styles.background,
            borderColor: el.styles.borderColor,
            fontSize: el.styles.fontSize,
          }
        : undefined;
      return { id: el.id, type, ...base, styles, field };
    }
    case FormItemKind.IMAGE:
      return {
        id: el.id,
        type: ComponentType.IMAGE,
        ...base,
        content: { url: el.url, alt: el.alt },
      };
    case FormItemKind.TEXT:
    default:
      return {
        id: el.id,
        type: ComponentType.TEXT,
        ...base,
        styles: el.styles ? { textColor: el.styles.color, fontSize: el.styles.fontSize, align: el.styles.align } : undefined,
        content: wrapPlainTextAsRichTextDoc((el as { text?: string }).text ?? ''),
      };
  }
}

export function migrateDocumentToV3(raw: unknown): FormDocument {
  if (!raw || typeof raw !== 'object') return emptyDocument();
  const candidate = raw as { version?: number };

  if (candidate.version === FORM_DOCUMENT_VERSION) {
    const doc = raw as FormDocument;
    if (!doc.page || !Array.isArray(doc.pages)) return emptyDocument();
    return doc;
  }

  // Anything else (v1, v2, or malformed) goes through the v2 normalizer
  // first — tolerant on purpose, same stance the rest of this module takes.
  const v2 = migrateLayoutToV2(raw);

  const targetPage = emptyPageGeometry();
  const usableHeight = usablePageHeight(targetPage);
  const keyGen = new FieldKeyGenerator();

  // Slice the single elastic v2 page into A4 pages by section y, in
  // ascending y order so pages come out ordered top-to-bottom regardless of
  // the input's array order.
  const orderedSections = [...v2.sections].sort((a, b) => a.y - b.y);

  const pageCount = orderedSections.length
    ? Math.max(1, Math.floor(Math.max(...orderedSections.map((s) => s.y)) / A4_PORTRAIT.height) + 1)
    : 1;

  const pages: DocumentPage[] = Array.from({ length: pageCount }, () => ({
    id: newDocumentId(),
    sections: [],
  }));

  for (const section of orderedSections) {
    const pageIndex = Math.min(pageCount - 1, Math.floor(section.y / A4_PORTRAIT.height));
    const localY = section.y - pageIndex * A4_PORTRAIT.height;

    const clamped = clampSectionToUsableArea(
      {
        id: section.id,
        title: section.title,
        titleStyles: section.titleStyles,
        styles: section.styles,
        x: section.x,
        y: Math.max(0, Math.min(localY, usableHeight)),
        width: section.width,
        height: section.height,
        elements: section.elements.map((el) => migrateElement(el, keyGen)),
      },
      targetPage
    );

    // A narrowed section must not leave its own elements hanging outside it —
    // the validator checks the section against the page, and the renderer
    // clips at the section edge, so an element left at x=700 inside a section
    // now 698 wide would simply vanish.
    pages[pageIndex].sections.push({
      ...clamped,
      elements: clamped.elements.map((el) => clampElementToSectionWidth(el, clamped.width)),
    });
  }

  return {
    version: FORM_DOCUMENT_VERSION,
    page: targetPage,
    pages,
  };
}
