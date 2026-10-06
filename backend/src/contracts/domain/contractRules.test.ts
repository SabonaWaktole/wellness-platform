import {
  BillingPeriod,
  CONTRACT_TRANSITIONS,
  Contract,
  ContractStatus,
  canTransition,
  contractValidityOn,
  findContractTransition,
} from './Contract';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const ALL = Object.values(ContractStatus);

const ALLOWED: Array<[ContractStatus, ContractStatus]> = [
  [ContractStatus.Draft, ContractStatus.PendingSignature],
  [ContractStatus.Draft, ContractStatus.Active],
  [ContractStatus.PendingSignature, ContractStatus.Active],
  [ContractStatus.Active, ContractStatus.Suspended],
  [ContractStatus.Suspended, ContractStatus.Active],
  [ContractStatus.Active, ContractStatus.Expired],
  [ContractStatus.Draft, ContractStatus.Cancelled],
  [ContractStatus.PendingSignature, ContractStatus.Cancelled],
  [ContractStatus.Active, ContractStatus.Cancelled],
  [ContractStatus.Suspended, ContractStatus.Cancelled],
];

describe('contract status transitions', () => {
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));
  const isAllowed = (from: ContractStatus, to: ContractStatus) =>
    ALLOWED.some(([f, t]) => f === from && t === to);

  it.each(pairs)('FR-CON-11: %s -> %s is allowed only if the SRS table lists it', (from, to) => {
    expect(canTransition(from, to)).toBe(isAllowed(from, to));
  });

  it('FR-CON-11: covers all 36 pairs and exactly the ten the SRS table allows', () => {
    expect(pairs).toHaveLength(36);
    expect(pairs.filter(([f, t]) => canTransition(f, t))).toHaveLength(10);
    expect(CONTRACT_TRANSITIONS).toHaveLength(10);
  });

  it.each([ContractStatus.Expired, ContractStatus.Cancelled])('FR-CON-11: %s is final', (from) => {
    expect(ALL.some((to) => canTransition(from, to))).toBe(false);
  });

  it.each(ALL)('FR-CON-11: %s -> itself is refused', (status) => {
    expect(canTransition(status, status)).toBe(false);
  });

  it('FR-CON-11: only the expiry move belongs to the system', () => {
    const system = CONTRACT_TRANSITIONS.filter((t) => t.permission === 'system');
    expect(system.map((t) => [t.from, t.to])).toEqual([[ContractStatus.Active, ContractStatus.Expired]]);
  });

  it.each([
    [ContractStatus.Draft, ContractStatus.Cancelled, 'contracts.manage'],
    [ContractStatus.PendingSignature, ContractStatus.Cancelled, 'contracts.terminate'],
    [ContractStatus.Active, ContractStatus.Cancelled, 'contracts.terminate'],
    [ContractStatus.Active, ContractStatus.Suspended, 'contracts.terminate'],
    [ContractStatus.Suspended, ContractStatus.Active, 'contracts.terminate'],
    [ContractStatus.Draft, ContractStatus.PendingSignature, 'contracts.manage'],
    [ContractStatus.PendingSignature, ContractStatus.Active, 'contracts.manage'],
  ])('FR-CON-11: %s -> %s needs %s', (from, to, permission) => {
    expect(findContractTransition(from, to)?.permission).toBe(permission);
  });

  it.each([
    [ContractStatus.Active, ContractStatus.Suspended, true],
    [ContractStatus.Suspended, ContractStatus.Active, true],
    [ContractStatus.Active, ContractStatus.Cancelled, true],
    [ContractStatus.Draft, ContractStatus.Cancelled, true],
    [ContractStatus.Draft, ContractStatus.PendingSignature, false],
    [ContractStatus.PendingSignature, ContractStatus.Active, false],
    [ContractStatus.Active, ContractStatus.Expired, false],
  ])('FR-CON-11: %s -> %s reason required = %s', (from, to, required) => {
    expect(findContractTransition(from, to)?.reasonRequired).toBe(required);
  });
});

