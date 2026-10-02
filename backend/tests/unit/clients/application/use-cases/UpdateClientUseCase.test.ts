import { UpdateClientUseCase } from '../../../../../src/clients/application/use-cases/UpdateClientUseCase';
import { EnsureDefaultClientFieldsUseCase } from '../../../../../src/clients/application/use-cases/EnsureDefaultClientFieldsUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { FieldRole } from '../../../../../src/clients/domain/enums/FieldRole';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { administrator, salesManager, salesUser, scopeResolver } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { IClientWriteTransaction } from '../../../../../src/clients/application/ports/IClientWriteTransaction';

describe('UpdateClientUseCase', () => {
  let useCase: UpdateClientUseCase;
  let clientRepo: jest.Mocked<IClientRepository>;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let ensureDefaultFields: EnsureDefaultClientFieldsUseCase;
  let auditTrail: { record: jest.Mock };
  let writeTx: IClientWriteTransaction;

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
      countByName: jest.fn().mockResolvedValue(0),
      findByTaxId: jest.fn().mockResolvedValue(null),
    } as any;
    customFieldRepo = {
      findByTenantId: jest.fn().mockResolvedValue(defaultDefinitions),
      findById: jest.fn(),
      findByTenantIdAndRole: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
      hasSeededDefaults: jest.fn().mockResolvedValue(false),
      markDefaultsSeeded: jest.fn(),
    };
    ensureDefaultFields = new EnsureDefaultClientFieldsUseCase(customFieldRepo, clientRepo);
    auditTrail = { record: jest.fn() };
    writeTx = { run: jest.fn((work) => work({ clients: clientRepo, contacts: {} as any, deals: {} as any, auditTrail })) };
    useCase = new UpdateClientUseCase(clientRepo, customFieldRepo, ensureDefaultFields, scopeResolver(), writeTx);
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
      access: administrator(),
    });

    expect(clientRepo.update).toHaveBeenCalledWith('t1', expect.anything());
    expect(result.client.name).toBe('New Name');
    expect(result.client.lastUpdatedByUserId).toBe('u2');
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
      access: administrator(),
    })).rejects.toThrow('Client not found or access denied');
  });
  describe('reassigning (companies.reassign)', () => {
    const assignedTo = (assignee: string) =>
      Client.create({
        id: 'c1', tenantId: 't1', name: 'Acme', contactInfo: {}, status: ClientStatus.PROSPECT,
        customFieldValues: { Name: 'Acme', Status: ClientStatus.PROSPECT, 'Assigned To': assignee },
        assignedUserId: assignee,
        lastUpdatedByUserId: 'u1', createdAt: new Date(), updatedAt: new Date(),
      }, defaultDefinitions);

    it('refuses to move the responsible salesperson without companies.reassign', async () => {
      clientRepo.findById.mockResolvedValue(assignedTo('sales-a'));

      await expect(useCase.execute({
        tenantId: 't1', clientId: 'c1', updatingUserId: 'sales-a', access: salesUser({ userId: 'sales-a' }),
        customFieldValues: { 'Assigned To': 'sales-b' },
      })).rejects.toThrow(PermissionDeniedError);
      expect(clientRepo.update).not.toHaveBeenCalled();
    });

    it('lets a holder of companies.reassign move it, and an edit that keeps it needs nothing extra', async () => {
      clientRepo.findById.mockResolvedValue(assignedTo('sales-a'));
      await useCase.execute({
        tenantId: 't1', clientId: 'c1', updatingUserId: 'mgr', access: salesManager({ userId: 'mgr' }),
        customFieldValues: { 'Assigned To': 'sales-b' },
      });

      clientRepo.findById.mockResolvedValue(assignedTo('sales-a'));
      await useCase.execute({
        tenantId: 't1', clientId: 'c1', updatingUserId: 'sales-a', access: salesUser({ userId: 'sales-a' }),
        customFieldValues: { Name: 'Acme Ltd' },
      });

      expect(clientRepo.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('internal notes', () => {
    const withNotes = (notes: string | null) =>
      Client.create({
        id: 'c1',
        tenantId: 't1',
        name: 'Acme',
        contactInfo: {},
        status: ClientStatus.PROSPECT,
        customFieldValues: { Name: 'Acme', Status: ClientStatus.PROSPECT },
        notes,
        lastUpdatedByUserId: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }, defaultDefinitions);

    it('saves notes supplied with the update', async () => {
      clientRepo.findById.mockResolvedValue(withNotes(null));

      const result = await useCase.execute({
        tenantId: 't1', clientId: 'c1', updatingUserId: 'u2', access: administrator(),
        notes: 'Prefers email contact. Renewal due in March.',
      });

      expect(result.client.notes).toBe('Prefers email contact. Renewal due in March.');
    });

    it('leaves existing notes alone when the update omits them', async () => {
      clientRepo.findById.mockResolvedValue(withNotes('Existing note'));

      // An edit that only touches a custom field must not wipe the notes.
      const result = await useCase.execute({
        tenantId: 't1', clientId: 'c1', updatingUserId: 'u2', access: administrator(),
        customFieldValues: { Name: 'Acme Renamed' },
      });

      expect(result.client.notes).toBe('Existing note');
    });

    it('clears notes when an empty string is sent', async () => {
      clientRepo.findById.mockResolvedValue(withNotes('Existing note'));

      const result = await useCase.execute({
        tenantId: 't1', clientId: 'c1', updatingUserId: 'u2', access: administrator(), notes: '',
      });

      expect(result.client.notes).toBe('');
    });
  });
});
