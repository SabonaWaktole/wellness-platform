import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IContactPersonRepository } from '../../domain/repositories/IContactPersonRepository';
import { IClientWriteTransaction } from '../ports/IClientWriteTransaction';
import { CompanyContacts } from '../../domain/value-objects/CompanyContacts';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface SetPrimaryContactDTO {
  tenantId: string;
  clientId: string;
  contactId: string;
  access: AccessContext;
}

export class SetPrimaryContactUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private contactRepo: IContactPersonRepository,
    private scopes: RecordScopeResolver,
    private writeTx: IClientWriteTransaction
  ) {}

  async execute(dto: SetPrimaryContactDTO): Promise<void> {
    const scope = await this.scopes.resolve(dto.access, 'companies.edit');
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client) throw new DomainError('Client not found');

    const existing = await this.contactRepo.listByClient(dto.tenantId, dto.clientId);
    const changed = CompanyContacts.of(existing).setPrimary(dto.contactId);
    if (changed.length === 0) return;

    await this.writeTx.run(({ contacts }) => contacts.saveMany(dto.tenantId, changed));
  }
}
