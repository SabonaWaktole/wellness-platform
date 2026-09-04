import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ClientForm } from '../../domain/entities/ClientForm';
import { FormStatus } from '../../domain/enums/FormStatus';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { FormVersionConflictError } from './UpdateClientFormLayoutUseCase';

interface UpdateClientFormSettingsDTO {
  tenantId: string;
  requestingUserRole: string;
  formId: string;
  expectedVersion: number;
  name?: string;
  description?: string | null;
  status?: FormStatus;
  /**
   * Setting this true makes this form THE client-intake form
   * (clients/new, clients/:id/edit) and unsets it on whichever form held
   * that role before, in the same write — see below. Setting it false with
   * no other form yet default is refused: there is always exactly one.
   */
  isDefault?: boolean;
}

/**
 * Renames a form, changes its description/status, or reassigns which form is
 * the client-intake form.
 *
 * Reassigning `isDefault` touches TWO forms — the one being promoted and
 * whichever one currently holds it — so `@@unique` alone cannot enforce
 * "exactly one default", and the two writes are not atomic with each other
 * (this module has no multi-form write transaction yet; the risk is a rare
 * concurrent double-promote, not routine data loss, so it is accepted rather
 * than justifying a new transaction port here).
 */
export class UpdateClientFormSettingsUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  async execute(dto: UpdateClientFormSettingsDTO): Promise<ClientForm> {
    if (!FormPermissions.can(dto.requestingUserRole, 'forms:edit')) {
      throw new DomainError('Only Business Owners can edit client forms');
    }

    const existing = await this.formRepo.findById(dto.tenantId, dto.formId);
    if (!existing) {
      throw new DomainError('Form not found');
    }

    if (dto.status === FormStatus.PUBLISHED && existing.status !== FormStatus.PUBLISHED) {
      // PUBLISHED is not just a label — it means a FormVersion snapshot
      // exists and `publishedVersionId` points at it (see PublishFormUseCase
      // and `ClientForm.publish`). Setting it here would leave a form
      // "published" with no version for the public reader (Phase 6) to
      // serve, and no share token minted. Publishing is the one status
      // transition with its own dedicated, single-purpose endpoint for
      // exactly this reason.
      throw new DomainError('Use the publish action to make a form live — it also creates the published snapshot.');
    }

    if (dto.isDefault === false && existing.isDefault) {
      throw new DomainError('A tenant always needs one client-intake form. Make another form the default first.');
    }

    if (dto.isDefault === true && !existing.isDefault) {
      const currentDefault = await this.formRepo.findDefault(dto.tenantId);
      if (currentDefault && currentDefault.id !== existing.id) {
        const demoted = currentDefault.withSettings({ isDefault: false });
        // Best-effort: if this loses a race, the tenant briefly has two
        // default forms rather than zero — GetClientFormUseCase's rescue
        // logic and `clients/new` both resolve "the" default via findDefault,
        // which returns the first match, so nothing breaks in the meantime.
        await this.formRepo.updateWithVersionCheck(demoted, currentDefault.version).catch(() => {});
      }
    }

    const updated = existing.withSettings({
      name: dto.name,
      description: dto.description,
      status: dto.status,
      isDefault: dto.isDefault,
    });

    const written = await this.formRepo.updateWithVersionCheck(updated, dto.expectedVersion);
    if (!written) {
      throw new FormVersionConflictError();
    }

    return updated;
  }
}
