import { IFormSubmissionRepository } from '../../domain/repositories/IFormSubmissionRepository';
import { IFormVersionRepository } from '../../domain/repositories/IFormVersionRepository';
import { FormSubmission } from '../../domain/entities/FormSubmission';
import { FormVersion } from '../../domain/entities/FormVersion';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

export interface SubmissionDetail {
  submission: FormSubmission;
  /** The EXACT version this submission was filled against — never the
   *  form's current published version, which may since have moved on. This
   *  is what "render against the submission's own form version" (§8, §28)
   *  means in practice: a relabelled field must still show its old label
   *  next to the answer someone gave it. */
  version: FormVersion;
}

export class GetSubmissionUseCase {
  constructor(
    private submissionRepo: IFormSubmissionRepository,
    private versionRepo: IFormVersionRepository
  ) {}

  async execute(
    tenantId: string,
    requestingUserRole: string,
    formId: string,
    submissionId: string
  ): Promise<SubmissionDetail | null> {
    if (!FormPermissions.can(requestingUserRole, 'forms:view_submissions')) {
      throw new DomainError('Only Business Owners can view form submissions');
    }
    const submission = await this.submissionRepo.findById(tenantId, submissionId);
    if (!submission || submission.formId !== formId) return null;

    const version = await this.versionRepo.findById(submission.formVersionId);
    if (!version) return null;

    return { submission, version };
  }
}
