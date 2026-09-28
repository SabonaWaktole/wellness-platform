import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { LookupList } from '../../domain/LookupList';
import { LookupRecord } from '../../domain/LookupItem';

/** Writes to a workspace's list values. Every method takes `tenantId` first, so no write can cross tenants. */
export interface ILookupWrites {
  create(tenantId: string, list: LookupList, item: LookupRecord): Promise<void>;
  /** Replaces the value's editable fields (labels, list-specific fields, order, active) with `item`'s. */
  update(tenantId: string, list: LookupList, item: LookupRecord): Promise<void>;
  delete(tenantId: string, list: LookupList, id: string): Promise<void>;
}

export interface LookupWriteRepos {
  lookups: ILookupWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a list write and its audit entry (FR-AUD-02, 04): if the
 * audit write fails, the change rolls back.
 */
export interface ILookupWriteTransaction {
  run<T>(work: (repos: LookupWriteRepos) => Promise<T>): Promise<T>;
}
