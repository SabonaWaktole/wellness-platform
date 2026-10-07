import { randomUUID } from 'crypto';
import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import {
  changeStatus,
  InvalidMemberError,
  normalisePersonalDetails,
  STATUS_ACTIONS,
  type PersonalDetails,
  type StatusAction,
} from '../../domain/Member';
import { effectiveTierOn, validTermsOn, type MemberTermValue } from '../../domain/MemberTerm';
import { expiringSoon as expiringSoonOn } from '../../domain/expiringSoon';
import type { Tier } from '../../domain/Tier';
import { validityOn } from '../../domain/memberValidity';
import { MEMBERS_MANAGE, MEMBERS_PAYMENTS_VIEW, MEMBERS_VIEW } from '../membershipPermissions';
import type { IMemberPaymentStore } from '../ports/IMemberPaymentStore';
import { paymentUserIds, presentMemberPayment } from '../presentMemberPayment';
import type { IVipRequestStore } from '../ports/IVipRequestStore';
import { presentVipRequest, vipUserIds } from '../presentVip';
import type { IMemberStore, MemberRecord, MemberSearchParams, CardTokenGenerator } from '../ports/IMemberStore';
import type { IMembershipSettingsStore, IRelationshipStore } from '../ports/IMembershipSettingsStore';
import type { IMembershipWriteTransaction, MembershipWriteRepos } from '../ports/IMembershipWriteTransaction';
import { presentMember, presentMemberSummary, type FamilyGroup, type MemberDetail, type MemberSummary } from '../presentMember';
import { addDays } from '../../../contracts/domain/calendarDay';
import { SponsorValidity } from '../SponsorValidity';

export class MemberNotFoundError extends Error {
  readonly code = 'MEMBER_NOT_FOUND';
  constructor() {
    super('Member not found.');
  }
}

/** FR-MEM-04: the person looks like an existing member. The agent can confirm "different person". */
export class DuplicateMemberError extends Error {
  readonly code = 'DUPLICATE_MEMBER';
  constructor(readonly duplicates: MemberSummary[]) {
    super('A member with the same email, phone, or name and date of birth already exists.');
  }
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

const PERSONAL_FIELDS = ['firstName', 'lastName', 'dateOfBirth', 'phone', 'email', 'language', 'cityId', 'note'] as const;
/** The note may hold anything the agent types, so the trail proves it changed without holding it (FR-AUD-07). */
const AUDIT_OPTIONS = { secret: ['note'] };

const personalOf = (member: MemberRecord): PersonalDetails => ({
  firstName: member.firstName,
  lastName: member.lastName,
  dateOfBirth: member.dateOfBirth,
  phone: member.phone,
  email: member.email,
  language: member.language,
  cityId: member.cityId,
  note: member.note,
});

const label = (member: { memberNumber: string; firstName: string; lastName: string }) =>
  `${member.memberNumber} ${member.firstName} ${member.lastName}`;

const requireCity = async (store: IMemberStore, tenantId: string, cityId: string | null) => {
  if (cityId !== null && !(await store.cityExists(tenantId, cityId))) {
    throw new InvalidMemberError('cityId', 'The city must be one of the predefined cities.');
  }
};

/**
 * FR-MEM-01..04, FR-AUD-14. A new member is Bronze, Active, starting today, with
 * the next number and a card token, all in one transaction with the audit entry.
 * A hand-registered Bronze member has no tier-history row: Bronze is the floor
 * and the history records tier changes (FR-TIR-08). The token is never in the
 * audit entry, and nothing here returns it.
 */
export class RegisterMemberUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly newCardToken: CardTokenGenerator,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    timezone: string;
    body: Record<string, unknown>;
    confirmDifferentPerson?: boolean;
  }): Promise<MemberRecord> {
    input.access.ensure(MEMBERS_MANAGE);
    const today = dayKeyInZone(this.now(), input.timezone);
    const details = normalisePersonalDetails(input.body, today);

    return this.writeTx.run((repos) =>
      registerMemberIn(repos, { ...input, today, details, newCardToken: this.newCardToken })
    );
  }
}

