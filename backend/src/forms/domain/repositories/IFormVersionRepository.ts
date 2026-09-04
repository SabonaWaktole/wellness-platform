import { FormVersion } from '../entities/FormVersion';

/**
 * A separate interface from `IClientFormRepository` rather than a widening
 * of it — see task.md's "IClientRepository fan-out" precedent. Every
 * existing form use-case test hand-rolls a `jest.Mocked<IClientFormRepository>`
 * literal; a new method there breaks every one of them for a concern
 * (published snapshots) most of those tests have nothing to do with.
 */
export interface IFormVersionRepository {
  /** Creates the immutable row. Versions are never updated or deleted. */
  save(version: FormVersion): Promise<void>;
  findByFormAndVersionNumber(tenantId: string, formId: string, versionNumber: number): Promise<FormVersion | null>;
  /**
   * By its own id, with no tenant/form scoping — used to resolve
   * `ClientForm.publishedVersionId`, which already came from a row the
   * caller trusts (the form it was read off). Callers that need tenant
   * isolation enforced at the query itself should use
   * `findByFormAndVersionNumber` instead.
   */
  findById(id: string): Promise<FormVersion | null>;
  /** Newest first — what a version-history panel renders directly. */
  listByForm(tenantId: string, formId: string): Promise<FormVersion[]>;
  /**
   * The highest `versionNumber` already published for this form, or 0 if
   * none exists yet — so the caller can publish at `latest + 1` without a
   * read-then-increment race being anything worse than a harmless retry
   * (the `@@unique([formId, versionNumber])` constraint is the real guard).
   */
  findLatestVersionNumber(tenantId: string, formId: string): Promise<number>;
}
