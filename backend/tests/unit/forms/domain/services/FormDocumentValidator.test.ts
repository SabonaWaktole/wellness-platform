import { FormDocumentValidator } from '../../../../../src/forms/domain/services/FormDocumentValidator';
import { DomainError } from '../../../../../src/shared/domain/errors/DomainError';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { ComponentType } from '../../../../../src/forms/domain/enums/ComponentType';
import { FormFieldType } from '../../../../../src/forms/domain/enums/FormFieldType';
import {
  FormDocument,
  FormElement,
  FormSection,
  DocumentPage,
  emptyPageGeometry,
  A4_PORTRAIT,
  DEFAULT_MARGIN,
  migrateDocumentToV3,
} from '../../../../../src/forms/domain/value-objects/FormDocument';
import type { FormLayout } from '../../../../../src/forms/domain/value-objects/FormLayout';

const page = () => emptyPageGeometry();

const section = (overrides: Partial<FormSection> = {}): FormSection => ({
  id: overrides.id ?? 's1',
  title: 'Section',
  x: 10, y: 10, width: 300, height: 200,
  elements: [],
  ...overrides,
});

const docPage = (sections: FormSection[], id = 'p1'): DocumentPage => ({ id, sections });

const doc = (pages: DocumentPage[]): FormDocument => ({
  version: 3,
  page: page(),
  pages,
});

const inputField = (overrides: Partial<FormElement> = {}): FormElement => ({
  id: overrides.id ?? 'el1',
  type: ComponentType.INPUT,
  x: 5, y: 5, width: 100, height: 30,
  field: {
    key: 'company_name',
    label: 'Company Name',
    dataType: FormFieldType.TEXT,
    required: false,
  },
  ...overrides,
});

const def = (overrides: Partial<Parameters<typeof CustomFieldDefinition.create>[0]> = {}) =>
  CustomFieldDefinition.create({
    id: 'cfd1',
    tenantId: 't1',
    fieldName: 'Company Name',
    fieldType: FieldType.TEXT,
    required: false,
    order: 0,
    ...overrides,
  });

