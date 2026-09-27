import { DeleteCustomFieldUseCase } from '../../../../../src/clients/application/use-cases/DeleteCustomFieldUseCase';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { FieldRole } from '../../../../../src/clients/domain/enums/FieldRole';
import { administrator } from '../../../../support/access';

describe('DeleteCustomFieldUseCase', () => {
  const repo = { findById: jest.fn(), delete: jest.fn() } as any;
  const useCase = new DeleteCustomFieldUseCase(repo);

  it('deletes an ordinary field', async () => {
    repo.findById.mockResolvedValue(
      CustomFieldDefinition.create({ id: 'f1', tenantId: 't1', fieldName: 'Industry', fieldType: FieldType.TEXT })
    );
    await useCase.execute({ tenantId: 't1', access: administrator(), fieldId: 'f1' });
    expect(repo.delete).toHaveBeenCalledWith('t1', 'f1');
  });

  it('D7 refuses to delete the responsible-salesperson field, which data scope depends on', async () => {
    repo.findById.mockResolvedValue(
      CustomFieldDefinition.create({
        id: 'f2', tenantId: 't1', fieldName: 'Assigned To', fieldType: FieldType.USER_REFERENCE, role: FieldRole.ASSIGNEE,
      })
    );
    await expect(useCase.execute({ tenantId: 't1', access: administrator(), fieldId: 'f2' })).rejects.toThrow('locked');
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
