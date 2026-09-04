import {
  GetClientFormUseCase,
  UNPLACED_SECTION_ID,
  UNPLACED_PAGE_ID,
} from '../../../../../src/forms/application/use-cases/GetClientFormUseCase';
import { EnsureDefaultClientFormUseCase } from '../../../../../src/forms/application/use-cases/EnsureDefaultClientFormUseCase';
import { IClientFormRepository } from '../../../../../src/forms/domain/repositories/IClientFormRepository';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { ClientForm } from '../../../../../src/forms/domain/entities/ClientForm';
import { ComponentType } from '../../../../../src/forms/domain/enums/ComponentType';
import { FormFieldType } from '../../../../../src/forms/domain/enums/FormFieldType';
import {
  FORM_DOCUMENT_VERSION,
  emptyPageGeometry,
} from '../../../../../src/forms/domain/value-objects/FormDocument';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';

const def = (id: string, fieldName: string, overrides: Partial<{ fieldType: FieldType; required: boolean }> = {}) =>
  CustomFieldDefinition.create({
    id,
    tenantId: 't1',
    fieldName,
    fieldType: overrides.fieldType ?? FieldType.TEXT,
    required: overrides.required ?? false,
  });

/** A one-page form binding each given clientFieldId from a distinct field. */
const formWith = (clientFieldIds: string[], isDefault: boolean) =>
  ClientForm.create({
    id: 'cf1',
    tenantId: 't1',
    name: 'Intake',
    isDefault,
    layout: {
      version: FORM_DOCUMENT_VERSION,
      page: emptyPageGeometry(),
      pages: [
        {
          id: 'p1',
          sections: [
            {
              id: 's1',
              title: 'Company Information',
              x: 0,
              y: 0,
              width: 600,
              height: 200,
              elements: clientFieldIds.map((clientFieldId, i) => ({
                id: `i${i}`,
                type: ComponentType.INPUT,
                x: 0,
                y: i * 60,
                width: 300,
                height: 50,
                field: {
                  key: `key_${clientFieldId}`,
                  label: `Label ${clientFieldId}`,
                  dataType: FormFieldType.TEXT,
                  required: false,
                  clientFieldId,
                },
              })),
            },
          ],
        },
      ],
    },
  });

const allElements = (view: { layout: { pages: { sections: { elements: unknown[] }[] }[] } }) =>
  view.layout.pages.flatMap((p) => p.sections).flatMap((s) => s.elements) as any[];

