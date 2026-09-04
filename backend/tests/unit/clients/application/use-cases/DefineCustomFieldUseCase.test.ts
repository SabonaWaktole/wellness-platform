import { DefineCustomFieldUseCase } from '../../../../../src/clients/application/use-cases/DefineCustomFieldUseCase';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { UserRole } from '../../../../../src/auth/domain/enums/UserRole';

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
    };
    useCase = new DefineCustomFieldUseCase(customFieldRepo);
  });

  it('allows BUSINESS_OWNER to create a field', async () => {
    const result = await useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.BUSINESS_OWNER,
      fieldName: 'industry',
      fieldType: FieldType.TEXT,
    });

    expect(customFieldRepo.save).toHaveBeenCalledWith('t1', expect.anything());
    expect(result.fieldName).toBe('industry');
  });

  it('rejects STAFF from creating a field', async () => {
    await expect(useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.STAFF,
      fieldName: 'industry',
      fieldType: FieldType.TEXT,
    })).rejects.toThrow('Only Business Owners can define custom fields');
  });
});
