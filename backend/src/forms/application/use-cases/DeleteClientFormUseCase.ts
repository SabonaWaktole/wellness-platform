import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/**
 * Soft-deletes a form. Refuses to delete the tenant's only remaining
 * client-intake form — without one, `clients/new` and `clients/:id/edit`
 * have nothing to render and adding a client stops working entirely.
 */
export class DeleteClientFormUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  async execute(tenantId: string, requestingUserRole: string, formId: string): Promise<void> {
    if (requestingUserRole !== UserRole.BUSINESS_OWNER && requestingUserRole !== UserRole.SUPER_ADMIN) {
      throw new DomainError('Only Business Owners can delete client forms');
    }

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
