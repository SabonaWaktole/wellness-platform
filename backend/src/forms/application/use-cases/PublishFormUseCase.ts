import { randomUUID } from 'crypto';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { IFormVersionRepository } from '../../domain/repositories/IFormVersionRepository';
import { ClientForm } from '../../domain/entities/ClientForm';
import { FormVersion } from '../../domain/entities/FormVersion';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { FormVersionConflictError } from './UpdateClientFormLayoutUseCase';
import { generateShareToken } from '../../../quotations/domain/shareToken';

interface PublishFormDTO {
  tenantId: string;
  requestingUserRole: string;
  formId: string;
  /** The `version` the caller loaded — same compare-and-set discipline as
   *  every other form mutation, so a publish can never silently clobber an
   *  edit made in another tab since the page was opened. */
  expectedVersion: number;
  publishedByUserId?: string | null;
}

/**
 * Freezes the current draft as a new, immutable `FormVersion` and points the
 * form at it (spec §28, brief §8).
 *
 * Ordering is deliberate: the version snapshot is written FIRST, and the
 * form is only pointed at it if the compare-and-set on `expectedVersion`
 * still succeeds. If a concurrent edit wins that race, the snapshot just
 * written is orphaned — its `versionNumber` is never reused (see
 * `IFormVersionRepository`) and the row itself is harmless, just wasted. The
 * alternative order (flip the form first) is worse: it would leave
 * `publishedVersionId` pointing at a version row that does not exist yet.
 * A single cross-table transaction would remove the waste entirely, but this
 * module has no multi-row write transaction port yet (the same trade-off
 * `UpdateClientFormSettingsUseCase` already accepts for the isDefault
 * demote/promote pair) — a rare wasted version number is a far smaller risk
 * than the alternative failure mode, so it is accepted rather than built
 * around here.
 */
export class PublishFormUseCase {
  constructor(
    private formRepo: IClientFormRepository,
    private versionRepo: IFormVersionRepository
  ) {}

  async execute(dto: PublishFormDTO): Promise<{ form: ClientForm; version: FormVersion }> {
    if (!FormPermissions.can(dto.requestingUserRole, 'forms:publish')) {
      throw new DomainError('Only Business Owners can publish client forms');
    }

    const existing = await this.formRepo.findById(dto.tenantId, dto.formId);
    if (!existing) {
      throw new DomainError('Form not found');
    }

    const latest = await this.versionRepo.findLatestVersionNumber(dto.tenantId, dto.formId);
    const version = FormVersion.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      formId: dto.formId,
      versionNumber: latest + 1,
      document: existing.layout,
      publishedByUserId: dto.publishedByUserId,
    });
    await this.versionRepo.save(version);

    const updated = existing.publish({ versionId: version.id, shareToken: generateShareToken() });
    const written = await this.formRepo.updateWithVersionCheck(updated, dto.expectedVersion);
    if (!written) {
      throw new FormVersionConflictError();
    }

    return { form: updated, version };
  }
}
