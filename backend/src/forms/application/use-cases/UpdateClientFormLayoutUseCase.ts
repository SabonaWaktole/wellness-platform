import { AccessContext } from '../../../access/domain/AccessContext';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ICustomFieldDefinitionRepository } from '../../../clients/domain/repositories/ICustomFieldDefinitionRepository';
import { ClientForm } from '../../domain/entities/ClientForm';
import { FormDocumentValidator } from '../../domain/services/FormDocumentValidator';
import { FormDocument } from '../../domain/value-objects/FormDocument';
import { UNPLACED_SECTION_ID } from './GetClientFormUseCase';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface UpdateClientFormLayoutDTO {
  tenantId: string;
  access: AccessContext;
  formId: string;
  layout: FormDocument;
  /** The `version` the builder loaded. Rejected if the stored one moved on. */
  expectedVersion: number;
}

/**
 * Thrown when another session saved this form first. Distinct from a plain
 * DomainError so the controller can answer 409 instead of 400 — the caller's
 * request was well-formed, it is just no longer based on current state.
 */
export class FormVersionConflictError extends DomainError {
  constructor() {
    super('This form was changed somewhere else. Reload it before saving again.');
  }
}

export class UpdateClientFormLayoutUseCase {
  constructor(
    private formRepo: IClientFormRepository,
    private customFieldRepo: ICustomFieldDefinitionRepository
  ) {}

  async execute(dto: UpdateClientFormLayoutDTO): Promise<ClientForm> {
    FormPermissions.ensure(dto.access, 'forms:edit');

    const existing = await this.formRepo.findById(dto.tenantId, dto.formId);
    if (!existing) {
      throw new DomainError('Form not found');
    }

    const document = this.stripSyntheticSections(dto.layout);

    const definitions = await this.customFieldRepo.findByTenantId(dto.tenantId);
    FormDocumentValidator.validate(document, definitions, { isDefaultForm: existing.isDefault });

    const updated = existing.withLayout(document);
    const written = await this.formRepo.updateWithVersionCheck(updated, dto.expectedVersion);
    if (!written) {
      throw new FormVersionConflictError();
    }

    return updated;
  }

  /**
   * GetClientFormUseCase appends a synthetic "Not yet placed" section to the
   * default form so fields created outside the builder stay reachable. It is a
   * read-model artefact, not part of the document — if a save round-tripped it
   * back in, it would become a real section and those fields would stop being
   * recomputed, so the rescue would silently stop working the first time an
   * owner pressed Save without touching them.
   */
  private stripSyntheticSections(document: FormDocument): FormDocument {
    return {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        sections: page.sections.filter((section) => section.id !== UNPLACED_SECTION_ID),
      })),
    };
  }
}
