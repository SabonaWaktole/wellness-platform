import { randomUUID } from 'crypto';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ClientForm } from '../../domain/entities/ClientForm';
import { FormStatus } from '../../domain/enums/FormStatus';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/** Copies a form's layout under a new name. Never copies `isDefault`. */
export class DuplicateClientFormUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  async execute(
    tenantId: string,
    requestingUserRole: string,
    formId: string,
    newName: string
  ): Promise<ClientForm> {
    if (!FormPermissions.can(requestingUserRole, 'forms:create')) {
      throw new DomainError('Only Business Owners can duplicate client forms');
    }

    const source = await this.formRepo.findById(tenantId, formId);
    if (!source) {
      throw new DomainError('Form not found');
    }

    const copy = ClientForm.create({
      id: randomUUID(),
      tenantId,
      name: newName,
      description: source.description,
      isDefault: false,
      status: FormStatus.DRAFT,
      layout: source.layout,
    });

    try {
      await this.formRepo.save(copy);
    } catch {
      throw new DomainError(`A form named "${newName}" already exists.`);
    }

    return copy;
  }
}
