import { DefineCustomFieldUseCase } from '../../../../../src/clients/application/use-cases/DefineCustomFieldUseCase';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { accessWith, administrator, salesUser } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

describe('DefineCustomFieldUseCase', () => {
  let useCase: DefineCustomFieldUseCase;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;

  beforeEach(() => {
    customFieldRepo = {
      findByTenantId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findByTenantIdAndRole: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
      hasSeededDefaults: jest.fn().mockResolvedValue(false),
      markDefaultsSeeded: jest.fn(),
    };
    useCase = new DefineCustomFieldUseCase(customFieldRepo);
  });

  it('allows the Administrator (settings.manage) to create a field', async () => {
    const result = await useCase.execute({
      tenantId: 't1',
      access: administrator(),
      fieldName: 'industry',
      fieldType: FieldType.TEXT,
    });

    expect(customFieldRepo.save).toHaveBeenCalledWith('t1', expect.anything());
    expect(result.fieldName).toBe('industry');
  });

  it('FR-RBAC-05 allows any role holding settings.manage', async () => {
    await useCase.execute({
      tenantId: 't1',
      access: accessWith({ 'settings.manage': true }),
      fieldName: 'industry',
      fieldType: FieldType.TEXT,
    });
    expect(customFieldRepo.save).toHaveBeenCalled();
  });

  it('rejects a Sales User (no settings.manage) from creating a field', async () => {
    await expect(useCase.execute({
      tenantId: 't1',
      access: salesUser(),
      fieldName: 'industry',
      fieldType: FieldType.TEXT,
    })).rejects.toThrow(PermissionDeniedError);
  });

  /*
   * Without this check, a duplicate name reaches the database's
   * (tenantId, fieldName) unique constraint and the raw Prisma P2002 error —
   * a full stack trace naming the internal repository file — propagates
   * straight to the controller and out to the user, since it doesn't match
   * the PermissionDeniedError the controller maps to 403.
   */
  it('rejects a name that collides with an existing field, with a clean message', async () => {
    customFieldRepo.findByTenantId.mockResolvedValue([
      CustomFieldDefinition.create({
        id: 'f1',
        tenantId: 't1',
        fieldName: 'Name',
        fieldType: FieldType.TEXT,
      }),
    ]);

    await expect(useCase.execute({
      tenantId: 't1',
      access: administrator(),
      fieldName: 'Name',
      fieldType: FieldType.TEXT,
    })).rejects.toThrow('A field named "Name" already exists.');

    expect(customFieldRepo.save).not.toHaveBeenCalled();
  });

  it('treats the name collision as case-insensitive', async () => {
    customFieldRepo.findByTenantId.mockResolvedValue([
      CustomFieldDefinition.create({
        id: 'f1',
        tenantId: 't1',
        fieldName: 'Industry',
        fieldType: FieldType.TEXT,
      }),
    ]);

    await expect(useCase.execute({
      tenantId: 't1',
      access: administrator(),
      fieldName: 'industry',
      fieldType: FieldType.TEXT,
    })).rejects.toThrow('already exists');
  });

  it('trims the name before checking and before saving', async () => {
    customFieldRepo.findByTenantId.mockResolvedValue([]);

    const result = await useCase.execute({
      tenantId: 't1',
      access: administrator(),
      fieldName: '  Industry  ',
      fieldType: FieldType.TEXT,
    });

    expect(result.fieldName).toBe('Industry');
  });
});
