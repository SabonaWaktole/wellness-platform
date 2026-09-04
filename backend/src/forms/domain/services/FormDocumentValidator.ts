import { DomainError } from '../../../shared/domain/errors/DomainError';
import { CustomFieldDefinition } from '../../../clients/domain/entities/CustomFieldDefinition';
import { ComponentType, isDataBearingComponent } from '../enums/ComponentType';
import { FormFieldType } from '../enums/FormFieldType';
import {
  FormDocument,
  FormElement,
  FormSection,
  Box,
  fieldSpecsOf,
  usablePageHeight,
  usablePageWidth,
  HEX_COLOR_PATTERN,
  MAX_DOCUMENT_BYTES,
  MIN_SIZE_PX,
  MAX_SIZE_PX,
  MIN_PAGE_COUNT,
  MAX_PAGE_COUNT,
} from '../value-objects/FormDocument';

/**
 * Which component types may carry which FieldSpec.dataType. Mirrors v2's
 * ALLOWED_CONTROLS for the same reason: a component that cannot represent the
 * stored value is a data bug, caught here rather than surfacing as a failed
 * submission hours later in front of a customer.
 */
const ALLOWED_COMPONENTS: Partial<Record<FormFieldType, ComponentType[]>> = {
  [FormFieldType.SINGLE_SELECT]: [ComponentType.DROPDOWN, ComponentType.RADIO_GROUP],
  [FormFieldType.MULTI_SELECT]: [ComponentType.CHECKBOX_GROUP],
  [FormFieldType.TEXT]: [ComponentType.INPUT, ComponentType.TEXTAREA],
  [FormFieldType.LONG_TEXT]: [ComponentType.TEXTAREA, ComponentType.INPUT],
  [FormFieldType.EMAIL]: [ComponentType.INPUT],
  [FormFieldType.NUMBER]: [ComponentType.INPUT],
  [FormFieldType.DATE]: [ComponentType.DATE],
  [FormFieldType.BOOLEAN]: [ComponentType.CHECKBOX_GROUP],
  [FormFieldType.SIGNATURE]: [ComponentType.SIGNATURE],
  [FormFieldType.USER_REFERENCE]: [ComponentType.USER_SELECT],
};

export interface ValidateOptions {
  /**
   * Whether `assertRequiredFieldsArePlaced` applies. Scoped to the default
   * client-intake form only (a required CustomFieldDefinition must appear
   * somewhere on the page the internal client create/edit flow renders, or
   * every client creation would fail) — it makes no sense for a standalone
   * document form, which owns no client fields at all by default. See the
   * plan's Phase 0 "changed" note and the risk it calls out explicitly.
   */
  isDefaultForm?: boolean;
}

/**
 * Validates a FormDocument (v3) against the tenant's live field definitions.
 *
 * Replaces FormLayoutValidator (v2). Zod already checked JSON shape at the
 * HTTP edge; this is the layer that needs the tenant's CustomFieldDefinitions
 * to check cross-references, which only exist behind a repository.
 *
 * The caller is expected to have already migrated the document to v3
 * (`migrateDocumentToV3`) — this validator only ever sees v3 shapes, since
 * every SAVE always writes v3 regardless of what version was read.
 */
export class FormDocumentValidator {
  static validate(
    document: FormDocument,
    definitions: CustomFieldDefinition[],
    options: ValidateOptions = {}
  ): void {
    this.assertWithinSizeLimit(document);
    this.assertPageCount(document);
    this.assertUniqueIds(document);
    this.assertSectionsAndElementsWellFormed(document);
    this.assertFieldKeysUnique(document);
    this.assertClientBindingsResolveAndAreUnique(document, definitions);
    this.assertComponentDataTypeCompatibility(document);
    this.assertFieldRulesAreCoherent(document);
    if (options.isDefaultForm) {
      this.assertRequiredDefinitionsArePlaced(document, definitions);
    }
  }

  private static assertWithinSizeLimit(document: FormDocument): void {
    const bytes = Buffer.byteLength(JSON.stringify(document), 'utf8');
    if (bytes > MAX_DOCUMENT_BYTES) {
      throw new DomainError(
        `This form is too large to save (${Math.round(bytes / 1024)} KB, limit ${MAX_DOCUMENT_BYTES / 1024} KB).`
      );
    }
  }

  private static assertPageCount(document: FormDocument): void {
    if (document.pages.length < MIN_PAGE_COUNT || document.pages.length > MAX_PAGE_COUNT) {
      throw new DomainError(`A form must have between ${MIN_PAGE_COUNT} and ${MAX_PAGE_COUNT} pages.`);
    }
  }

