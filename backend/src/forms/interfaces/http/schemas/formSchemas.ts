import { z } from 'zod';
import { ComponentType, PRESENTATION_ONLY_COMPONENT_TYPES } from '../../../domain/enums/ComponentType';
import { FormFieldType } from '../../../domain/enums/FormFieldType';
import {
  HEX_COLOR_PATTERN,
  MIN_SIZE_PX,
  MAX_SIZE_PX,
  MIN_PAGE_COUNT,
  MAX_PAGE_COUNT,
  FORM_DOCUMENT_VERSION,
} from '../../../domain/value-objects/FormDocument';

/*
 * Shape validation only.
 *
 * Everything that needs the tenant's live field definitions — does a
 * clientFieldId exist, is it bound twice, is a required definition missing,
 * can this component render this dataType — lives in FormDocumentValidator
 * instead. Zod runs at the HTTP edge with no repository in reach, so
 * splitting the two is not duplication: they check genuinely different
 * things.
 */

const elementId = z.string().trim().min(1).max(100);
const hexColor = z.string().regex(HEX_COLOR_PATTERN, 'Use a six-digit hex colour like #1d4ed8');
const coordinate = z.number().finite();
const dimension = z.number().finite().min(MIN_SIZE_PX).max(MAX_SIZE_PX);

const boxSchema = {
  x: coordinate,
  y: coordinate,
  width: dimension,
  height: dimension,
};

const stylesSchema = z
  .object({
    textColor: hexColor.optional(),
    labelColor: hexColor.optional(),
    background: hexColor.optional(),
    borderColor: hexColor.optional(),
    fontSize: z.number().finite().min(8).max(72).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
  })
  .optional();

const fieldValidationSchema = z
  .object({
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    pattern: z.string().trim().max(200).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    minDate: z.string().trim().max(40).optional(),
    maxDate: z.string().trim().max(40).optional(),
  })
  .optional();

const fieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
});

const fieldSpecSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  dataType: z.nativeEnum(FormFieldType),
  required: z.boolean(),
  placeholder: z.string().trim().max(200).optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(fieldOptionSchema).max(200).optional(),
  validation: fieldValidationSchema,
  // A plain id, not `.uuid()` — the real check (does this resolve to one of
  // THIS tenant's live definitions, is it bound only once) lives in
  // FormDocumentValidator, which is strictly stronger than a format check.
  clientFieldId: z.string().trim().min(1).max(100).optional(),
});

/**
 * The rich-text document (spec §10, Phase 4 — TipTap).
 *
 * A WHITELIST of exactly the node/mark set the editor
 * (frontend registry/RichTextEditor.tsx, built on `@tiptap/starter-kit`
 * trimmed to this same set) can produce. Never raw HTML, never an open
 * schema — this is reader-supplied, recursively-structured content, the
 * highest-risk surface in the whole document for something to sneak past
 * validation into what every viewer's browser renders.
 *
 * `z.lazy` is what makes this recursive (a list item contains paragraphs,
 * a paragraph contains text) without TypeScript trying to resolve an
 * infinite type. The depth cap is a denial-of-service guard, not a UI
 * limit — the editor's own toolbar cannot produce anything near it.
 */
const RICH_TEXT_MAX_DEPTH = 40;
const TEXT_ALIGN_VALUES = ['left', 'center', 'right', 'justify'] as const;

/** `fontSize`/`lineHeight` are free-form strings (e.g. `'18px'`, `'1.5'`)
 *  bound by length rather than a fixed enum, matching how the editor's font
 *  size / line height controls actually populate them. */
const cssMeasure = z.string().trim().min(1).max(16);

/**
 * Every field here is `.nullable().optional()`, not just `.optional()`.
 * TipTap registers these as global attributes with `default: null`, and
 * ProseMirror's `getJSON()` always serialises a registered attribute with
 * its current value — `null` when unset, never an omitted key. A schema
 * that only allows the key to be absent (plain `.optional()`) rejects the
 * document any real edit produces the moment a SECOND textStyle attribute
 * (e.g. only `color` set) is applied, since the other three still appear
 * as explicit `null`. Confirmed against a live editor session where this
 * exact shape failed autosave.
 */
