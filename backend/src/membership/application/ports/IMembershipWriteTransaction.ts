import type { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import type { IBenefitStore, IMembershipSettingsStore, IRelationshipStore } from './IMembershipSettingsStore';
import type { IMemberPaymentStore, IReceiptNumbers } from './IMemberPaymentStore';
import type { IMemberNumbers, IMemberStore } from './IMemberStore';
import type { IVipRequestStore } from './IVipRequestStore';
import type { IEmployeeImportStore } from './IEmployeeImportStore';

/** The stores a Wellness+ settings write goes through, all on one connection. */
export interface MembershipWriteRepos {
  settingsStore: IMembershipSettingsStore;
  relationshipStore: IRelationshipStore;
  benefitStore: IBenefitStore;
  memberStore: IMemberStore;
  memberNumbers: IMemberNumbers;
  paymentStore: IMemberPaymentStore;
  receiptNumbers: IReceiptNumbers;
  vipStore: IVipRequestStore;
  importStore: IEmployeeImportStore;
  /** Same connection as the stores: a failed audit write rolls the change back (FR-AUD-14). */
  auditTrail: IAuditTrail;
}

export interface IMembershipWriteTransaction {
  /** `timeoutMs` lifts the database's default limit for a transaction that writes a thousand rows (NFR-PERF-05). */
  run<T>(work: (repos: MembershipWriteRepos) => Promise<T>, options?: { timeoutMs?: number }): Promise<T>;
}
