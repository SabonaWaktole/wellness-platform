import { CreateClientUseCase } from '../../../../../src/clients/application/use-cases/CreateClientUseCase';
import { EnsureDefaultClientFieldsUseCase } from '../../../../../src/clients/application/use-cases/EnsureDefaultClientFieldsUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { FieldRole } from '../../../../../src/clients/domain/enums/FieldRole';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';

describe('CreateClientUseCase', () => {
  let useCase: CreateClientUseCase;
  let clientRepo: jest.Mocked<IClientRepository>;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let ensureDefaultFields: EnsureDefaultClientFieldsUseCase;

  const defaultDefinitions = [
    CustomFieldDefinition.create({
      id: 'name-field', tenantId: 't1', fieldName: 'Name', fieldType: FieldType.TEXT,
      role: FieldRole.PRIMARY_NAME, required: true,
    }),
    CustomFieldDefinition.create({
      id: 'email-field', tenantId: 't1', fieldName: 'Email', fieldType: FieldType.EMAIL,
      role: FieldRole.PRIMARY_EMAIL,
    }),
    CustomFieldDefinition.create({
      id: 'phone-field', tenantId: 't1', fieldName: 'Phone', fieldType: FieldType.TEXT,
      role: FieldRole.PRIMARY_PHONE,
    }),
    CustomFieldDefinition.create({
      id: 'status-field', tenantId: 't1', fieldName: 'Status', fieldType: FieldType.SINGLE_SELECT,
      options: ['PROSPECT', 'ACTIVE', 'INACTIVE'], role: FieldRole.STATUS, required: true,
    }),
    CustomFieldDefinition.create({
      id: 'assignee-field', tenantId: 't1', fieldName: 'Assigned To', fieldType: FieldType.USER_REFERENCE,
      role: FieldRole.ASSIGNEE,
    }),
  ];

  beforeEach(() => {
    clientRepo = {
      findById: jest.fn(),
      search: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      countByTenant: jest.fn(),
      findRecentByTenant: jest.fn(),
      backfillLegacyBasicFields: jest.fn(),
    } as any;

    customFieldRepo = {
      findByTenantId: jest.fn().mockResolvedValue(defaultDefinitions),
      findById: jest.fn(),
      findByTenantIdAndRole: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
    };

    ensureDefaultFields = new EnsureDefaultClientFieldsUseCase(customFieldRepo, clientRepo);

    useCase = new CreateClientUseCase(clientRepo, customFieldRepo, ensureDefaultFields);
  });

  it('creates a client successfully when custom fields are valid', async () => {
    const definitionsWithSource = [
      ...defaultDefinitions,
      CustomFieldDefinition.create({ id: 'f1', tenantId: 't1', fieldName: 'source', fieldType: FieldType.TEXT }),
    ];
    customFieldRepo.findByTenantId.mockResolvedValue(definitionsWithSource);

    const result = await useCase.execute({
      tenantId: 't1',
      customFieldValues: {
        Name: 'Acme Corp',
        Email: 'contact@acme.com',
        Status: ClientStatus.PROSPECT,
        source: 'Referral',
      },
      authorUserId: 'u1',
    });

    expect(result.id).toBeDefined();
    expect(result.name).toBe('Acme Corp');
    expect(clientRepo.save).toHaveBeenCalledWith('t1', expect.anything());
  });

  it('rejects creation if custom field does not match definition', async () => {
    await expect(useCase.execute({
      tenantId: 't1',
      customFieldValues: {
        Name: 'Acme Corp',
        Status: ClientStatus.PROSPECT,
        unknownField: 'test',
      },
      authorUserId: 'u1',
    })).rejects.toThrow('Field "unknownField" is not defined for this tenant.');

    expect(clientRepo.save).not.toHaveBeenCalled();
  });
});
