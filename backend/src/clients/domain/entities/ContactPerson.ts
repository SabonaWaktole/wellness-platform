import { ContactNameRequiredError, ContactReachRequiredError, EmailInvalidError, PhoneInvalidError } from '../errors';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;

export interface ContactPersonProps {
  id: string;
  tenantId: string;
  clientId: string;
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/**
 * A named person at a company (FR-CMP-04): name, position, phone and email.
 * Position is free text (Q2); a contact needs a name and at least one way to
 * reach it. Whether it is the company's primary contact is a fact about the
 * set of contacts, not about this row alone — see CompanyContacts, which is
 * the only place `isPrimary` is ever flipped.
 */
export class ContactPerson {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly clientId: string;
  public readonly name: string;
  public readonly position: string | null;
  public readonly phone: string | null;
  public readonly email: string | null;
  public readonly isPrimary: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly deletedAt: Date | null;

  private constructor(props: ContactPersonProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.clientId = props.clientId;
    this.name = props.name;
    this.position = props.position ?? null;
    this.phone = props.phone ?? null;
    this.email = props.email ?? null;
    this.isPrimary = props.isPrimary;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt ?? null;
  }

  public static create(props: ContactPersonProps): ContactPerson {
    const name = props.name?.trim();
    if (!name) throw new ContactNameRequiredError();

    const phone = blankToNull(props.phone);
    const email = blankToNull(props.email);
    if (!phone && !email) throw new ContactReachRequiredError();
    if (phone && !PHONE_PATTERN.test(phone)) throw new PhoneInvalidError('phone');
    if (email && !EMAIL_PATTERN.test(email)) throw new EmailInvalidError('email');

    return new ContactPerson({
      ...props,
      name,
      position: blankToNull(props.position),
      phone,
      email,
    });
  }

  public static reconstitute(props: ContactPersonProps): ContactPerson {
    return new ContactPerson(props);
  }

  public withPrimary(isPrimary: boolean): ContactPerson {
    if (isPrimary === this.isPrimary) return this;
    return new ContactPerson({ ...this, isPrimary, updatedAt: new Date() });
  }

  /** `undefined` on a field leaves it unchanged; an explicit value (including `null`) replaces it. */
  public withPatch(patch: { name?: string; position?: string | null; phone?: string | null; email?: string | null }): ContactPerson {
    return ContactPerson.create({
      ...this,
      name: patch.name !== undefined ? patch.name : this.name,
      position: patch.position !== undefined ? patch.position : this.position,
      phone: patch.phone !== undefined ? patch.phone : this.phone,
      email: patch.email !== undefined ? patch.email : this.email,
      updatedAt: new Date(),
    });
  }
}

function blankToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
