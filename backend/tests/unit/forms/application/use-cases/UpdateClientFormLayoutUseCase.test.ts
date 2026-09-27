import {
  UpdateClientFormLayoutUseCase,
  FormVersionConflictError,
} from '../../../../../src/forms/application/use-cases/UpdateClientFormLayoutUseCase';
import { UNPLACED_SECTION_ID } from '../../../../../src/forms/application/use-cases/GetClientFormUseCase';
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
import { administrator, platformOperator, salesUser } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

const definition = CustomFieldDefinition.create({
  id: 'f1',
  tenantId: 't1',
  fieldName: 'Name',
  fieldType: FieldType.TEXT,
});

const document = (sections: any[]): any => ({
  version: FORM_DOCUMENT_VERSION,
  page: emptyPageGeometry(),
  pages: [{ id: 'p1', sections }],
});

const section = (id: string, elements: any[] = [], y = 0) => ({
  id,
  title: 'Company Information',
  x: 0,
  y,
  width: 600,
  height: 200,
  elements,
});

const fieldElement = {
  id: 'i1',
  type: ComponentType.INPUT,
  x: 0,
  y: 0,
  width: 300,
  height: 50,
  field: {
    key: 'name',
    label: 'Name',
    dataType: FormFieldType.TEXT,
    required: false,
    clientFieldId: 'f1',
  },
};

describe('UpdateClientFormLayoutUseCase', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let useCase: UpdateClientFormLayoutUseCase;
  let existing: ClientForm;

  const setExisting = (isDefault: boolean) => {
    existing = ClientForm.create({ id: 'cf1', tenantId: 't1', name: 'Intake', version: 3, isDefault });
    formRepo.findById.mockResolvedValue(existing);
  };

  beforeEach(() => {
    formRepo = {
      findByTenantId: jest.fn(),
      findById: jest.fn(),
      findByShareToken: jest.fn(),
      findDefault: jest.fn(),
      save: jest.fn(),
      updateWithVersionCheck: jest.fn().mockResolvedValue(true),
      hasSeededDefaultForm: jest.fn(),
      markDefaultFormSeeded: jest.fn(),
      softDelete: jest.fn(),
    };
    customFieldRepo = {
      findByTenantId: jest.fn().mockResolvedValue([definition]),
      findById: jest.fn(),
      findByTenantIdAndRole: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
      hasSeededDefaults: jest.fn(),
      markDefaultsSeeded: jest.fn(),
    } as unknown as jest.Mocked<ICustomFieldDefinitionRepository>;
    setExisting(false);
    useCase = new UpdateClientFormLayoutUseCase(formRepo, customFieldRepo);
  });

  const run = (over: Record<string, unknown> = {}) =>
    useCase.execute({
      tenantId: 't1',
      access: administrator(),
      formId: 'cf1',
      layout: document([section('s1', [fieldElement])]),
      expectedVersion: 3,
      ...over,
    } as any);

  it('saves the document and bumps the version', async () => {
    const result = await run();

    expect(result.version).toBe(4);
    expect(formRepo.updateWithVersionCheck).toHaveBeenCalledWith(expect.anything(), 3);
  });

  it('refuses a staff member', async () => {
    await expect(run({ access: salesUser() })).rejects.toThrow(PermissionDeniedError);
    expect(formRepo.updateWithVersionCheck).not.toHaveBeenCalled();
  });

  it('allows a super admin', async () => {
    await expect(run({ access: platformOperator() })).resolves.toBeDefined();
  });

  it('reports a version conflict rather than overwriting', async () => {
    formRepo.updateWithVersionCheck.mockResolvedValue(false);

    await expect(run()).rejects.toThrow(FormVersionConflictError);
    await expect(run()).rejects.toThrow('changed somewhere else');
  });

  /*
   * assertRequiredDefinitionsArePlaced is scoped to the DEFAULT form — it
   * exists so a required client field can never go missing from the page the
   * internal client create/edit flow renders.
   */
  it('rejects a DEFAULT form that leaves a required definition unbound', async () => {
    setExisting(true);
    const required = CustomFieldDefinition.create({
      id: 'f2',
      tenantId: 't1',
      fieldName: 'Status',
      fieldType: FieldType.TEXT,
      required: true,
    });
    customFieldRepo.findByTenantId.mockResolvedValue([definition, required]);

    await expect(run()).rejects.toThrow('"Status" is a required field');
    expect(formRepo.updateWithVersionCheck).not.toHaveBeenCalled();
  });

  /*
   * The other half of that rule, and the risk the plan calls out explicitly:
   * a standalone document form owns no client fields, so the same unbound
   * required definition must NOT block it.
   */
  it('allows a NON-default form to leave a required definition unbound', async () => {
    setExisting(false);
    const required = CustomFieldDefinition.create({
      id: 'f2',
      tenantId: 't1',
      fieldName: 'Status',
      fieldType: FieldType.TEXT,
      required: true,
    });
    customFieldRepo.findByTenantId.mockResolvedValue([definition, required]);

    await expect(run()).resolves.toBeDefined();
    expect(formRepo.updateWithVersionCheck).toHaveBeenCalled();
  });

  it('404s on a form belonging to another tenant', async () => {
    formRepo.findById.mockResolvedValue(null);
    await expect(run()).rejects.toThrow('Form not found');
  });

  /*
   * The "Not yet placed" section is a read-model artefact. Round-tripping it
   * into storage would turn it into a real section, and fields created outside
   * the builder would stop being rescued from that moment on.
   */
  it('strips the synthetic unplaced section before saving', async () => {
    await run({
      layout: document([
        section('s1', [fieldElement]),
        section(UNPLACED_SECTION_ID, [], 300),
      ]),
    });

    const saved: ClientForm = formRepo.updateWithVersionCheck.mock.calls[0][0];
    expect(saved.layout.pages[0].sections.map((s) => s.id)).toEqual(['s1']);
  });
});
