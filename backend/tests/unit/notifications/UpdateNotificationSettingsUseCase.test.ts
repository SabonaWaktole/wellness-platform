import { UpdateNotificationSettingsUseCase } from '../../../src/notifications/application/UpdateNotificationSettingsUseCase';
import { NotificationSettings } from '../../../src/notifications/domain/NotificationSettings';
import { PermissionDeniedError } from '../../../src/access/domain/errors';
import { accessWith, administrator, ceo } from '../../support/access';

describe('UpdateNotificationSettingsUseCase', () => {
  const repo = { get: jest.fn(), save: jest.fn() };
  const useCase = new UpdateNotificationSettingsUseCase(repo as any);

  beforeEach(() => {
    repo.get.mockResolvedValue(NotificationSettings.defaults('t1'));
  });

  it('FR-RBAC-05 lets the Administrator (settings.manage) update notification settings', async () => {
    await useCase.execute({ tenantId: 't1', access: administrator(), patch: {} });
    expect(repo.save).toHaveBeenCalled();
  });

  it('FR-RBAC-05 lets any role holding settings.manage update them', async () => {
    await useCase.execute({ tenantId: 't1', access: accessWith({ 'settings.manage': true }), patch: {} });
    expect(repo.save).toHaveBeenCalled();
  });

  it('FR-RBAC-05 refuses a role without settings.manage', async () => {
    await expect(useCase.execute({ tenantId: 't1', access: ceo(), patch: {} })).rejects.toThrow(PermissionDeniedError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
