import { randomUUID } from 'crypto';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ClientForm } from '../../domain/entities/ClientForm';
import { FormStatus } from '../../domain/enums/FormStatus';
import { cloneDocumentWithFreshIds } from '../../domain/value-objects/FormDocument';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/**
 * Creates a new, ordinary form from a saved template (spec §30) — a deep
 * copy under a new name, `isTemplate: false`. The template itself is never
 * mutated: `cloneDocumentWithFreshIds` is what guarantees an edit to the new
 * form (or a later edit to the template) never leaks into the other, the
 * same independence `SaveAsTemplateUseCase` relies on in the other direction.
 */
export class CreateFormFromTemplateUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  async execute(
    tenantId: string,
    requestingUserRole: string,
    templateId: string,
    newName: string
  ): Promise<ClientForm> {
    if (!FormPermissions.can(requestingUserRole, 'forms:manage_templates')) {
      throw new DomainError('Only Business Owners can manage form templates');
    }

    const template = await this.formRepo.findById(tenantId, templateId);
    if (!template || !template.isTemplate) {
      throw new DomainError('Template not found');
    }

    const form = ClientForm.create({
      id: randomUUID(),
      tenantId,
      name: newName,
      description: template.description,
      isDefault: false,
      isTemplate: false,
      status: FormStatus.DRAFT,
      layout: cloneDocumentWithFreshIds(template.layout),
    });

    try {
      await this.formRepo.save(form);
    } catch {
      throw new DomainError(`A form named "${newName}" already exists.`);
    }

    return form;
  }
}
