import { ContactPerson } from '../entities/ContactPerson';
import { ContactNotFoundError, ContactsRequiredError, PrimaryContactRequiredError } from '../errors';

/**
 * The rules that only make sense about a company's contacts as a SET
 * (FR-CMP-04): at least one, exactly one primary. `ContactPerson` validates
 * one row in isolation; this is where "which one is primary" and "can this
 * one be removed" live, because both questions depend on the others in the
 * set.
 *
 * Every operation returns only the rows that changed, so a use case persists
 * the minimum — see `IContactPersonRepository.saveMany`.
 */
export class CompanyContacts {
  private constructor(private readonly contacts: ContactPerson[]) {}

  public static of(contacts: ContactPerson[]): CompanyContacts {
    return new CompanyContacts(contacts);
  }

  public list(): ContactPerson[] {
    return [...this.contacts];
  }

  /**
   * The initial set for a new company. Needs at least one contact. If none
   * is marked primary, the first becomes primary; if more than one is
   * marked, only the first of those wins — the caller should not normally
   * send more than one.
   */
  public static create(initial: ContactPerson[]): ContactPerson[] {
    if (initial.length === 0) throw new ContactsRequiredError();
    const alreadyPrimary = initial.find((c) => c.isPrimary);
    if (alreadyPrimary) return initial;
    return initial.map((c, i) => (i === 0 ? c.withPrimary(true) : c));
  }

  /** Adding the first contact to an empty company makes it primary automatically. */
  public add(contact: ContactPerson): ContactPerson[] {
    const shouldBePrimary = this.contacts.length === 0;
    return [shouldBePrimary ? contact.withPrimary(true) : contact];
  }

  public edit(id: string, patch: { name?: string; position?: string | null; phone?: string | null; email?: string | null }): ContactPerson[] {
    return [this.find(id).withPatch(patch)];
  }

  public setPrimary(id: string): ContactPerson[] {
    const target = this.find(id);
    if (target.isPrimary) return [];
    const changed: ContactPerson[] = [target.withPrimary(true)];
    const oldPrimary = this.contacts.find((c) => c.isPrimary && c.id !== id);
    if (oldPrimary) changed.push(oldPrimary.withPrimary(false));
    return changed;
  }

  /**
   * Removing the last contact is refused outright. Removing the primary
   * needs `newPrimaryId` naming another live contact, which becomes primary
   * in the same operation.
   */
  public remove(id: string, newPrimaryId?: string): { removedId: string; changed: ContactPerson[] } {
    const target = this.find(id);
    if (this.contacts.length === 1) throw new PrimaryContactRequiredError();

    if (!target.isPrimary) {
      return { removedId: id, changed: [] };
    }

    if (!newPrimaryId || newPrimaryId === id) throw new PrimaryContactRequiredError();
    const successor = this.find(newPrimaryId);
    return { removedId: id, changed: [successor.withPrimary(true)] };
  }

  private find(id: string): ContactPerson {
    const found = this.contacts.find((c) => c.id === id);
    if (!found) throw new ContactNotFoundError();
    return found;
  }
}