/**
 * The creation of one member inside an open write transaction: the city and
 * duplicate checks, the row, the first status-history row and the audit entry.
 * Shared by the member form and by "add a new family member" (FR-FAM-01), so
 * both are one transaction with their audit entry.
 */
export async function registerMemberIn(
  { memberStore, memberNumbers, auditTrail }: Pick<MembershipWriteRepos, 'memberStore' | 'memberNumbers' | 'auditTrail'>,
  input: {
    access: AccessContext;
    tenantId: string;
    today: string;
    details: PersonalDetails;
    confirmDifferentPerson?: boolean;
    newCardToken: CardTokenGenerator;
  }
): Promise<MemberRecord> {
  const { details } = input;
  await requireCity(memberStore, input.tenantId, details.cityId);
  if (!input.confirmDifferentPerson) {
    const duplicates = await memberStore.findDuplicates(input.tenantId, details);
    if (duplicates.length > 0) throw new DuplicateMemberError(duplicates.map((m) => presentMemberSummary(m)));
  }

  const member = await memberStore.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    memberNumber: await memberNumbers.next(input.tenantId),
    cardToken: input.newCardToken(),
    createdBy: input.access.userId,
    startsOn: input.today,
    details,
  });
  await memberStore.addStatusHistory({
    memberId: member.id,
    fromStatus: null,
    toStatus: 'ACTIVE',
    reason: null,
    changedByUserId: input.access.userId,
  });
  await auditTrail.record({
    tenantId: input.tenantId,
    userId: input.access.userId,
    userRole: input.access.auditRole,
    action: AuditAction.Create,
    entityType: 'Member',
    entityId: member.id,
    entityLabel: label(member),
    changes: [
      { field: 'memberNumber', old: null, new: member.memberNumber },
      ...PERSONAL_FIELDS.map((field) => ({ field, old: null, new: field === 'note' && member.note ? 'changed' : member[field] })),
      { field: 'status', old: null, new: member.status },
      { field: 'tier', old: null, new: member.currentTier },
    ],
  });
  return member;
}

/**
 * FR-MEM-09: personal details only. The tier, term dates, status and number are
 * not inputs of any use case here. A change of name, date of birth, phone or
 * email is audited with the old and new value.
 */
export class UpdateMemberUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    timezone: string;
    id: string;
    body: Record<string, unknown>;
    confirmDifferentPerson?: boolean;
  }): Promise<MemberRecord> {
    input.access.ensure(MEMBERS_MANAGE);
    const today = dayKeyInZone(this.now(), input.timezone);

    return this.writeTx.run(async ({ memberStore, auditTrail }) => {
      const current = await memberStore.find(input.tenantId, input.id);
      if (!current) throw new MemberNotFoundError();

      const before = personalOf(current);
      const next = normalisePersonalDetails({ ...before, ...input.body }, today);
      const changes = diff({ ...before }, { ...next }, [...PERSONAL_FIELDS], AUDIT_OPTIONS);
      if (changes.length === 0) return current;

      if (next.cityId !== before.cityId) await requireCity(memberStore, input.tenantId, next.cityId);
      const identityChanged = changes.some((c) => ['firstName', 'lastName', 'dateOfBirth', 'phone', 'email'].includes(c.field));
      if (identityChanged && !input.confirmDifferentPerson) {
        const duplicates = await memberStore.findDuplicates(input.tenantId, next, current.id);
        if (duplicates.length > 0) throw new DuplicateMemberError(duplicates.map((m) => presentMemberSummary(m)));
      }

      await memberStore.updateDetails(input.tenantId, current.id, next);
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Member',
        entityId: current.id,
        entityLabel: label(current),
        changes,
      });
      return { ...current, ...next };
    });
  }
}

/**
 * FR-MEM-05: suspend (with a reason), reinstate, close and reopen. Each writes a
 * status-history row and an audit entry. Closing keeps the record and the
 * number; there is no delete.
 */
