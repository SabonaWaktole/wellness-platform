import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IContactPersonRepository } from '../../domain/repositories/IContactPersonRepository';
import { IDealWrites } from '../../../deals/application/ports/IDealWriteTransaction';

export interface ClientWriteRepos {
  clients: IClientRepository;
  contacts: IContactPersonRepository;
  /** A company created with its first deal saves both together (FR-DEAL-02). */
  deals: IDealWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a client write and its audit entry (FR-AUD-02): a
 * reassign, an archive or a restore rolls back if the audit write fails.
 * Plain field edits do not go through this — only the actions Slice 11
 * requires audited do (see ArchiveClientUseCase, RestoreClientUseCase,
 * UpdateClientUseCase's reassignment path).
 */
export interface IClientWriteTransaction {
  run<T>(work: (repos: ClientWriteRepos) => Promise<T>): Promise<T>;
}
