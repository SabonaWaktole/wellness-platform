import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IContactPersonRepository } from '../../domain/repositories/IContactPersonRepository';
import { IClientWriteTransaction } from '../ports/IClientWriteTransaction';
import { ContactPerson } from '../../domain/entities/ContactPerson';
import { CompanyContacts } from '../../domain/value-objects/CompanyContacts';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface AddContactPersonDTO {
  tenantId: string;
  clientId: string;
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  access: AccessContext;
}

/**
 * Adds a contact to an existing company (FR-CMP-04). The first contact ever
 * added to a company becomes primary automatically — see CompanyContacts.add.
 */
export class AddContactPersonUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private contactRepo: IContactPersonRepository,
    private scopes: RecordScopeResolver,
    private writeTx: IClientWriteTransaction
  ) {}

  async execute(dto: AddContactPersonDTO): Promise<ContactPerson> {
    const scope = await this.scopes.resolve(dto.access, 'companies.edit');
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client) throw new DomainError('Client not found');

    const existing = await this.contactRepo.listByClient(dto.tenantId, dto.clientId);
    const candidate = ContactPerson.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      clientId: dto.clientId,
      name: dto.name,
      position: dto.position,
      phone: dto.phone,
      email: dto.email,
      isPrimary: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const changed = CompanyContacts.of(existing).add(candidate);

    await this.writeTx.run(({ contacts }) => contacts.saveMany(dto.tenantId, changed));

    return changed.find((c) => c.id === candidate.id)!;
  }
}