export class ChangeMemberStatusUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string; action: unknown; reason?: unknown }): Promise<MemberRecord> {
    input.access.ensure(MEMBERS_MANAGE);
    const action = input.action as StatusAction;
    if (!STATUS_ACTIONS.includes(action)) throw new InvalidMemberError('reason', 'The action is suspend, reinstate, close or reopen.');

    return this.writeTx.run(async ({ memberStore, auditTrail }) => {
      const current = await memberStore.find(input.tenantId, input.id);
      if (!current) throw new MemberNotFoundError();

      const { to, reason } = changeStatus(current.status, action, input.reason);
      const closedAt = to === 'CLOSED' ? this.now() : null;
      await memberStore.setStatus(input.tenantId, current.id, to, closedAt);
      await memberStore.addStatusHistory({
        memberId: current.id,
        fromStatus: current.status,
        toStatus: to,
        reason,
        changedByUserId: input.access.userId,
      });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'Member',
        entityId: current.id,
        entityLabel: label(current),
        changes: [
          { field: 'status', old: current.status, new: to },
          ...(reason ? [{ field: 'reason', old: null, new: reason }] : []),
        ],
      });
      return { ...current, status: to, closedAt };
    });
  }
}

export interface SearchMembersInput {
  access: AccessContext;
  tenantId: string;
  timezone: string;
  params: Partial<Omit<MemberSearchParams, 'expiringSoon' | 'vipReviewDue'>> & { expiringSoon?: boolean; vipReviewDue?: boolean };
}

const MAX_LIMIT = 100;

/**
 * FR-MEM-07, NFR-PERF-05. Searches and filters in the database, with the
 * indexes of the Member table. The list shows the stored tier (D2); the member
 * page calculates it.
 */
export class SearchMembersUseCase {
  constructor(
    private readonly store: IMemberStore,
    private readonly settings: IMembershipSettingsStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: SearchMembersInput): Promise<{ data: MemberSummary[]; total: number; page: number; limit: number }> {
    input.access.ensure(MEMBERS_VIEW);
    const { expiringSoon, vipReviewDue, ...rest } = input.params;
    const page = Math.max(1, Math.floor(rest.page ?? 1));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(rest.limit ?? 25)));

    let window: MemberSearchParams['expiringSoon'];
    let vipWindow: MemberSearchParams['vipReviewDue'];
    if (expiringSoon || vipReviewDue) {
      const { expiringSoonDays, vipReviewNoticeDays } = (await this.settings.getSettings(input.tenantId)).toJSON();
      const today = new Date(`${dayKeyInZone(this.now(), input.timezone)}T00:00:00.000Z`);
      const windowOf = (days: number) => ({ from: today.toISOString().slice(0, 10), to: addDays(today, days).toISOString().slice(0, 10) });
      if (expiringSoon) window = windowOf(expiringSoonDays);
      // FR-VIP-04: a VIP term ending within the notice days.
      if (vipReviewDue) vipWindow = windowOf(vipReviewNoticeDays);
    }

    const result = await this.store.search(input.tenantId, {
      ...rest,
      expiringSoon: window,
      vipReviewDue: vipWindow,
      sortBy: rest.sortBy ?? 'name',
      sortDir: rest.sortDir ?? 'asc',
      page,
      limit,
    });
    // The badge (FR-TIR-10): the latest paid term of each listed member, against the same window as the filter.
    const { expiringSoonDays } = (await this.settings.getSettings(input.tenantId)).toJSON();
    const today = new Date(`${dayKeyInZone(this.now(), input.timezone)}T00:00:00.000Z`);
    const ends = await this.store.latestPaidEnds(result.data.map((m) => m.id));
    const badge = (id: string) => (ends[id] ? expiringSoonOn(new Date(`${ends[id]}T00:00:00.000Z`), today, expiringSoonDays) : false);
    return { data: result.data.map((m) => presentMemberSummary(m, badge(m.id))), total: result.total, page, limit };
  }
}

/**
 * FR-MEM-08, FR-MEM-06: the member page. The current tier is calculated from the
 * terms on today's date with the one domain rule (D2), so it is right even
 * before the daily job has run. Payments, family and verification events are
 * added by Slices 5, 6 and 13.
 */
