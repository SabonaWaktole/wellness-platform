import { ImportClientsUseCase } from '../../../../../src/clients/application/use-cases/ImportClientsUseCase';
import { CreateClientUseCase } from '../../../../../src/clients/application/use-cases/CreateClientUseCase';
import { EnsureDefaultClientFieldsUseCase } from '../../../../../src/clients/application/use-cases/EnsureDefaultClientFieldsUseCase';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { FieldRole } from '../../../../../src/clients/domain/enums/FieldRole';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { ParsedSheet } from '../../../../../src/clients/infrastructure/excel/sheet';
import { administrator, scopeResolver } from '../../../../support/access';

describe('ImportClientsUseCase', () => {
  const tenantId = 'tenant-1';
  const authorUserId = 'user-1';

  const definitions = [
    CustomFieldDefinition.create({
      id: 'name-field', tenantId, fieldName: 'Name', fieldType: FieldType.TEXT,
      role: FieldRole.PRIMARY_NAME, required: true,
    }),
    CustomFieldDefinition.create({
      id: 'email-field', tenantId, fieldName: 'Email', fieldType: FieldType.EMAIL,
      role: FieldRole.PRIMARY_EMAIL,
    }),
    CustomFieldDefinition.create({
      id: 'phone-field', tenantId, fieldName: 'Phone', fieldType: FieldType.TEXT,
      role: FieldRole.PRIMARY_PHONE,
    }),
    CustomFieldDefinition.create({
      id: 'status-field', tenantId, fieldName: 'Status', fieldType: FieldType.SINGLE_SELECT,
      options: ['PROSPECT', 'ACTIVE', 'INACTIVE'], role: FieldRole.STATUS, required: true,
    }),
    CustomFieldDefinition.create({ id: 'f1', tenantId, fieldName: 'Company Size', fieldType: FieldType.NUMBER }),
    CustomFieldDefinition.create({ id: 'f2', tenantId, fieldName: 'Is VIP', fieldType: FieldType.BOOLEAN }),
    CustomFieldDefinition.create({ id: 'f3', tenantId, fieldName: 'Plate Number', fieldType: FieldType.ALPHANUMERIC }),
  ];

  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let clientRepo: jest.Mocked<IClientRepository>;
  let createClientUseCase: jest.Mocked<Pick<CreateClientUseCase, 'execute'>>;
  let ensureDefaultFields: EnsureDefaultClientFieldsUseCase;
  let useCase: ImportClientsUseCase;

  const sheetOf = (rows: Record<string, string>[]): ParsedSheet => ({
    headers: Object.keys(rows[0] ?? {}),
    rows,
  });

  beforeEach(() => {
    customFieldRepo = {
      findByTenantId: jest.fn().mockResolvedValue(definitions),
      findById: jest.fn(),
      findByTenantIdAndRole: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
      hasSeededDefaults: jest.fn().mockResolvedValue(false),
      markDefaultsSeeded: jest.fn(),
    };
    clientRepo = {
      findById: jest.fn(),
      search: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      countByTenant: jest.fn(),
      findRecentByTenant: jest.fn(),
      backfillLegacyBasicFields: jest.fn(),
    } as any;
    createClientUseCase = { execute: jest.fn().mockResolvedValue({ id: 'client-1' }) };
    ensureDefaultFields = new EnsureDefaultClientFieldsUseCase(customFieldRepo, clientRepo);
    useCase = new ImportClientsUseCase(createClientUseCase as any, ensureDefaultFields);
  });

  it('creates a client per row, coercing custom field values by declared type', async () => {
    const result = await useCase.execute({
      tenantId,
      authorUserId,
      access: administrator(),
      sheet: sheetOf([
        {
          name: 'Acme Ltd',
          email: 'hi@acme.com',
          phone: '+123',
          status: 'active',
          'Company Size': '42',
          'Is VIP': 'yes',
          'Plate Number': 'AB 123',
        },
      ]),
    });

    expect(result).toEqual({ created: 1, errors: [] });
    expect(createClientUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        authorUserId,
        access: administrator(),
        customFieldValues: {
          Name: 'Acme Ltd',
          Email: 'hi@acme.com',
          Phone: '+123',
          Status: ClientStatus.ACTIVE,
          'Company Size': 42,
          'Is VIP': true,
          'Plate Number': 'AB 123',
        },
      })
    );
  });

  it('defaults a missing status to PROSPECT', async () => {
    await useCase.execute({ tenantId, authorUserId, access: administrator(), sheet: sheetOf([{ name: 'Acme', status: '' }]) });
    expect(createClientUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldValues: expect.objectContaining({ Status: ClientStatus.PROSPECT }),
      })
    );
  });

  it('omits blank custom field cells rather than storing empty strings', async () => {
    await useCase.execute({
      tenantId,
      authorUserId,
      access: administrator(),
      sheet: sheetOf([{ name: 'Acme', 'Company Size': '', 'Is VIP': '' }]),
    });
    expect(createClientUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldValues: { Name: 'Acme', Status: ClientStatus.PROSPECT },
      })
    );
  });

  it('reports bad rows without aborting the batch', async () => {
    const result = await useCase.execute({
      tenantId,
      authorUserId,
      access: administrator(),
      sheet: sheetOf([
        { name: 'Good One', 'Company Size': '10' },
        { name: 'Unknown Column', Unknown: 'x' },
        { name: 'Bad Number', 'Company Size': 'twelve' },
        { name: 'Another Good', 'Company Size': '20' },
      ]),
    });

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]!.row).toBe(3);
    expect(result.errors[1]!.message).toContain('not a valid number');
  });

  it('rejects a column that matches no custom field', async () => {
    const result = await useCase.execute({
      tenantId,
      authorUserId,
      access: administrator(),
      sheet: sheetOf([{ name: 'Acme', Unknown: 'x' }]),
    });

    expect(result.created).toBe(0);
    expect(result.errors[0]!.message).toContain('does not match any custom field');
  });

  it('surfaces a domain rejection from the create use case as a row error', async () => {
    createClientUseCase.execute.mockRejectedValueOnce(new Error('boom'));
    const result = await useCase.execute({
      tenantId, authorUserId, access: administrator(), sheet: sheetOf([{ name: 'Acme' }]),
    });

    expect(result).toEqual({ created: 0, errors: [{ row: 2, message: 'boom' }] });
  });
});
