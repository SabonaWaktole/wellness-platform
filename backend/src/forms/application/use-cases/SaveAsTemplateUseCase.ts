import { randomUUID } from 'crypto';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ClientForm } from '../../domain/entities/ClientForm';
import { FormStatus } from '../../domain/enums/FormStatus';
import { cloneDocumentWithFreshIds } from '../../domain/value-objects/FormDocument';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/**
 * Saves a copy of a form's current layout as a reusable template (spec §30).
 *
 * The SOURCE form is untouched — this never flips an owner's working form
 * into a template out from under them, it creates a new, independent
 * `isTemplate: true` row. `cloneDocumentWithFreshIds` is what makes later
 * edits to either side not propagate: the template's document is its own
 * object from the moment this returns, not a reference into the source's.
 */
export class SaveAsTemplateUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  async execute(
    tenantId: string,
    requestingUserRole: string,
    formId: string,
    templateName: string
  ): Promise<ClientForm> {
    if (!FormPermissions.can(requestingUserRole, 'forms:manage_templates')) {
      throw new DomainError('Only Business Owners can manage form templates');
    }

    const source = await this.formRepo.findById(tenantId, formId);
    if (!source) {
      throw new DomainError('Form not found');
    }

    const template = ClientForm.create({
      id: randomUUID(),
      tenantId,
      name: templateName,
      description: source.description,
      isDefault: false,
      isTemplate: true,
      status: FormStatus.DRAFT,
      layout: cloneDocumentWithFreshIds(source.layout),
    });

    try {
      await this.formRepo.save(template);
    } catch {
      throw new DomainError(`A form named "${templateName}" already exists.`);
    }

    return template;
  }
}
