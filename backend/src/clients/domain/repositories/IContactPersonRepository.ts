import { ContactPerson } from '../entities/ContactPerson';

export interface IContactPersonRepository {
  /** Live (non-deleted) contacts of one company, primary first then by name. */
  listByClient(tenantId: string, clientId: string): Promise<ContactPerson[]>;
  /** Live contacts of several companies at once, keyed by clientId — for search result enrichment. */
  listByClients(tenantId: string, clientIds: string[]): Promise<Map<string, ContactPerson[]>>;
  saveMany(tenantId: string, contacts: ContactPerson[]): Promise<void>;
  softDelete(tenantId: string, id: string): Promise<void>;
}
