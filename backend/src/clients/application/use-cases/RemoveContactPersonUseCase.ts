import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IContactPersonRepository } from '../../domain/repositories/IContactPersonRepository';
import { IClientWriteTransaction } from '../ports/IClientWriteTransaction';
import { CompanyContacts } from '../../domain/value-objects/CompanyContacts';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface RemoveContactPersonDTO {
  tenantId: string;
  clientId: string;
  contactId: string;
  /** Required when removing the company's current primary contact. */
  newPrimaryContactId?: string;
  access: AccessContext;
}

/**
 * Removes a contact (FR-CMP-04). The last contact on a company cannot be
 * removed at all; removing the primary needs a named replacement, which
 * becomes primary in the same write.
 */
export class RemoveContactPersonUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private contactRepo: IContactPersonRepository,
    private scopes: RecordScopeResolver,
    private writeTx: IClientWriteTransaction
  ) {}

  async execute(dto: RemoveContactPersonDTO): Promise<void> {
    const scope = await this.scopes.resolve(dto.access, 'companies.edit');
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client) throw new DomainError('Client not found');

    const existing = await this.contactRepo.listByClient(dto.tenantId, dto.clientId);
    const { removedId, changed } = CompanyContacts.of(existing).remove(dto.contactId, dto.newPrimaryContactId);

    await this.writeTx.run(async ({ contacts }) => {
      if (changed.length > 0) await contacts.saveMany(dto.tenantId, changed);
      await contacts.softDelete(dto.tenantId, removedId);
    });
  }
}