export class GetMemberUseCase {
  constructor(
    private readonly store: IMemberStore,
    private readonly settings: IMembershipSettingsStore,
    private readonly paymentStore: IMemberPaymentStore,
    private readonly relationshipStore: IRelationshipStore,
    private readonly vipStore: IVipRequestStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; id: string }): Promise<MemberDetail> {
    input.access.ensure(MEMBERS_VIEW);
    const member = await this.store.find(input.tenantId, input.id);
    if (!member) throw new MemberNotFoundError();

    const [terms, tierHistory, statusHistory, { graceDays, expiringSoonDays }] = await Promise.all([
      this.store.listTerms(member.id),
      this.store.listTierHistory(member.id),
      this.store.listStatusHistory(member.id),
      this.settings.getSettings(input.tenantId).then((s) => s.toJSON()),
    ]);

    const today = new Date(`${dayKeyInZone(this.now(), input.timezone)}T00:00:00.000Z`);
    // A sponsored term counts while the employer's contract is valid, and shows the end of the contract chain (D8, FR-EMP-09).
    const sponsorState = member.employerClientId ? (await new SponsorValidity(this.paymentStore).forCompanies(input.tenantId, [member.employerClientId], day(today))).get(member.employerClientId) : undefined;
    const sponsorValid = sponsorState?.valid ?? false;
    const values: MemberTermValue[] = terms.map((t) => ({
      tier: t.tier,
      source: t.source,
      startsOn: new Date(`${t.startsOn}T00:00:00.000Z`),
      endsOn: t.endsOn ? new Date(`${t.endsOn}T00:00:00.000Z`) : null,
    }));
    const effectiveTier = effectiveTierOn(values, sponsorValid, graceDays, today);
    const currentValue = validTermsOn(values, sponsorValid, graceDays, today)
      .filter((v) => v.tier === effectiveTier)
      .sort((a, b) => (b.endsOn?.getTime() ?? Infinity) - (a.endsOn?.getTime() ?? Infinity))[0];
    const current = currentValue
      ? { source: currentValue.source, startsOn: day(currentValue.startsOn), endsOn: currentValue.source === 'SPONSORED' ? (sponsorState?.endsOn ?? null) : currentValue.endsOn ? day(currentValue.endsOn) : null }
      : null;
    const validity = validityOn(member.status, effectiveTier, current?.endsOn ? new Date(`${current.endsOn}T00:00:00.000Z`) : null);

    // Payments only for a user who may see them (FR-MPAY-08): the rows are not even read otherwise.
    const payments = input.access.can(MEMBERS_PAYMENTS_VIEW) ? await this.paymentStore.listForMember(input.tenantId, member.id) : null;

    const family = await this.family(input.tenantId, member, graceDays, today);
    const vipRequests = await this.vipStore.listForMember(input.tenantId, member.id);
    const vipEnd = values
      .filter((v) => v.source === 'VIP' && v.endsOn && day(v.endsOn) >= day(today))
      .map((v) => day(v.endsOn!))
      .sort()
      .pop();

    const names = await this.store.userNames(input.tenantId, [
      member.createdBy,
      ...family.userIds,
      ...vipUserIds(vipRequests),
      ...(payments ? paymentUserIds(payments) : []),
      ...tierHistory.map((h) => h.changedByUserId).filter((id): id is string => !!id),
      ...statusHistory.map((h) => h.changedByUserId).filter((id): id is string => !!id),
    ]);

    // FR-TIR-10: the latest paid term ends within the window.
    const latestPaidEnd = terms.filter((t) => t.source === 'PAID' && t.endsOn).map((t) => t.endsOn!).sort().pop();
    const expiringSoon = latestPaidEnd ? expiringSoonOn(new Date(`${latestPaidEnd}T00:00:00.000Z`), today, expiringSoonDays) : false;

    const detail = presentMember({ expiringSoon, member, terms, tierHistory, statusHistory, effectiveTier, current, validity, userNames: names, family: family.present(names), vip: { requests: vipRequests.map((r) => presentVipRequest(r, names)), reviewDate: vipEnd ?? null } });
    return payments ? { ...detail, payments: payments.map((p) => presentMemberPayment(p, names)) } : detail;
  }

  /**
   * FR-FAM-07: the principal of a family member, and the group of a principal
   * with each member's tier and validity calculated today (FR-MEM-06). Names of
   * the users who confirmed or removed links are filled in once they are read.
   */
  private async family(tenantId: string, member: MemberRecord, graceDays: number, today: Date) {
    const [dependants, events, relationships] = await Promise.all([
      this.store.listDependants(tenantId, member.id),
      this.store.listFamilyEvents(member.id),
      this.relationshipStore.list(tenantId),
    ]);
    const principal = member.principalMemberId ? await this.store.find(tenantId, member.principalMemberId) : null;
    const relationshipOf = (id: string | null) => {
      const found = relationships.find((r) => r.id === id);
      return found ? { id: found.id, nameSq: found.nameSq, nameEn: found.nameEn } : null;
    };
    const principalOf = new Map<string, MemberRecord | null>([[member.principalMemberId ?? '', principal]]);
    const eventPrincipals = [...new Set(events.map((e) => e.principalMemberId).filter((id): id is string => !!id))];
    for (const id of eventPrincipals) if (!principalOf.has(id)) principalOf.set(id, await this.store.find(tenantId, id));

    const stateOf = async (m: MemberRecord) => {
      const values = (await this.store.listTerms(m.id)).map((t) => ({
        tier: t.tier,
        source: t.source,
        startsOn: new Date(`${t.startsOn}T00:00:00.000Z`),
        endsOn: t.endsOn ? new Date(`${t.endsOn}T00:00:00.000Z`) : null,
      }));
      const sponsorValid = m.employerClientId ? await this.paymentStore.employerContractValid(tenantId, m.employerClientId, day(today)) : false;
      const tier = effectiveTierOn(values, sponsorValid, graceDays, today);
      const term = validTermsOn(values, sponsorValid, graceDays, today).filter((v) => v.tier === tier).sort((a, b) => (b.endsOn?.getTime() ?? Infinity) - (a.endsOn?.getTime() ?? Infinity))[0];
      return { tier, valid: validityOn(m.status, tier, term?.endsOn ?? null).valid };
    };
    const states = new Map<string, { tier: Tier; valid: boolean }>();
    for (const d of dependants) states.set(d.id, await stateOf(d));

    const nameOf = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`;
    return {
      userIds: [
        ...(member.relationshipConfirmedBy ? [member.relationshipConfirmedBy] : []),
        ...dependants.map((d) => d.relationshipConfirmedBy).filter((id): id is string => !!id),
        ...events.map((e) => e.byUserId),
      ],
      present: (names: Record<string, string>): Omit<FamilyGroup, 'principalMemberId' | 'relationshipId'> => ({
        principal: principal
          ? {
              id: principal.id,
              memberNumber: principal.memberNumber,
              name: nameOf(principal),
              relationship: relationshipOf(member.relationshipId),
              confirmedBy: member.relationshipConfirmedBy ? (names[member.relationshipConfirmedBy] ?? null) : null,
              confirmedAt: member.relationshipConfirmedAt,
            }
          : null,
        dependants: dependants.map((d) => ({
          id: d.id,
          memberNumber: d.memberNumber,
          name: nameOf(d),
          relationship: relationshipOf(d.relationshipId),
          tier: states.get(d.id)!.tier,
          status: d.status,
          valid: states.get(d.id)!.valid,
          confirmedBy: d.relationshipConfirmedBy ? (names[d.relationshipConfirmedBy] ?? null) : null,
          confirmedAt: d.relationshipConfirmedAt,
        })),
        history: events.map((e) => {
          const p = e.principalMemberId ? principalOf.get(e.principalMemberId) : null;
          return { kind: e.kind, principal: p ? `${p.memberNumber} ${nameOf(p)}` : null, relationship: relationshipOf(e.relationshipId), reason: e.reason, by: names[e.byUserId] ?? null, at: e.at };
        }),
      }),
    };
  }
}