const textStyleAttrs = z
  .object({
    color: hexColor.nullable().optional(),
    backgroundColor: hexColor.nullable().optional(),
    fontFamily: z.string().trim().min(1).max(60).nullable().optional(),
    fontSize: cssMeasure.nullable().optional(),
  })
  .strict();

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z.object({ type: z.literal('strike') }).strict(),
  z.object({ type: z.literal('underline') }).strict(),
  z.object({ type: z.literal('textStyle'), attrs: textStyleAttrs.optional() }).strict(),
]);

// Same null-vs-optional reasoning as textStyleAttrs above: TipTap's
// LineHeight/TextAlign extensions register these on paragraph/heading with
// `default: null`, so an unset attribute serialises as an explicit `null`.
const blockAttrs = z
  .object({
    textAlign: z.enum(TEXT_ALIGN_VALUES).nullable().optional(),
    lineHeight: cssMeasure.nullable().optional(),
  })
  .strict();

const headingAttrs = blockAttrs.extend({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict();

type RichTextNode = { type: string; [key: string]: unknown };

/** `z.lazy` ties the recursive knot; `depth` is threaded through every
 *  recursive call so RICH_TEXT_MAX_DEPTH is enforced on the way down rather
 *  than after an unbounded tree has already been built in memory. */
const richTextNodeSchema = (depth: number): z.ZodType<RichTextNode> => {
  if (depth > RICH_TEXT_MAX_DEPTH) {
    return z.never() as unknown as z.ZodType<RichTextNode>;
  }
  const child = z.lazy(() => richTextNodeSchema(depth + 1));

  return z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      text: z.string().min(1).max(4000),
      marks: z.array(markSchema).max(10).optional(),
    }).strict(),
    z.object({ type: z.literal('hardBreak') }).strict(),
    z.object({
      type: z.literal('paragraph'),
      attrs: blockAttrs.optional(),
      content: z.array(child).max(500).optional(),
    }).strict(),
    z.object({
      type: z.literal('heading'),
      attrs: headingAttrs,
      content: z.array(child).max(500).optional(),
    }).strict(),
    z.object({
      type: z.literal('bulletList'),
      content: z.array(child).max(200).optional(),
    }).strict(),
    z.object({
      type: z.literal('orderedList'),
      content: z.array(child).max(200).optional(),
    }).strict(),
    z.object({
      type: z.literal('listItem'),
      content: z.array(child).max(50).optional(),
    }).strict(),
  ]) as unknown as z.ZodType<RichTextNode>;
};

const richTextDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(richTextNodeSchema(0)).max(500),
});

export { richTextDocSchema };

const imageContentSchema = z.object({
  // Relative only. An absolute URL here would let a form embed a remote image
  // that leaks every viewer's IP to a third party and breaks when it 404s.
  url: z.string().trim().min(1).max(500).startsWith('/uploads/'),
  alt: z.string().trim().max(200).optional(),
});

const dividerContentSchema = z.object({
  orientation: z.enum(['horizontal', 'vertical']),
  thickness: z.number().finite().min(1).max(20),
});

/*
 * `z.nativeEnum(...).refine(...)` rather than `z.enum([...])`: the latter
 * needs a literal string tuple and erases ComponentType back to `string`,
 * which then fails to satisfy FormDocument at the use-case boundary. Refining
 * the native enum keeps the parsed `type` typed as ComponentType while still
 * splitting presentation-only from data-bearing membership.
 */
const presentationElementSchema = z.object({
  id: elementId,
  type: z
    .nativeEnum(ComponentType)
    .refine((t) => PRESENTATION_ONLY_COMPONENT_TYPES.has(t), 'Not a presentation-only component'),
  ...boxSchema,
  locked: z.boolean().optional(),
  styles: stylesSchema,
  content: z.union([richTextDocSchema, imageContentSchema, dividerContentSchema]).optional(),
});

