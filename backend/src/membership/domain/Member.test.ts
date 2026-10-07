import {
  changeStatus,
  formatMemberNumber,
  InvalidMemberError,
  InvalidStatusChangeError,
  normalisePersonalDetails,
  type StatusAction,
} from './Member';
import type { MemberStatus } from './memberValidity';

const TODAY = '2026-10-07';
const valid = { firstName: 'Ana', lastName: 'Hoxha', phone: '+355 69 123 4567' };
const refusal = (input: Record<string, unknown>) => {
  try {
    normalisePersonalDetails(input, TODAY);
  } catch (error) {
    return error instanceof InvalidMemberError ? error.field : 'other';
  }
  return null;
};

describe('FR-MEM-01 a member is registered with a name and one identifier', () => {
  it('FR-MEM-01 refuses a missing or blank last name or first name', () => {
    expect(refusal({ ...valid, lastName: undefined })).toBe('lastName');
    expect(refusal({ ...valid, lastName: '   ' })).toBe('lastName');
    expect(refusal({ ...valid, firstName: '' })).toBe('firstName');
  });

  it('FR-MEM-01 refuses a name with no date of birth, phone or email', () => {
    expect(refusal({ firstName: 'Ana', lastName: 'Hoxha' })).toBe('identifier');
  });

  it.each([
    ['date of birth', { dateOfBirth: '1990-05-17' }],
    ['phone', { phone: '0691234567' }],
    ['email', { email: 'ana@example.com' }],
  ])('FR-MEM-01 accepts the name with only a %s', (_label, extra) => {
    expect(refusal({ firstName: 'Ana', lastName: 'Hoxha', ...extra })).toBeNull();
  });
});

describe('FR-MEM-02 the personal details are validated and normalised', () => {
  it('FR-MEM-02 normalises case and spacing so the duplicate check is a plain comparison (FR-MEM-04)', () => {
    const details = normalisePersonalDetails(
      { firstName: '  Ana   Maria ', lastName: 'HOXHA', email: ' Ana@Example.COM ', phone: '+355 (69) 123-4567', language: 'en' },
      TODAY
    );
    expect(details).toEqual({
      firstName: 'Ana Maria',
      lastName: 'HOXHA',
      dateOfBirth: null,
      phone: '+355691234567',
      email: 'ana@example.com',
      language: 'en',
      cityId: null,
      note: null,
    });
  });

  it('FR-MEM-02 the card language defaults to Albanian and is one of four', () => {
    expect(normalisePersonalDetails(valid, TODAY).language).toBe('sq');
    expect(refusal({ ...valid, language: 'fr' })).toBe('language');
  });

  it.each([
    ['not a date', 'yesterday'],
    ['an impossible day', '2026-02-30'],
    ['in the future', '2026-10-08'],
    ['before 1900', '1899-12-31'],
  ])('FR-MEM-02 refuses a date of birth that is %s', (_label, dateOfBirth) => {
    expect(refusal({ ...valid, dateOfBirth })).toBe('dateOfBirth');
  });

  it('FR-MEM-02 refuses an email or phone that is not one', () => {
    expect(refusal({ ...valid, email: 'not-an-email' })).toBe('email');
    expect(refusal({ ...valid, phone: 'call me' })).toBe('phone');
    expect(refusal({ ...valid, phone: '123' })).toBe('phone');
  });

  it('FR-DPR-01, FR-DPR-03 returns only the FR-MEM-02 personal fields, whatever else is sent', () => {
    const details = normalisePersonalDetails(
      { ...valid, diagnosis: 'x', nationalId: 'J12345678A', address: 'Rruga 1', photo: 'data:', tier: 'GOLD' },
      TODAY
    );
    expect(Object.keys(details).sort()).toEqual(
      ['cityId', 'dateOfBirth', 'email', 'firstName', 'language', 'lastName', 'note', 'phone']
    );
  });
});

describe('FR-MEM-03 the member number', () => {
  it('FR-MEM-03 is the prefix and six digits', () => {
    expect(formatMemberNumber('WP', 123)).toBe('WP-000123');
    expect(formatMemberNumber('CARE', 1)).toBe('CARE-000001');
    expect(formatMemberNumber('WP', 1234567)).toBe('WP-1234567');
  });
});

describe('FR-MEM-05 status changes', () => {
  const allowed: Array<[StatusAction, MemberStatus, MemberStatus]> = [
    ['SUSPEND', 'ACTIVE', 'SUSPENDED'],
    ['REINSTATE', 'SUSPENDED', 'ACTIVE'],
    ['CLOSE', 'ACTIVE', 'CLOSED'],
    ['CLOSE', 'SUSPENDED', 'CLOSED'],
    ['REOPEN', 'CLOSED', 'ACTIVE'],
  ];
  it.each(allowed)('FR-MEM-05 %s takes %s to %s', (action, from, to) => {
    expect(changeStatus(from, action, 'because').to).toBe(to);
  });

  it('FR-MEM-05 every other combination is refused', () => {
    const statuses: MemberStatus[] = ['ACTIVE', 'SUSPENDED', 'CLOSED'];
    const actions: StatusAction[] = ['SUSPEND', 'REINSTATE', 'CLOSE', 'REOPEN'];
    for (const action of actions) {
      for (const from of statuses) {
        if (allowed.some(([a, f]) => a === action && f === from)) continue;
        expect(() => changeStatus(from, action, 'because')).toThrow(InvalidStatusChangeError);
      }
    }
  });

  it('FR-MEM-05 a suspension needs a reason; reinstating, closing and reopening do not', () => {
    expect(() => changeStatus('ACTIVE', 'SUSPEND', undefined)).toThrow(InvalidMemberError);
    expect(() => changeStatus('ACTIVE', 'SUSPEND', '   ')).toThrow(InvalidMemberError);
    expect(changeStatus('SUSPENDED', 'REINSTATE', undefined)).toEqual({ to: 'ACTIVE', reason: null });
    expect(changeStatus('ACTIVE', 'CLOSE', undefined).to).toBe('CLOSED');
  });
});
