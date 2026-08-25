import { UpdateClientUseCase } from '../../../../../src/clients/application/use-cases/UpdateClientUseCase';
import { EnsureDefaultClientFieldsUseCase } from '../../../../../src/clients/application/use-cases/EnsureDefaultClientFieldsUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { FieldRole } from '../../../../../src/clients/domain/enums/FieldRole';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';

describe('UpdateClientUseCase', () => {
  let useCase: UpdateClientUseCase;
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
    useCase = new UpdateClientUseCase(clientRepo, customFieldRepo, ensureDefaultFields);
  });

  it('updates a client and records the updater', async () => {
    const existingClient = Client.create({
      id: 'c1',
      tenantId: 't1',
      name: 'Old Name',
      contactInfo: {},
      status: ClientStatus.PROSPECT,
      customFieldValues: { Name: 'Old Name', Status: ClientStatus.PROSPECT },
      lastUpdatedByUserId: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, defaultDefinitions);

    clientRepo.findById.mockResolvedValue(existingClient);

    const result = await useCase.execute({
      tenantId: 't1',
      clientId: 'c1',
      customFieldValues: { Name: 'New Name' },
      updatingUserId: 'u2',
    });

    expect(clientRepo.update).toHaveBeenCalledWith('t1', expect.anything());
    expect(result.name).toBe('New Name');
    expect(result.lastUpdatedByUserId).toBe('u2');
  });

  it('prevents updating a client from another tenant', async () => {
    const existingClient = Client.create({
      id: 'c1',
      tenantId: 't2', // Different tenant
      name: 'Old Name',
      contactInfo: {},
      status: ClientStatus.PROSPECT,
      customFieldValues: {},
      lastUpdatedByUserId: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, []);

    clientRepo.findById.mockResolvedValue(existingClient);

    await expect(useCase.execute({
      tenantId: 't1',
      clientId: 'c1',
      customFieldValues: { Name: 'New Name' },
      updatingUserId: 'u2',
    })).rejects.toThrow('Client not found or access denied');
  });
});