  private static assertUniqueIds(document: FormDocument): void {
    const seen = new Set<string>();
    const mark = (id: string) => {
      if (seen.has(id)) throw new DomainError(`Duplicate id "${id}" in this form.`);
      seen.add(id);
    };
    for (const page of document.pages) {
      mark(page.id);
      for (const section of page.sections) {
        mark(section.id);
        for (const element of section.elements) mark(element.id);
      }
    }
  }

  private static assertBox(box: Box, what: string): void {
    if (!Number.isFinite(box.x) || !Number.isFinite(box.y)) {
      throw new DomainError(`${what} has an invalid position.`);
    }
    if (
      !Number.isFinite(box.width) ||
      !Number.isFinite(box.height) ||
      box.width < MIN_SIZE_PX ||
      box.width > MAX_SIZE_PX ||
      box.height < MIN_SIZE_PX ||
      box.height > MAX_SIZE_PX
    ) {
      throw new DomainError(`${what} must be between ${MIN_SIZE_PX} and ${MAX_SIZE_PX} pixels in each dimension.`);
    }
  }

  /**
   * Spec §7's hard rule enforced structurally: a section may never spill past
   * its page's usable area (page minus margins). Uses the SAME
   * `usablePageHeight` the frontend overflow ladder and the v2->v3 migration
   * both derive from — one definition of "how tall can a section be", not
   * three that could quietly disagree.
   */
  private static assertSectionFitsPage(section: FormSection, document: FormDocument): void {
    const maxHeight = usablePageHeight(document.page);
    const maxWidth = usablePageWidth(document.page);
    if (section.height > maxHeight) {
      throw new DomainError(
        `Section "${section.title ?? section.id}" is taller than the page. Split it into more than one section.`
      );
    }
    if (section.width > maxWidth) {
      throw new DomainError(
        `Section "${section.title ?? section.id}" is wider than the page.`
      );
    }
  }

  private static assertSectionsAndElementsWellFormed(document: FormDocument): void {
    for (const page of document.pages) {
      for (const section of page.sections) {
        this.assertBox(section, `Section "${section.title ?? section.id}"`);
        this.assertSectionFitsPage(section, document);

        for (const element of section.elements) {
          this.assertBox(element, `An element in section "${section.title ?? section.id}"`);
          this.assertColor(element);

          if (element.type === ComponentType.IMAGE) {
            const url = (element.content as { url?: string } | undefined)?.url;
            if (!url || !url.trim()) {
              throw new DomainError('An image element needs an uploaded image.');
            }
          }

          const dataBearing = isDataBearingComponent(element.type);
          if (dataBearing && !element.field) {
            throw new DomainError(`"${element.id}" is a data-collecting component and needs a field definition.`);
          }
          if (!dataBearing && element.field) {
            throw new DomainError(`"${element.id}" is a presentation-only component and cannot carry a field.`);
          }
        }
      }
    }
  }

  private static assertColor(element: FormElement): void {
    if (!element.styles) return;
    const colorKeys = new Set(['textColor', 'labelColor', 'background', 'borderColor', 'color']);
    for (const [key, value] of Object.entries(element.styles)) {
      if (!colorKeys.has(key) || typeof value !== 'string') continue;
      if (!HEX_COLOR_PATTERN.test(value)) {
        throw new DomainError(`"${value}" is not a valid colour. Use a six-digit hex value like #1d4ed8.`);
      }
    }
  }

  /**
   * `field.key` is the durable DATA identity (see FormDocument.ts module
   * doc) — two components sharing one key is silent data loss on submit,
   * exactly as v2's "a field can only be placed once" rule guarded against.
   */
  private static assertFieldKeysUnique(document: FormDocument): void {
    const seen = new Set<string>();
    for (const field of fieldSpecsOf(document)) {
      if (!field.key || !field.key.trim()) {
        throw new DomainError('Every field needs a key.');
      }
      if (seen.has(field.key)) {
        throw new DomainError(`"${field.key}" appears more than once on this form. A field can only be placed once.`);
      }
      seen.add(field.key);
    }
  }

