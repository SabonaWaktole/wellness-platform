import { BulkUpdateTenantSettingsUseCase } from './BulkUpdateTenantSettingsUseCase';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { UnauthorizedError } from '../../../auth/domain/errors';

describe('BulkUpdateTenantSettingsUseCase', () => {
  let tenantRepository: jest.Mocked<ITenantRepository>;
  let useCase: BulkUpdateTenantSettingsUseCase;

  beforeEach(() => {
    tenantRepository = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      updateSettings: jest.fn(),
      updateSettingsForMany: jest.fn().mockResolvedValue(2),
      setSubscriptionStatus: jest.fn(),
      setSalesWorkflow: jest.fn(),
    };
    useCase = new BulkUpdateTenantSettingsUseCase(tenantRepository);
  });

  it('applies the settings to exactly the selected tenants, for SUPER_ADMIN', async () => {
    const result = await useCase.execute({
      callerRole: UserRole.SUPER_ADMIN,
      tenantIds: ['t1', 't2'],
      settings: { currency: 'EUR' },
    });

    expect(tenantRepository.updateSettingsForMany).toHaveBeenCalledWith(['t1', 't2'], {
      currency: 'EUR',
    });
    expect(result.updatedCount).toBe(2);
  });

  // This is the guard `UpdateTenantSettingsUseCase` deliberately does NOT
  // have — that one exists precisely to keep SUPER_ADMIN out of a single
  // tenant's own settings. This use case is the separate, explicit door for
  // the same role to reach several tenants at once, so ironically it is the
  // ONLY place SUPER_ADMIN is the role that is let through.
  it.each([UserRole.BUSINESS_OWNER, UserRole.STAFF])('refuses %s', async (role) => {
    await expect(
      useCase.execute({ callerRole: role, tenantIds: ['t1'], settings: { currency: 'EUR' } })
    ).rejects.toThrow(UnauthorizedError);
    expect(tenantRepository.updateSettingsForMany).not.toHaveBeenCalled();
  });
});
