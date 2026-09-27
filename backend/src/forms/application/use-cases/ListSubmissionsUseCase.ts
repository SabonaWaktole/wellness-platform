import { AccessContext } from '../../../access/domain/AccessContext';
import { IFormSubmissionRepository } from '../../domain/repositories/IFormSubmissionRepository';
import { FormSubmission } from '../../domain/entities/FormSubmission';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/**
 * Newest-first list for the tenant-facing submissions tab and CSV export.
 *
 * Owner-only, checked here rather than left to route middleware alone —
 * same defense-in-depth precedent as `DeleteClientFormUseCase`. Submissions
 * can carry whatever PII a form asked for, and the builder page itself is
 * already owner-only (`routes/index.tsx`); the read API should not be a
 * wider door than the UI that leads to it.
 */
export class ListSubmissionsUseCase {
  constructor(private submissionRepo: IFormSubmissionRepository) {}

  async execute(tenantId: string, access: AccessContext, formId: string): Promise<FormSubmission[]> {
    FormPermissions.ensure(access, 'forms:view_submissions');
    return this.submissionRepo.listByForm(tenantId, formId);
  }
}
