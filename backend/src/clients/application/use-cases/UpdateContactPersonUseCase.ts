import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IContactPersonRepository } from '../../domain/repositories/IContactPersonRepository';
import { IClientWriteTransaction } from '../ports/IClientWriteTransaction';
import { ContactPerson } from '../../domain/entities/ContactPerson';
import { CompanyContacts } from '../../domain/value-objects/CompanyContacts';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface UpdateContactPersonDTO {
  tenantId: string;
  clientId: string;
  contactId: string;
  name?: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  access: AccessContext;
}

export class UpdateContactPersonUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private contactRepo: IContactPersonRepository,
    private scopes: RecordScopeResolver,
    private writeTx: IClientWriteTransaction
  ) {}

  async execute(dto: UpdateContactPersonDTO): Promise<ContactPerson> {
    const scope = await this.scopes.resolve(dto.access, 'companies.edit');
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client) throw new DomainError('Client not found');

    const existing = await this.contactRepo.listByClient(dto.tenantId, dto.clientId);
    const changed = CompanyContacts.of(existing).edit(dto.contactId, {
      name: dto.name,
      position: dto.position,
      phone: dto.phone,
      email: dto.email,
    });

    await this.writeTx.run(({ contacts }) => contacts.saveMany(dto.tenantId, changed));

    return changed[0];
  }
}
