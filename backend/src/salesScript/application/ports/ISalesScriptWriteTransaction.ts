import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import type { RichTextDoc } from '../../../shared/domain/richText';
import { ISalesScriptStore } from './ISalesScriptStore';

export interface ScriptContent {
  contentSq: RichTextDoc;
  contentEn: RichTextDoc | null;
}

/**
 * Writes to a workspace's sales script. Every method takes `tenantId` first,
 * so no write can cross tenants. The reads are on the same connection, so a
 * use case decides on what the transaction sees. A second draft or a second
 * published version for one workspace is refused by the database and
 * surfaces as `SalesScriptConflictError`.
 */
export interface ISalesScriptWrites extends ISalesScriptStore {
  createDraft(tenantId: string, draft: ScriptContent & { id: string; version: number; createdByUserId: string | null }): Promise<void>;
  updateDraft(tenantId: string, id: string, content: ScriptContent): Promise<void>;
  /** The published version steps down; it is kept, with its author and date. */
  supersede(tenantId: string, id: string): Promise<void>;
  publish(tenantId: string, id: string, by: { publishedByUserId: string | null; publishedAt: Date }): Promise<void>;
}

export interface SalesScriptWriteRepos {
  scripts: ISalesScriptWrites;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a script write and, for a publish, its audit entry
 * (FR-SCR-05, FR-AUD-09): if the audit write fails, the publish rolls back.
 */
export interface ISalesScriptWriteTransaction {
  run<T>(work: (repos: SalesScriptWriteRepos) => Promise<T>): Promise<T>;
}
