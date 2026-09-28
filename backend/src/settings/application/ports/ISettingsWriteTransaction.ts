import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { TenantProfileStore } from '../../infrastructure/TenantProfileStore';

export interface SettingsWriteRepos {
  tenantRepository: ITenantRepository;
  profileStore: TenantProfileStore;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a workspace settings write and its audit entry
 * (FR-AUD-02, 04): if the audit write fails, both the domain settings and
 * the profile fields roll back together.
 */
export interface ISettingsWriteTransaction {
  run<T>(work: (repos: SettingsWriteRepos) => Promise<T>): Promise<T>;
}