describe('FormDocumentValidator', () => {
  it('accepts a well-formed document with no fields', () => {
    const d = doc([docPage([section()])]);
    expect(() => FormDocumentValidator.validate(d, [])).not.toThrow();
  });

  it('rejects a document over the byte limit', () => {
    const huge = section({ title: 'x'.repeat(2_000_000) });
    const d = doc([docPage([huge])]);
    expect(() => FormDocumentValidator.validate(d, [])).toThrow(DomainError);
  });

  it('rejects duplicate ids across sections/elements', () => {
    const d = doc([
      docPage([section({ id: 'dup' }), section({ id: 'dup' })]),
    ]);
    expect(() => FormDocumentValidator.validate(d, [])).toThrow(/duplicate/i);
  });

  it('rejects a section that spans past the page usable area', () => {
    const tooTall = section({ height: A4_PORTRAIT.height * 2 });
    const d = doc([docPage([tooTall])]);
    expect(() => FormDocumentValidator.validate(d, [])).toThrow(DomainError);
  });

  it('rejects two data-bearing elements sharing the same field.key', () => {
    const s = section({
      elements: [inputField({ id: 'el1' }), inputField({ id: 'el2' })],
    });
    const d = doc([docPage([s])]);
    expect(() => FormDocumentValidator.validate(d, [])).toThrow(/more than once|unique/i);
  });

  it('rejects a clientFieldId bound more than once', () => {
    const s = section({
      elements: [
        inputField({ id: 'el1', field: { key: 'a', label: 'A', dataType: FormFieldType.TEXT, required: false, clientFieldId: 'cfd1' } }),
        inputField({ id: 'el2', field: { key: 'b', label: 'B', dataType: FormFieldType.TEXT, required: false, clientFieldId: 'cfd1' } }),
      ],
    });
    const d = doc([docPage([s])]);
    expect(() => FormDocumentValidator.validate(d, [def()])).toThrow(DomainError);
  });

  it('does NOT drop a component whose clientFieldId no longer resolves — it stays an unbound field (optional-binding decision)', () => {
    const s = section({
      elements: [inputField({ field: { key: 'k', label: 'K', dataType: FormFieldType.TEXT, required: false, clientFieldId: 'gone' } })],
    });
    const d = doc([docPage([s])]);
    expect(() => FormDocumentValidator.validate(d, [])).not.toThrow();
  });

  it('rejects an IMAGE element with no url', () => {
    const s = section({
      elements: [{ id: 'img1', type: ComponentType.IMAGE, x: 0, y: 0, width: 50, height: 50, content: { url: '' } }],
    });
    const d = doc([docPage([s])]);
    expect(() => FormDocumentValidator.validate(d, [])).toThrow(DomainError);
  });

  it('rejects an invalid hex colour', () => {
    const s = section({
      elements: [inputField({ styles: { textColor: 'red' } })],
    });
    const d = doc([docPage([s])]);
    expect(() => FormDocumentValidator.validate(d, [])).toThrow(DomainError);
  });

  it('rejects an invalid hex colour in a section title band', () => {
    const d = doc([docPage([section({ titleStyles: { background: 'blue' } })])]);
    expect(() => FormDocumentValidator.validate(d, [])).toThrow(DomainError);
  });

  it('accepts a valid title band colour', () => {
    const d = doc([
      docPage([section({ titleStyles: { background: '#1d4ed8', color: '#ffffff' } })]),
    ]);
    expect(() => FormDocumentValidator.validate(d, [])).not.toThrow();
  });

  it('accepts fieldLayout and optionColumns on an element without complaint', () => {
    const s = section({
      elements: [inputField({ styles: { fieldLayout: 'inline', optionColumns: 4 } })],
    });
    const d = doc([docPage([s])]);
    expect(() => FormDocumentValidator.validate(d, [])).not.toThrow();
  });

  it('rejects a component type incompatible with its field dataType', () => {
    const s = section({
      elements: [
        inputField({
          type: ComponentType.CHECKBOX_GROUP,
          field: { key: 'k', label: 'K', dataType: FormFieldType.TEXT, required: false },
        }),
      ],
    });
    const d = doc([docPage([s])]);
    expect(() => FormDocumentValidator.validate(d, [])).toThrow(DomainError);
  });

  it('requires every required CustomFieldDefinition to be placed ONLY when isDefaultForm is true', () => {
    const d = doc([docPage([section()])]);
    const requiredDef = def({ id: 'req1', fieldName: 'Required Field', required: true });

    expect(() => FormDocumentValidator.validate(d, [requiredDef], { isDefaultForm: true })).toThrow(DomainError);
    expect(() => FormDocumentValidator.validate(d, [requiredDef], { isDefaultForm: false })).not.toThrow();
  });
});

/*
 * Per-dataType validation rules. These are the knobs the properties panel
 * exposes (§12); a nonsensical pair (min > max, an unparseable regex) is
 * caught here rather than surfacing as a submission that can never validate.
 */
