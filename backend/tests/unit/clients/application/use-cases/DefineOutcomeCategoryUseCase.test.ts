import { DefineOutcomeCategoryUseCase } from '../../../../../src/clients/application/use-cases/DefineOutcomeCategoryUseCase';
import { IOutcomeCategoryRepository } from '../../../../../src/clients/domain/repositories/IOutcomeCategoryRepository';
import { administrator, salesUser } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

describe('DefineOutcomeCategoryUseCase', () => {
  let useCase: DefineOutcomeCategoryUseCase;
  let outcomeRepo: jest.Mocked<IOutcomeCategoryRepository>;

  beforeEach(() => {
    outcomeRepo = { findByTenantId: jest.fn(), findById: jest.fn(), save: jest.fn() };
    useCase = new DefineOutcomeCategoryUseCase(outcomeRepo);
  });

  it('allows BUSINESS_OWNER to create a category', async () => {
    const result = await useCase.execute({
      tenantId: 't1',
      access: administrator(),
      label: 'Closed Won',
    });

    expect(outcomeRepo.save).toHaveBeenCalledWith('t1', expect.anything());
    expect(result.label).toBe('Closed Won');
  });

  it('rejects STAFF from creating a category', async () => {
    await expect(useCase.execute({
      tenantId: 't1',
      access: salesUser(),
      label: 'Closed Won',
    })).rejects.toThrow(PermissionDeniedError);
  });
});
