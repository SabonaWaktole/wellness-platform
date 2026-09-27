import { AccessContext } from '../../../access/domain/AccessContext';
import { randomUUID } from 'crypto';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ClientForm } from '../../domain/entities/ClientForm';
import { FormStatus } from '../../domain/enums/FormStatus';
import { emptyDocument } from '../../domain/value-objects/FormDocument';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface CreateClientFormDTO {
  tenantId: string;
  access: AccessContext;
  name: string;
  description?: string | null;
}

/**
 * A new, empty canvas — the "Create Form" workflow's landing state (§1: the
 * owner is taken straight to the Form Builder page with a blank page).
 *
 * `@@unique([tenantId, name])` is enforced by the database, not re-checked
 * here first: a check-then-insert has the same race the field-role check
 * elsewhere in this module accepts, and the constraint violation is caught
 * and turned into a message naming the actual problem.
 *
 * Known limitation: the unique index is not partial, so a name that belonged
 * to a form the owner has since deleted cannot be reused. Freeing deleted
 * names back up needs a migration on both providers and is deferred.
 */
export class CreateClientFormUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  async execute(dto: CreateClientFormDTO): Promise<ClientForm> {
    FormPermissions.ensure(dto.access, 'forms:create');

    const form = ClientForm.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      name: dto.name,
      description: dto.description,
      isDefault: false,
      status: FormStatus.DRAFT,
      layout: emptyDocument(),
    });

    try {
      await this.formRepo.save(form);
    } catch {
      throw new DomainError(`A form named "${dto.name}" already exists.`);
    }

    return form;
  }
}
