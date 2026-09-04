import { FormSubmission } from '../entities/FormSubmission';

/** A separate interface, same reasoning as `IFormVersionRepository` — this
 *  concern has nothing to do with `IClientFormRepository`'s existing tests. */
export interface IFormSubmissionRepository {
  save(submission: FormSubmission): Promise<void>;
  findById(tenantId: string, id: string): Promise<FormSubmission | null>;
  /** Newest first, capped — the tenant-facing submissions list and CSV export. */
  listByForm(tenantId: string, formId: string, limit?: number): Promise<FormSubmission[]>;
}