describe('GetClientFormUseCase', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let ensureDefaultForm: jest.Mocked<EnsureDefaultClientFormUseCase>;
  let useCase: GetClientFormUseCase;

  beforeEach(() => {
    formRepo = {
      findByTenantId: jest.fn(),
      findById: jest.fn(),
      findByShareToken: jest.fn(),
      findDefault: jest.fn(),
      save: jest.fn(),
      updateWithVersionCheck: jest.fn(),
      hasSeededDefaultForm: jest.fn(),
      markDefaultFormSeeded: jest.fn(),
      softDelete: jest.fn(),
    };
    customFieldRepo = {
      findByTenantId: jest.fn(),
      findById: jest.fn(),
      findByTenantIdAndRole: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
      hasSeededDefaults: jest.fn(),
      markDefaultsSeeded: jest.fn(),
    } as unknown as jest.Mocked<ICustomFieldDefinitionRepository>;
    ensureDefaultForm = { execute: jest.fn() } as unknown as jest.Mocked<EnsureDefaultClientFormUseCase>;
    useCase = new GetClientFormUseCase(formRepo, customFieldRepo, ensureDefaultForm);
  });

  it('returns null for a form in another tenant', async () => {
    formRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute('t1', 'cf1')).resolves.toBeNull();
  });

  /*
   * DELIBERATE v2 REVERSAL. v2 dropped an element whose fieldId was deleted.
   * A v3 field owns its own identity, so a dangling binding is CLEARED and
   * the field survives as an unbound form field — it keeps collecting into
   * FormSubmission.data, it just stops writing to the Client record.
   */
  it('clears a dangling clientFieldId binding but KEEPS the field', async () => {
    formRepo.findById.mockResolvedValue(formWith(['f1', 'gone'], false));
    customFieldRepo.findByTenantId.mockResolvedValue([def('f1', 'Name')]);

    const view = await useCase.execute('t1', 'cf1');
    const elements = allElements(view!);

    expect(elements).toHaveLength(2);
    expect(elements.map((e) => e.field.clientFieldId)).toEqual(['f1', undefined]);
    // The orphaned field keeps its own key — its data identity is intact.
    expect(elements[1].field.key).toBe('key_gone');
  });

  it('hydrates dataType/required/options from the live definition for a resolving binding', async () => {
    formRepo.findById.mockResolvedValue(formWith(['f1'], false));
    customFieldRepo.findByTenantId.mockResolvedValue([
      def('f1', 'Renamed In Fields Tab', { fieldType: FieldType.LONG_TEXT, required: true }),
    ]);

    const view = await useCase.execute('t1', 'cf1');
    const field = allElements(view!)[0].field;

    expect(field.dataType).toBe(FormFieldType.LONG_TEXT);
    expect(field.required).toBe(true);
    // The form owns its own label (§11) — renaming the definition does NOT
    // retroactively relabel every form that uses it.
    expect(field.label).toBe('Label f1');
  });

  /*
   * Fields created through the Excel importer or the Fields tab belong to no
   * document. Without this rescue they would be invisible everywhere and bulk
   * field import would silently stop working.
   */
  it('appends unplaced fields to the default form as a synthetic trailing page', async () => {
    formRepo.findById.mockResolvedValue(formWith(['f1'], true));
    customFieldRepo.findByTenantId.mockResolvedValue([def('f1', 'Name'), def('f2', 'VAT')]);

    const view = await useCase.execute('t1', 'cf1');

    const rescuePage = view!.layout.pages.find((p) => p.id === UNPLACED_PAGE_ID);
    expect(rescuePage).toBeDefined();
    const section = rescuePage!.sections.find((s) => s.id === UNPLACED_SECTION_ID)!;
    expect(section.elements.map((e: any) => e.field.clientFieldId)).toEqual(['f2']);
    expect(view!.unplacedFieldIds).toEqual(['f2']);
  });

  /*
   * v3 pages are fixed A4, so unlike v2 the rescue cannot grow an existing
   * page to fit — it gets a whole page of its own, leaving every authored
   * page's geometry untouched.
   */
  it('never mutates authored page geometry to fit the rescue', async () => {
    formRepo.findById.mockResolvedValue(formWith(['f1'], true));
    customFieldRepo.findByTenantId.mockResolvedValue([def('f1', 'Name'), def('f2', 'VAT')]);

    const view = await useCase.execute('t1', 'cf1');

    expect(view!.layout.page).toEqual(emptyPageGeometry());
    expect(view!.layout.pages[0].id).toBe('p1');
  });

  it('adds no rescue page when the default form binds everything', async () => {
    formRepo.findById.mockResolvedValue(formWith(['f1'], true));
    customFieldRepo.findByTenantId.mockResolvedValue([def('f1', 'Name')]);

    const view = await useCase.execute('t1', 'cf1');

    expect(view!.layout.pages.map((p) => p.id)).toEqual(['p1']);
    expect(view!.unplacedFieldIds).toEqual([]);
  });

  /*
   * A secondary form is a deliberately narrow view — appending every stray
   * field to it would defeat the point of having more than one form.
   */
  it('leaves a non-default form narrow', async () => {
    formRepo.findById.mockResolvedValue(formWith(['f1'], false));
    customFieldRepo.findByTenantId.mockResolvedValue([def('f1', 'Name'), def('f2', 'VAT')]);

    const view = await useCase.execute('t1', 'cf1');

    expect(view!.layout.pages.map((p) => p.id)).toEqual(['p1']);
    expect(view!.unplacedFieldIds).toEqual([]);
  });

  it('seeds through the ensure use case when reading the default form', async () => {
    ensureDefaultForm.execute.mockResolvedValue(formWith(['f1'], true));
    customFieldRepo.findByTenantId.mockResolvedValue([def('f1', 'Name')]);

    const view = await useCase.executeDefault('t1');

    expect(ensureDefaultForm.execute).toHaveBeenCalledWith('t1');
    expect(view!.definitions).toHaveLength(1);
  });

  it('returns null when the tenant has no default form', async () => {
    ensureDefaultForm.execute.mockResolvedValue(null);
    await expect(useCase.executeDefault('t1')).resolves.toBeNull();
  });
});

