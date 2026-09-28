import { UpdateTenantSettingsUseCase } from './UpdateTenantSettingsUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { accessWith, administrator, salesManager } from '../../../../tests/support/access';

describe('UpdateTenantSettingsUseCase', () => {
  const tenantRepository = { findById: jest.fn(), updateSettings: jest.fn() } as any;
  const profileStore = { update: jest.fn() } as any;
  const useCase = new UpdateTenantSettingsUseCase(tenantRepository, profileStore);

  beforeEach(() => {
    tenantRepository.findById.mockResolvedValue({ id: 't1' });
  });

  it('FR-RBAC-05 lets the Administrator (settings.manage) update settings', async () => {
    await useCase.execute({ tenantId: 't1', access: administrator(), patch: { name: 'Wellness Albania' } });
    expect(tenantRepository.updateSettings).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Wellness Albania' }));
  });

  it('FR-RBAC-05 lets any role holding settings.manage update settings', async () => {
    await useCase.execute({ tenantId: 't1', access: accessWith({ 'settings.manage': true }), patch: { name: 'X' } });
    expect(tenantRepository.updateSettings).toHaveBeenCalled();
  });

  it('FR-RBAC-05 refuses a role without settings.manage', async () => {
    await expect(useCase.execute({ tenantId: 't1', access: salesManager(), patch: { name: 'X' } }))
      .rejects.toThrow(PermissionDeniedError);
    expect(tenantRepository.updateSettings).not.toHaveBeenCalled();
  });
});
