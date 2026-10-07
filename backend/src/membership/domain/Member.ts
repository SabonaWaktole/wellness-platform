import { DomainError } from '../../shared/domain/errors/DomainError';
import type { MemberStatus } from './memberValidity';

export const MEMBER_LANGUAGES = ['sq', 'en', 'el', 'it'] as const;
export type MemberLanguage = (typeof MEMBER_LANGUAGES)[number];

export const MEMBER_LIMITS = { name: 100, email: 191, phone: { min: 6, max: 20 }, note: 2000, reason: 500 } as const;

export type MemberField = 'firstName' | 'lastName' | 'dateOfBirth' | 'phone' | 'email' | 'language' | 'cityId' | 'note' | 'identifier' | 'reason';

/** A member's details are refused. Mapped to 400 with the field. */
export class InvalidMemberError extends DomainError {
  readonly code = 'INVALID_MEMBER';

  constructor(
    readonly field: MemberField,
    message: string
  ) {
    super(message);
  }
}

/** A status change the current status does not allow. Mapped to 409. */
export class InvalidStatusChangeError extends DomainError {
  readonly code = 'INVALID_MEMBER_STATUS_CHANGE';
}

/**
 * The personal details of FR-MEM-09, normalised for storage: names with single
 * spaces, the email in lower case, the phone without spaces, dashes or
 * brackets. Normalising on write is what makes the duplicate check (FR-MEM-04)
 * a plain comparison in the database.
 */
export interface PersonalDetails {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD, or null. */
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  language: MemberLanguage;
  cityId: string | null;
  note: string | null;
}

const collapse = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const normaliseName = collapse;
export const normaliseEmail = (value: string): string => value.trim().toLowerCase();
export const normalisePhone = (value: string): string => value.replace(/[\s\-().]/g, '');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d+$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const optionalText = (value: unknown, field: MemberField, max: number): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvalidMemberError(field, 'This field must be text.');
  const text = value.trim();
  if (text === '') return null;
  if (text.length > max) throw new InvalidMemberError(field, `This field is at most ${max} characters.`);
  return text;
};

const requiredName = (value: unknown, field: 'firstName' | 'lastName'): string => {
  const text = typeof value === 'string' ? collapse(value) : '';
  if (text === '') throw new InvalidMemberError(field, 'The name is required.');
  if (text.length > MEMBER_LIMITS.name) throw new InvalidMemberError(field, `The name is at most ${MEMBER_LIMITS.name} characters.`);
  return text;
};

const birthDate = (value: unknown, today: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  const match = typeof value === 'string' ? DAY.exec(value) : null;
  const refuse = () => new InvalidMemberError('dateOfBirth', 'The date of birth must be a real date, YYYY-MM-DD, not in the future.');
  if (!match) throw refuse();
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) throw refuse();
  if (year < 1900 || (value as string) > today) throw refuse();
  return value as string;
};

/**
 * Validates and normalises the personal details of a member (FR-MEM-01,
 * FR-MEM-02, FR-MEM-09). First and last name are required, and so is one of
 * date of birth, phone or email, so the person can be recognised later. Only
 * these fields exist: nothing medical, no address, photograph or national ID
 * (FR-DPR-01, FR-DPR-03). `today` is the workspace's day, YYYY-MM-DD.
 */
export function normalisePersonalDetails(input: Record<string, unknown>, today: string): PersonalDetails {
  const firstName = requiredName(input.firstName, 'firstName');
  const lastName = requiredName(input.lastName, 'lastName');
  const dateOfBirth = birthDate(input.dateOfBirth, today);

  const rawEmail = optionalText(input.email, 'email', MEMBER_LIMITS.email);
  const email = rawEmail === null ? null : normaliseEmail(rawEmail);
  if (email !== null && !EMAIL.test(email)) throw new InvalidMemberError('email', 'The email address is not valid.');

  const rawPhone = optionalText(input.phone, 'phone', 40);
  const phone = rawPhone === null ? null : normalisePhone(rawPhone);
  if (phone !== null && (!PHONE.test(phone) || phone.length < MEMBER_LIMITS.phone.min || phone.length > MEMBER_LIMITS.phone.max)) {
    throw new InvalidMemberError('phone', 'The phone number is not valid.');
  }

  if (dateOfBirth === null && phone === null && email === null) {
    throw new InvalidMemberError('identifier', 'Enter a date of birth, a phone number or an email, so the person can be recognised later.');
  }

  const language = input.language === undefined || input.language === null ? 'sq' : input.language;
  if (!MEMBER_LANGUAGES.includes(language as MemberLanguage)) {
    throw new InvalidMemberError('language', 'The card language is Albanian, English, Greek or Italian.');
  }

  const cityId = optionalText(input.cityId, 'cityId', 191);
  const note = optionalText(input.note, 'note', MEMBER_LIMITS.note);

  return { firstName, lastName, dateOfBirth, phone, email, language: language as MemberLanguage, cityId, note };
}

/** FR-MEM-03: prefix and six digits, e.g. WP-000123. The number is not reset yearly. */
export const formatMemberNumber = (prefix: string, sequence: number): string => `${prefix}-${String(sequence).padStart(6, '0')}`;

export type StatusAction = 'SUSPEND' | 'REINSTATE' | 'CLOSE' | 'REOPEN';
export const STATUS_ACTIONS: readonly StatusAction[] = ['SUSPEND', 'REINSTATE', 'CLOSE', 'REOPEN'];

const TRANSITIONS: Record<StatusAction, { from: readonly MemberStatus[]; to: MemberStatus }> = {
  SUSPEND: { from: ['ACTIVE'], to: 'SUSPENDED' },
  REINSTATE: { from: ['SUSPENDED'], to: 'ACTIVE' },
  CLOSE: { from: ['ACTIVE', 'SUSPENDED'], to: 'CLOSED' },
  REOPEN: { from: ['CLOSED'], to: 'ACTIVE' },
};

/**
 * FR-MEM-05: Active, Suspended or Closed. A suspension needs a reason; closing
 * keeps the record and the number; a closed member can be reopened. There is no
 * deleting. Returns the new status and the cleaned reason.
 */
export function changeStatus(
  current: MemberStatus,
  action: StatusAction,
  reason: unknown
): { to: MemberStatus; reason: string | null } {
  const rule = TRANSITIONS[action];
  if (!rule) throw new InvalidStatusChangeError('Unknown status action.');
  if (!rule.from.includes(current)) throw new InvalidStatusChangeError(`A ${current.toLowerCase()} member cannot be changed this way.`);
  const text = optionalText(reason, 'reason', MEMBER_LIMITS.reason);
  if (action === 'SUSPEND' && text === null) throw new InvalidMemberError('reason', 'A reason is required to suspend a member.');
  return { to: rule.to, reason: text };
}