/*
 * A trap created by the "a choice field needs at least one option" rule.
 *
 * A migrated v2 checkbox element carries dataType MULTI_SELECT but no options
 * — migration is pure and cannot read definitions, so options are hydrated on
 * read from the bound definition. If that binding is DANGLING, the field
 * keeps MULTI_SELECT with no options, and the next save is refused for a
 * reason the owner did not cause and cannot see. That is exactly the
 * "existing form becomes unsaveable" failure this module has already been
 * bitten by once.
 */
describe('GetClientFormUseCase — dangling choice fields stay saveable', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let useCase: GetClientFormUseCase;

  beforeEach(() => {
    formRepo = {
      findByTenantId: jest.fn(), findById: jest.fn(), findByShareToken: jest.fn(), findDefault: jest.fn(), save: jest.fn(),
      updateWithVersionCheck: jest.fn(), hasSeededDefaultForm: jest.fn(),
      markDefaultFormSeeded: jest.fn(), softDelete: jest.fn(),
    };
    customFieldRepo = {
      findByTenantId: jest.fn().mockResolvedValue([]), findById: jest.fn(),
      findByTenantIdAndRole: jest.fn(), save: jest.fn(), update: jest.fn(), delete: jest.fn(),
      reorder: jest.fn(), hasSeededDefaults: jest.fn(), markDefaultsSeeded: jest.fn(),
    } as unknown as jest.Mocked<ICustomFieldDefinitionRepository>;
    useCase = new GetClientFormUseCase(formRepo, customFieldRepo, {
      execute: jest.fn(),
    } as unknown as jest.Mocked<EnsureDefaultClientFormUseCase>);
  });

  const choiceForm = () =>
    ClientForm.create({
      id: 'cf1', tenantId: 't1', name: 'F', isDefault: false,
      layout: {
        version: FORM_DOCUMENT_VERSION,
        page: emptyPageGeometry(),
        pages: [{
          id: 'p1',
          sections: [{
            id: 's1', title: 'S', x: 48, y: 48, width: 400, height: 200,
            elements: [{
              id: 'e1', type: ComponentType.CHECKBOX_GROUP, x: 0, y: 0, width: 200, height: 60,
              field: {
                key: 'risks', label: 'Risks', dataType: FormFieldType.MULTI_SELECT,
                required: false, clientFieldId: 'gone',
              },
            }],
          }],
        }],
      },
    });

  it('demotes an unbound choice field with no options to a plain text field', async () => {
    formRepo.findById.mockResolvedValue(choiceForm());

    const view = await useCase.execute('t1', 'cf1');
    const el = view!.layout.pages[0].sections[0].elements[0];

    expect(el.field!.clientFieldId).toBeUndefined();
    expect(el.field!.dataType).toBe(FormFieldType.TEXT);
    expect(el.type).toBe(ComponentType.INPUT);
    // The data identity survives the demotion — submissions keyed off it stay
    // meaningful even though the control changed.
    expect(el.field!.key).toBe('risks');
  });

  it('leaves an unbound choice field alone when it already carries its own options', async () => {
    const form = choiceForm();
    (form.layout.pages[0].sections[0].elements[0].field as any).options = [
      { value: 'noise', label: 'Noise' },
    ];
    formRepo.findById.mockResolvedValue(form);

    const view = await useCase.execute('t1', 'cf1');
    const el = view!.layout.pages[0].sections[0].elements[0];

    expect(el.field!.dataType).toBe(FormFieldType.MULTI_SELECT);
    expect(el.type).toBe(ComponentType.CHECKBOX_GROUP);
  });
});