describe('Contract validity', () => {
  const active = { status: ContractStatus.Active, startsAt: day('2027-03-01'), endsAt: day('2028-02-29') };

  it('FR-CON-20: an Active contract inside its dates is valid', () => {
    expect(contractValidityOn(active, day('2027-09-01'), 30)).toMatchObject({ valid: true, reason: null });
  });

  it('FR-CON-20: a contract starting tomorrow is Not valid: Not started', () => {
    expect(contractValidityOn(active, day('2027-02-28'), 30)).toMatchObject({ valid: false, reason: 'NOT_STARTED' });
  });

  it('FR-CON-20: the start date itself is included', () => {
    expect(contractValidityOn(active, day('2027-03-01'), 30).valid).toBe(true);
  });

  it('FR-CON-20: on the end date it is still valid, the day after it is Expired', () => {
    expect(contractValidityOn(active, day('2028-02-29'), 30).valid).toBe(true);
    expect(contractValidityOn(active, day('2028-03-01'), 30)).toMatchObject({ valid: false, reason: 'EXPIRED' });
  });

  it.each([
    [ContractStatus.Draft, 'DRAFT'],
    [ContractStatus.PendingSignature, 'PENDING_SIGNATURE'],
    [ContractStatus.Suspended, 'SUSPENDED'],
    [ContractStatus.Expired, 'EXPIRED'],
    [ContractStatus.Cancelled, 'CANCELLED'],
  ])('FR-CON-20: %s inside its dates is never valid and says why (%s)', (status, reason) => {
    expect(contractValidityOn({ ...active, status }, day('2027-09-01'), 30)).toMatchObject({ valid: false, reason });
  });

  it('FR-CON-20: a Draft starting tomorrow still reads Draft, not Not started', () => {
    expect(
      contractValidityOn({ ...active, status: ContractStatus.Draft }, day('2027-02-28'), 30).reason
    ).toBe('DRAFT');
  });

  it('FR-CON-20: daysLeft counts today as 0 and goes negative after the end', () => {
    expect(contractValidityOn(active, day('2028-02-29'), 30).daysLeft).toBe(0);
    expect(contractValidityOn(active, day('2028-02-28'), 30).daysLeft).toBe(1);
    expect(contractValidityOn(active, day('2028-03-02'), 30).daysLeft).toBe(-2);
  });

  it('FR-CON-20: the Contract entity method gives the same answer', () => {
    const contract = Contract.create({
      id: 'c1',
      tenantId: 't1',
      clientId: 'cl1',
      planName: 'Plan',
      amount: 49.4,
      billingPeriod: BillingPeriod.Monthly,
      startsAt: active.startsAt,
      endsAt: active.endsAt,
      createdByUserId: 'u1',
      status: ContractStatus.Active,
    });
    expect(contract.validityOn(day('2028-03-01'), 30)).toEqual(contractValidityOn(active, day('2028-03-01'), 30));
  });
});

describe('Contract expiring soon', () => {
  const ending = (end: string) => ({
    status: ContractStatus.Active,
    startsAt: day('2027-03-01'),
    endsAt: day(end),
  });

  it('FR-REN-04: window 30 — 31 days left is Valid, 30 days left is Expiring soon', () => {
    // today 2028-01-30: end 2028-03-01 is 31 days away, 2028-02-29 is 30.
    const today = day('2028-01-30');
    expect(contractValidityOn(ending('2028-03-01'), today, 30)).toMatchObject({ valid: true, expiringSoon: false, daysLeft: 31 });
    expect(contractValidityOn(ending('2028-02-29'), today, 30)).toMatchObject({ valid: true, expiringSoon: true, daysLeft: 30 });
  });

  it('FR-REN-04: the window is the setting, not a constant', () => {
    expect(contractValidityOn(ending('2028-02-29'), day('2028-01-30'), 7).expiringSoon).toBe(false);
    expect(contractValidityOn(ending('2028-02-29'), day('2028-01-30'), 90).expiringSoon).toBe(true);
  });

  it('FR-REN-04: only a valid contract can be expiring soon', () => {
    expect(
      contractValidityOn({ ...ending('2028-02-29'), status: ContractStatus.Suspended }, day('2028-02-20'), 30).expiringSoon
    ).toBe(false);
  });
});