const dataElementSchema = z.object({
  id: elementId,
  type: z
    .nativeEnum(ComponentType)
    .refine((t) => !PRESENTATION_ONLY_COMPONENT_TYPES.has(t), 'Not a data-collecting component'),
  ...boxSchema,
  locked: z.boolean().optional(),
  styles: stylesSchema,
  field: fieldSpecSchema,
});

// Not a discriminated union: the discriminant (`type`) has more than two
// possible LITERAL groupings (presentation-only vs data-bearing, each with
// many members), which z.discriminatedUnion cannot express directly. Each
// element's `type` value determines — via ALLOWED_COMPONENTS in
// FormDocumentValidator, which needs the tenant's own definitions anyway —
// whether `field` is required or forbidden; Zod only checks that a
// presentation type never carries a field-shaped object and a data-bearing
// type always does.
const elementSchema = z.union([presentationElementSchema, dataElementSchema]);

const sectionSchema = z.object({
  id: elementId,
  title: z.string().trim().max(120).optional(),
  ...boxSchema,
  padding: z.number().finite().min(0).max(200).optional(),
  locked: z.boolean().optional(),
  titleStyles: z
    .object({
      fontSize: z.number().finite().min(8).max(72).optional(),
      color: hexColor.optional(),
      align: z.enum(['left', 'center', 'right']).optional(),
    })
    .optional(),
  styles: z
    .object({
      background: hexColor.optional(),
      borderColor: hexColor.optional(),
      radius: z.number().finite().min(0).max(64).optional(),
    })
    .optional(),
  elements: z.array(elementSchema).max(200),
});

const documentPageSchema = z.object({
  id: elementId,
  sections: z.array(sectionSchema).max(50),
});

const pageGeometrySchema = z.object({
  format: z.literal('A4'),
  orientation: z.enum(['portrait', 'landscape']),
  width: z.number().finite().min(200).max(3000),
  height: z.number().finite().min(200).max(3000),
  margin: z.object({
    top: z.number().finite().min(0).max(500),
    right: z.number().finite().min(0).max(500),
    bottom: z.number().finite().min(0).max(500),
    left: z.number().finite().min(0).max(500),
  }),
  background: hexColor.optional(),
});

export const formDocumentSchema = z.object({
  // A save always writes the current shape version. A client that somehow
  // sends v1/v2 here is rejected at the edge rather than silently accepted
  // and misinterpreted — migration only ever happens on READ, never on write.
  version: z.literal(FORM_DOCUMENT_VERSION),
  page: pageGeometrySchema,
  pages: z.array(documentPageSchema).min(MIN_PAGE_COUNT).max(MAX_PAGE_COUNT),
});

export const updateFormLayoutSchema = z.object({
  layout: formDocumentSchema,
  expectedVersion: z.number().int().min(1),
});

export type UpdateFormLayoutInput = z.infer<typeof updateFormLayoutSchema>;

export const createClientFormSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export const updateClientFormSettingsSchema = z.object({
  expectedVersion: z.number().int().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  isDefault: z.boolean().optional(),
});

export const duplicateClientFormSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const saveAsTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createFormFromTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const publishFormSchema = z.object({
  expectedVersion: z.number().int().min(1),
});

/**
 * Raw public submission data — reader-supplied, unauthenticated, so this is
 * a size/shape DoS guard, not the source of truth on validity. Field-level
 * correctness (required, min/max, options membership) is `SubmissionValidator`
 * against the FROZEN version's `FieldSpec`s, which is the layer that can
 * actually say "this value is wrong for this field."
 */
const submissionValueSchema = z.union([
  z.string().max(10_000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(10_000)).max(200),
]);

export const submitFormSchema = z.object({
  data: z.record(z.string().max(200), submissionValueSchema).refine(
    (obj) => Object.keys(obj).length <= 200,
    { message: 'Too many fields in this submission.' }
  ),
});
