import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { StatusDomain } from '../../domain/StatusCatalogue';
import { StatusLabel } from '../../domain/StatusLabel';

/** Writes to a workspace's status labels. Every method takes `tenantId` first, so no write can cross tenants. */
export interface IStatusLabelWrites {
  /** Creates the override row if none exists yet, or replaces it (an upsert: there is no create/delete lifecycle here). */
  upsert(tenantId: string, domain: StatusDomain, item: StatusLabel): Promise<void>;
}

export interface StatusLabelWriteRepos {
  statusLabels: IStatusLabelWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a status label write and its audit entry (FR-AUD-02,
 * 04): if the audit write fails, the change rolls back.
 */
export interface IStatusLabelWriteTransaction {
  run<T>(work: (repos: StatusLabelWriteRepos) => Promise<T>): Promise<T>;
}
