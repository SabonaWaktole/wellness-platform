import { AccessContext } from '../../../access/domain/AccessContext';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/**
 * Soft-deletes a form. Refuses to delete the tenant's only remaining
 * client-intake form — without one, `clients/new` and `clients/:id/edit`
 * have nothing to render and adding a client stops working entirely.
 */
export class DeleteClientFormUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  async execute(tenantId: string, access: AccessContext, formId: string): Promise<void> {
    FormPermissions.ensure(access, 'forms:delete');

    const form = await this.formRepo.findById(tenantId, formId);
    if (!form) {
      throw new DomainError('Form not found');
    }

    if (form.isDefault) {
      throw new DomainError(
        'This is the client-intake form. Make another form the default before deleting this one.'
      );
    }

    await this.formRepo.softDelete(tenantId, formId);
  }
}
