import { ImportClientsUseCase } from '../../../../../src/clients/application/use-cases/ImportClientsUseCase';
import { CreateClientUseCase } from '../../../../../src/clients/application/use-cases/CreateClientUseCase';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { ParsedSheet } from '../../../../../src/clients/infrastructure/excel/sheet';

describe('ImportClientsUseCase', () => {
  const tenantId = 'tenant-1';
  const authorUserId = 'user-1';

  const definitions = [
    CustomFieldDefinition.create({ id: 'f1', tenantId, fieldName: 'Company Size', fieldType: FieldType.NUMBER }),
    CustomFieldDefinition.create({ id: 'f2', tenantId, fieldName: 'Is VIP', fieldType: FieldType.BOOLEAN }),
    CustomFieldDefinition.create({ id: 'f3', tenantId, fieldName: 'Plate Number', fieldType: FieldType.ALPHANUMERIC }),
  ];

  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let createClientUseCase: jest.Mocked<Pick<CreateClientUseCase, 'execute'>>;
  let useCase: ImportClientsUseCase;

  const sheetOf = (rows: Record<string, string>[]): ParsedSheet => ({
    headers: Object.keys(rows[0] ?? {}),
    rows,
  });

  beforeEach(() => {
    customFieldRepo = {
      findByTenantId: jest.fn().mockResolvedValue(definitions),
      save: jest.fn(),
    };
    createClientUseCase = { execute: jest.fn().mockResolvedValue({ id: 'client-1' }) };
    useCase = new ImportClientsUseCase(createClientUseCase as any, customFieldRepo);
  });

  it('creates a client per row, coercing custom field values by declared type', async () => {
    const result = await useCase.execute({
      tenantId,
      authorUserId,
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
        name: 'Acme Ltd',
        email: 'hi@acme.com',
        status: ClientStatus.ACTIVE,
        customFieldValues: { 'Company Size': 42, 'Is VIP': true, 'Plate Number': 'AB 123' },
      })
    );
  });

  it('defaults a missing status to PROSPECT', async () => {
    await useCase.execute({ tenantId, authorUserId, sheet: sheetOf([{ name: 'Acme', status: '' }]) });
    expect(createClientUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ status: ClientStatus.PROSPECT })
    );
  });

  it('omits blank custom field cells rather than storing empty strings', async () => {
    await useCase.execute({
      tenantId,
      authorUserId,
      sheet: sheetOf([{ name: 'Acme', 'Company Size': '', 'Is VIP': '' }]),
    });
    expect(createClientUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ customFieldValues: {} })
    );
  });

  it('reports bad rows without aborting the batch', async () => {
    const result = await useCase.execute({
      tenantId,
      authorUserId,
      sheet: sheetOf([
        { name: 'Good One', 'Company Size': '10' },
        { name: '', 'Company Size': '10' },
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
      sheet: sheetOf([{ name: 'Acme', Unknown: 'x' }]),
    });

    expect(result.created).toBe(0);
    expect(result.errors[0]!.message).toContain('does not match any custom field');
  });

  it('surfaces a domain rejection from the create use case as a row error', async () => {
    createClientUseCase.execute.mockRejectedValueOnce(new Error('boom'));
    const result = await useCase.execute({
      tenantId, authorUserId, sheet: sheetOf([{ name: 'Acme' }]),
    });

    expect(result).toEqual({ created: 0, errors: [{ row: 2, message: 'boom' }] });
  });
});
