import { ContactPerson } from '../../../../src/clients/domain/entities/ContactPerson';
import { CompanyContacts } from '../../../../src/clients/domain/value-objects/CompanyContacts';
import {
  ContactsRequiredError,
  ContactNotFoundError,
  PrimaryContactRequiredError,
  ContactNameRequiredError,
  ContactReachRequiredError,
} from '../../../../src/clients/domain/errors';

const contact = (id: string, overrides: Partial<Parameters<typeof ContactPerson.create>[0]> = {}) =>
  ContactPerson.create({
    id,
    tenantId: 't1',
    clientId: 'c1',
    name: `Contact ${id}`,
    phone: '+355691234567',
    isPrimary: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

describe('FR-CMP-04 ContactPerson', () => {
  it('rejects a contact with no name', () => {
    expect(() =>
      ContactPerson.create({
        id: '1', tenantId: 't1', clientId: 'c1', name: '  ', phone: '+355691234567',
        isPrimary: false, createdAt: new Date(), updatedAt: new Date(),
      })
    ).toThrow(ContactNameRequiredError);
  });

  it('rejects a contact with neither phone nor email', () => {
    expect(() =>
      ContactPerson.create({
        id: '1', tenantId: 't1', clientId: 'c1', name: 'Jane', isPrimary: false,
        createdAt: new Date(), updatedAt: new Date(),
      })
    ).toThrow(ContactReachRequiredError);
  });

  it('accepts a contact reachable by email alone', () => {
    const c = ContactPerson.create({
      id: '1', tenantId: 't1', clientId: 'c1', name: 'Jane', email: 'jane@example.com',
      isPrimary: false, createdAt: new Date(), updatedAt: new Date(),
    });
    expect(c.email).toBe('jane@example.com');
  });
});

describe('FR-CMP-04 CompanyContacts', () => {
  it('rejects an empty initial set', () => {
    expect(() => CompanyContacts.create([])).toThrow(ContactsRequiredError);
  });

  it('makes the first contact primary when none was marked', () => {
    const [first, second] = [contact('1'), contact('2')];
    const saved = CompanyContacts.create([first, second]);
    expect(saved[0].isPrimary).toBe(true);
    expect(saved[1].isPrimary).toBe(false);
  });

  it('keeps an explicitly marked primary as-is', () => {
    const saved = CompanyContacts.create([contact('1'), contact('2', { isPrimary: true })]);
    expect(saved.find((c) => c.id === '2')?.isPrimary).toBe(true);
  });

  it('makes the first contact added to an empty company primary automatically', () => {
    const set = CompanyContacts.of([]);
    const changed = set.add(contact('1'));
    expect(changed).toHaveLength(1);
    expect(changed[0].isPrimary).toBe(true);
  });

  it('does not make a second added contact primary', () => {
    const existing = contact('1', { isPrimary: true });
    const set = CompanyContacts.of([existing]);
    const changed = set.add(contact('2'));
    expect(changed[0].isPrimary).toBe(false);
  });

  it('refuses to remove the last contact', () => {
    const set = CompanyContacts.of([contact('1', { isPrimary: true })]);
    expect(() => set.remove('1')).toThrow(PrimaryContactRequiredError);
  });

  it('refuses to remove the primary contact without a replacement', () => {
    const set = CompanyContacts.of([contact('1', { isPrimary: true }), contact('2')]);
    expect(() => set.remove('1')).toThrow(PrimaryContactRequiredError);
  });

  it('removes the primary contact and promotes the named replacement', () => {
    const set = CompanyContacts.of([contact('1', { isPrimary: true }), contact('2')]);
    const { removedId, changed } = set.remove('1', '2');
    expect(removedId).toBe('1');
    expect(changed).toHaveLength(1);
    expect(changed[0].id).toBe('2');
    expect(changed[0].isPrimary).toBe(true);
  });

  it('removing a non-primary contact leaves the others untouched', () => {
    const set = CompanyContacts.of([contact('1', { isPrimary: true }), contact('2')]);
    const { removedId, changed } = set.remove('2');
    expect(removedId).toBe('2');
    expect(changed).toEqual([]);
  });

  it('setPrimary moves primary status from the old holder to the new one', () => {
    const set = CompanyContacts.of([contact('1', { isPrimary: true }), contact('2')]);
    const changed = set.setPrimary('2');
    expect(changed).toHaveLength(2);
    expect(changed.find((c) => c.id === '2')?.isPrimary).toBe(true);
    expect(changed.find((c) => c.id === '1')?.isPrimary).toBe(false);
  });

  it('setPrimary on the current primary is a no-op', () => {
    const set = CompanyContacts.of([contact('1', { isPrimary: true })]);
    expect(set.setPrimary('1')).toEqual([]);
  });

  it('operating on an unknown contact id is a not-found error', () => {
    const set = CompanyContacts.of([contact('1', { isPrimary: true })]);
    expect(() => set.setPrimary('missing')).toThrow(ContactNotFoundError);
    expect(() => set.edit('missing', { name: 'x' })).toThrow(ContactNotFoundError);
    expect(() => set.remove('missing')).toThrow(ContactNotFoundError);
  });
});