  /**
   * A `clientFieldId` binding that no longer resolves is NOT an error and
   * does not drop the component — per the "form-owned fields with an
   * optional client binding" decision, it just becomes an unbound form
   * field. What IS still refused is the same silent-overwrite hazard v2
   * guarded against: one CustomFieldDefinition bound from two different
   * components.
   */
  private static assertClientBindingsResolveAndAreUnique(
    document: FormDocument,
    definitions: CustomFieldDefinition[]
  ): void {
    const seenBindings = new Set<string>();
    for (const field of fieldSpecsOf(document)) {
      if (!field.clientFieldId) continue;
      if (seenBindings.has(field.clientFieldId)) {
        const def = definitions.find((d) => d.id === field.clientFieldId);
        throw new DomainError(
          `"${def?.fieldName ?? field.clientFieldId}" is bound to more than one field on this form.`
        );
      }
      seenBindings.add(field.clientFieldId);
    }
  }

  private static assertComponentDataTypeCompatibility(document: FormDocument): void {
    for (const page of document.pages) {
      for (const section of page.sections) {
        for (const element of section.elements) {
          if (!element.field) continue;
          const allowed = ALLOWED_COMPONENTS[element.field.dataType];
          if (allowed && !allowed.includes(element.type)) {
            throw new DomainError(`A ${element.field.dataType} field cannot be shown as ${element.type}.`);
          }
        }
      }
    }
  }

  /**
   * The per-field knobs the properties panel exposes (spec §12).
   *
   * All of these describe rules the SUBMISSION validator will later enforce.
   * A rule that is itself nonsensical — min above max, a regex that does not
   * compile — cannot be caught at submission time in any useful way: it either
   * makes every submission fail with a message about a field nobody can fix,
   * or throws inside the validator and produces a stack trace instead. So it
   * is refused here, at save time, while the owner is looking at it.
   */
  private static assertFieldRulesAreCoherent(document: FormDocument): void {
    const CHOICE_TYPES = new Set([FormFieldType.SINGLE_SELECT, FormFieldType.MULTI_SELECT]);

    for (const field of fieldSpecsOf(document)) {
      const where = `"${field.label || field.key}"`;

      if (CHOICE_TYPES.has(field.dataType)) {
        const options = field.options ?? [];
        if (options.length === 0) {
          throw new DomainError(`${where} is a choice field and needs at least one option.`);
        }
        const seen = new Set<string>();
        for (const option of options) {
          if (seen.has(option.value)) {
            // Two options sharing a value is silent data loss: a submitted
            // value can no longer be traced back to the choice actually made.
            // Labels may repeat — those are display text (§15).
            throw new DomainError(`${where} uses the option value "${option.value}" more than once.`);
          }
          seen.add(option.value);
        }
      }

      const rules = field.validation;
      if (!rules) continue;

      for (const key of ['minLength', 'maxLength'] as const) {
        const value = rules[key];
        if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
          throw new DomainError(`${where} has an invalid ${key}.`);
        }
      }

      if (
        rules.minLength !== undefined &&
        rules.maxLength !== undefined &&
        rules.minLength > rules.maxLength
      ) {
        throw new DomainError(`${where} has a minimum length longer than its maximum length.`);
      }

      if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
        throw new DomainError(`${where} has a minimum greater than its maximum.`);
      }

      const minDate = this.parseDateBound(rules.minDate, where, 'earliest date');
      const maxDate = this.parseDateBound(rules.maxDate, where, 'latest date');
      if (minDate !== null && maxDate !== null && minDate > maxDate) {
        throw new DomainError(`${where} has an earliest date later than its latest date.`);
      }

      if (rules.pattern !== undefined) {
        try {
          // eslint-disable-next-line no-new
          new RegExp(rules.pattern);
        } catch {
          throw new DomainError(`${where} does not have a valid pattern.`);
        }
      }
    }
  }

  private static parseDateBound(
    value: string | undefined,
    where: string,
    what: string
  ): number | null {
    if (value === undefined) return null;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      throw new DomainError(`${where} does not have a valid date for its ${what}.`);
    }
    return parsed;
  }

  /**
   * The sharpest trap in this feature (carried over from v2, scoped to the
   * default form only — see ValidateOptions.isDefaultForm above).
   */
  private static assertRequiredDefinitionsArePlaced(
    document: FormDocument,
    definitions: CustomFieldDefinition[]
  ): void {
    const boundIds = new Set(fieldSpecsOf(document).map((f) => f.clientFieldId).filter(Boolean));
    const missing = definitions.filter((d) => d.required && !boundIds.has(d.id));

    if (missing.length > 0) {
      const names = missing.map((d) => `"${d.fieldName}"`).join(', ');
      throw new DomainError(
        `${names} ${missing.length === 1 ? 'is a required field and must be' : 'are required fields and must be'} placed on this form, otherwise it can never be submitted.`
      );
    }
  }
}