describe('FormDocumentValidator — field validation rules', () => {
  const withValidation = (dataType: FormFieldType, validation: Record<string, unknown>, type = ComponentType.INPUT) =>
    doc([
      docPage([
        section({
          elements: [
            inputField({
              type,
              field: { key: 'k', label: 'K', dataType, required: false, validation } as never,
            }),
          ],
        }),
      ]),
    ]);

  it('rejects minLength greater than maxLength', () => {
    expect(() =>
      FormDocumentValidator.validate(withValidation(FormFieldType.TEXT, { minLength: 10, maxLength: 5 }), [])
    ).toThrow(/minimum length/i);
  });

  it('accepts minLength equal to maxLength', () => {
    expect(() =>
      FormDocumentValidator.validate(withValidation(FormFieldType.TEXT, { minLength: 5, maxLength: 5 }), [])
    ).not.toThrow();
  });

  it('rejects a numeric min greater than max', () => {
    expect(() =>
      FormDocumentValidator.validate(withValidation(FormFieldType.NUMBER, { min: 100, max: 10 }), [])
    ).toThrow(/minimum/i);
  });

  it('rejects a minDate later than maxDate', () => {
    expect(() =>
      FormDocumentValidator.validate(
        withValidation(FormFieldType.DATE, { minDate: '2026-12-01', maxDate: '2026-01-01' }, ComponentType.DATE),
        []
      )
    ).toThrow(/earliest/i);
  });

  it('rejects an unparseable date bound', () => {
    expect(() =>
      FormDocumentValidator.validate(
        withValidation(FormFieldType.DATE, { minDate: 'not-a-date' }, ComponentType.DATE),
        []
      )
    ).toThrow(/valid date/i);
  });

  /*
   * A regex that does not compile would throw inside the submission
   * validator, at which point every submission fails with a stack trace
   * instead of a message about the field.
   */
  it('rejects a pattern that is not a valid regular expression', () => {
    expect(() =>
      FormDocumentValidator.validate(withValidation(FormFieldType.TEXT, { pattern: '([unclosed' }), [])
    ).toThrow(/valid pattern/i);
  });

  it('accepts a well-formed pattern', () => {
    expect(() =>
      FormDocumentValidator.validate(withValidation(FormFieldType.TEXT, { pattern: '^[A-Z]{2}\\d{4}$' }), [])
    ).not.toThrow();
  });

  it('rejects negative lengths', () => {
    expect(() =>
      FormDocumentValidator.validate(withValidation(FormFieldType.TEXT, { minLength: -1 }), [])
    ).toThrow(DomainError);
  });
});

describe('FormDocumentValidator — options', () => {
  const withOptions = (options: { value: string; label: string }[]) =>
    doc([
      docPage([
        section({
          elements: [
            inputField({
              type: ComponentType.DROPDOWN,
              field: {
                key: 'k',
                label: 'K',
                dataType: FormFieldType.SINGLE_SELECT,
                required: false,
                options,
              },
            }),
          ],
        }),
      ]),
    ]);

  /*
   * Two options sharing a value is silent data loss: the submitted value can
   * no longer be traced back to which choice the person actually made.
   */
  it('rejects duplicate option values', () => {
    expect(() =>
      FormDocumentValidator.validate(
        withOptions([
          { value: 'a', label: 'Office' },
          { value: 'a', label: 'Retail' },
        ]),
        []
      )
    ).toThrow(/more than once|duplicate/i);
  });

  it('allows duplicate LABELS as long as the values differ', () => {
    // Labels are display text and a tenant may legitimately repeat one; the
    // value is the identity (§15).
    expect(() =>
      FormDocumentValidator.validate(
        withOptions([
          { value: 'a', label: 'Other' },
          { value: 'b', label: 'Other' },
        ]),
        []
      )
    ).not.toThrow();
  });

  it('requires a choice component to actually have options', () => {
    expect(() => FormDocumentValidator.validate(withOptions([]), [])).toThrow(/at least one option/i);
  });
});

/*
 * Found by running a real migrated tenant form through the API: v2 pages were
 * up to 900px wide, so sections legitimately reached 832px — wider than an A4
 * page's 698px usable area. The document read back fine but was UNSAVEABLE,
 * because FormDocumentValidator.assertSectionFitsPage refuses it. Migration
 * must land inside the same bounds live editing is held to.
 */
describe('migrateDocumentToV3 output passes FormDocumentValidator', () => {
  const usableH = A4_PORTRAIT.height - DEFAULT_MARGIN.top - DEFAULT_MARGIN.bottom;

  it('produces a document the save-time validator accepts', () => {
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 2400 },
      sections: [
        { id: 'a', title: 'A', x: 32, y: 32, width: 832, height: 488, elements: [] },
        { id: 'b', title: 'B', x: 32, y: 552, width: 832, height: 260, elements: [] },
        { id: 'c', title: 'C', x: 32, y: 1400, width: 832, height: 900, elements: [] },
      ],
    };

    const migrated = migrateDocumentToV3(v2 as unknown);
    expect(() => FormDocumentValidator.validate(migrated, [])).not.toThrow();
    expect(migrated.pages.flatMap((p) => p.sections).every((s) => s.height <= usableH)).toBe(true);
  });
});
