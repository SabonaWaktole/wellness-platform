import { AccessContext } from '../../access/domain/AccessContext';
import { INotificationSettingsRepository } from '../domain/INotificationSettingsRepository';
import { NotificationSettings, NotificationSettingsPatch } from '../domain/NotificationSettings';

export interface UpdateNotificationSettingsDTO {
  tenantId: string;
  access: AccessContext;
  patch: NotificationSettingsPatch;
}

export class UpdateNotificationSettingsUseCase {
  constructor(private readonly repo: INotificationSettingsRepository) {}

  async execute(dto: UpdateNotificationSettingsDTO): Promise<NotificationSettings> {
    // settings.manage (FR-RBAC-05), matching UpdateTenantSettingsUseCase.
    dto.access.ensure('settings.manage');

    const current = await this.repo.get(dto.tenantId);
    // Validation lives in the entity: `withPatch` checks the RESULT, so a
    // partial update cannot reach a state a full write would have refused.
    const updated = current.withPatch(dto.patch);
    await this.repo.save(updated);
    return updated;
  }
}
