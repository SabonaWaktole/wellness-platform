import { EnsureDefaultClientFieldsUseCase } from '../../../../../src/clients/application/use-cases/EnsureDefaultClientFieldsUseCase';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { FieldRole } from '../../../../../src/clients/domain/enums/FieldRole';

describe('EnsureDefaultClientFieldsUseCase', () => {
  let useCase: EnsureDefaultClientFieldsUseCase;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let clientRepo: jest.Mocked<IClientRepository>;

  // Some roles pin the field type (see ROLE_REQUIRED_TYPE), so pass it in.
  const field = (fieldName: string, role: FieldRole, order: number, fieldType = FieldType.TEXT) =>
    CustomFieldDefinition.create({
      id: `id-${fieldName}`,
      tenantId: 't1',
      fieldName,
      fieldType,
      options: fieldType === FieldType.SINGLE_SELECT ? ['ACTIVE'] : undefined,
      order,
      role,
    });

  beforeEach(() => {
    customFieldRepo = {
      findByTenantId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findByTenantIdAndRole: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
      hasSeededDefaults: jest.fn().mockResolvedValue(false),
      markDefaultsSeeded: jest.fn(),
    };
    clientRepo = { backfillLegacyBasicFields: jest.fn() } as any;
    useCase = new EnsureDefaultClientFieldsUseCase(customFieldRepo, clientRepo);
  });

  it('seeds the baseline fields for a tenant that has never been seeded', async () => {
    await useCase.execute('t1');

    const seeded = customFieldRepo.save.mock.calls.map(([, def]) => def.fieldName);
    expect(seeded).toEqual(['Name', 'Email', 'Phone', 'Status', 'Assigned To']);
    expect(customFieldRepo.markDefaultsSeeded).toHaveBeenCalledWith('t1');
    expect(clientRepo.backfillLegacyBasicFields).toHaveBeenCalled();
  });

  it('does not recreate a roled field the tenant deleted after seeding', async () => {
    // The tenant deleted Email; only the remaining four come back.
    customFieldRepo.hasSeededDefaults.mockResolvedValue(true);
    const remaining = [
      field('Name', FieldRole.PRIMARY_NAME, 0),
      field('Phone', FieldRole.PRIMARY_PHONE, 1),
      field('Status', FieldRole.STATUS, 2, FieldType.SINGLE_SELECT),
      field('Assigned To', FieldRole.ASSIGNEE, 3, FieldType.USER_REFERENCE),
    ];
    customFieldRepo.findByTenantId.mockResolvedValue(remaining);

    const result = await useCase.execute('t1');

    expect(customFieldRepo.save).not.toHaveBeenCalled();
    expect(result).toEqual(remaining);
  });

  it('stamps a tenant seeded before the marker existed without re-seeding', async () => {
    customFieldRepo.findByTenantId.mockResolvedValue([
      field('Name', FieldRole.PRIMARY_NAME, 0),
      field('Email', FieldRole.PRIMARY_EMAIL, 1, FieldType.EMAIL),
      field('Phone', FieldRole.PRIMARY_PHONE, 2),
      field('Status', FieldRole.STATUS, 3, FieldType.SINGLE_SELECT),
      field('Assigned To', FieldRole.ASSIGNEE, 4, FieldType.USER_REFERENCE),
    ]);

    await useCase.execute('t1');

    expect(customFieldRepo.save).not.toHaveBeenCalled();
    expect(customFieldRepo.markDefaultsSeeded).toHaveBeenCalledWith('t1');
  });
});
