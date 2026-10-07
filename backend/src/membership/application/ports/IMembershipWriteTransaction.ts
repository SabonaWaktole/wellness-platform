import type { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import type { IBenefitStore, IMembershipSettingsStore, IRelationshipStore } from './IMembershipSettingsStore';

/** The stores a Wellness+ settings write goes through, all on one connection. */
export interface MembershipWriteRepos {
  settingsStore: IMembershipSettingsStore;
  relationshipStore: IRelationshipStore;
  benefitStore: IBenefitStore;
  /** Same connection as the stores: a failed audit write rolls the change back (FR-AUD-14). */
  auditTrail: IAuditTrail;
}

export interface IMembershipWriteTransaction {
  run<T>(work: (repos: MembershipWriteRepos) => Promise<T>): Promise<T>;
}
