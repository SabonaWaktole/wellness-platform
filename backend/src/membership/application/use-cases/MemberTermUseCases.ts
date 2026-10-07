import { randomUUID } from 'crypto';
import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { SYSTEM_ACTOR } from '../../../audit/domain/AuditEntry';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { InvalidMemberError, MEMBER_LIMITS } from '../../domain/Member';
import { effectiveTierOn } from '../../domain/MemberTerm';
import { planDowngrades, tierTransitions } from '../../domain/memberTermExpiry';
import type { Tier } from '../../domain/Tier';
import { dayDate, dayText, effectiveTierAt, termValues } from '../memberPaymentQuote';
import { MANAGE_WELLNESS_SETTINGS } from '../membershipPermissions';
import type { IMemberStore, MemberRecord } from '../ports/IMemberStore';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';
import { MemberNotFoundError } from './MemberUseCases';

const label = (member: { memberNumber: string; firstName: string; lastName: string }) => `${member.memberNumber} ${member.firstName} ${member.lastName}`;

export interface TermExpiryResult {
  /** Downgrade terms created. */
  terms: number;
  /** Tier-history rows written. */
  transitions: number;
}

/**
 * FR-TIR-05, 06, 07, FR-VIP-04, NFR-REL-02: brings one member's terms and tier
 * up to `today` (steps 1, 2 and 4 of the daily job, D9).
 *
 * Everything happens in one transaction after the member's row is locked, and
 * the member is read AFTER the lock, so two runs at once are served one after
 * the other and the second finds nothing to do. `followsTermId` is unique, so
 * the database also refuses a second downgrade of the same ended term. History
 * rows carry the day the tier really changed, which is how a run after a long
 * gap writes each step with its own date (D4). The actor is the system.
 */
export class ExpireMemberTermsUseCase {
  constructor(private readonly writeTx: IMembershipWriteTransaction) {}

  async execute(input: { tenantId: string; memberId: string; today: Date }): Promise<TermExpiryResult> {
    const todayKey = dayText(input.today);
    return this.writeTx.run(async ({ memberStore, paymentStore, settingsStore, auditTrail }) => {
      if (!(await paymentStore.lockMember(input.tenantId, input.memberId))) return { terms: 0, transitions: 0 };
      const member = (await memberStore.find(input.tenantId, input.memberId)) as MemberRecord;

      const { graceDays } = (await settingsStore.getSettings(input.tenantId)).toJSON();
      const silver = (await settingsStore.getTiers(input.tenantId)).find((t) => t.tier === 'SILVER');
      const before = await paymentStore.listTerms(member.id);

      const planned = planDowngrades(
        before.map((t, i) => ({ ...termValues([t])[0], followsTermId: before[i].followsTermId })),
        graceDays,
        silver?.termMonths ?? 12,
        input.today
      );
      for (const downgrade of planned) {
        await paymentStore.insertTerm({
          id: randomUUID(),
          memberId: member.id,
          tier: downgrade.tier,
          source: 'DOWNGRADE',
          startsOn: dayText(downgrade.startsOn),
          endsOn: dayText(downgrade.endsOn),
          paymentId: null,
          followsTermId: downgrade.followsTermId,
        });
      }
      const terms = planned.length > 0 ? await paymentStore.listTerms(member.id) : before;

      // A sponsored term counts while the employer's contract is valid (D8); Slice 10 adds its own sync.
      const sponsorValid = member.employerClientId ? await paymentStore.employerContractValid(input.tenantId, member.employerClientId, todayKey) : false;
      const history = await memberStore.listTierHistory(member.id);
      const lastRecorded = history.reduce<string>((latest, h) => (dayText(h.createdAt) > latest ? dayText(h.createdAt) : latest), member.startsOn);
      const transitions = tierTransitions({
        terms: termValues(terms),
        sponsorValid,
        graceDays,
        startingTier: member.currentTier,
        after: dayDate(lastRecorded),
        today: input.today,
      });
      for (const step of transitions) {
        await paymentStore.addTierHistory({
          memberId: member.id,
          fromTier: step.from,
          toTier: step.to,
          reason: step.reason,
          comment: null,
          changedByUserId: null,
          effectiveOn: dayText(step.on),
        });
      }

      const tierNow = effectiveTierOn(termValues(terms), sponsorValid, graceDays, input.today);
      if (tierNow !== member.currentTier) await paymentStore.setCurrentTier(input.tenantId, member.id, tierNow);

      if (planned.length > 0 || transitions.length > 0) {
        await auditTrail.record({
          tenantId: input.tenantId,
          userId: SYSTEM_ACTOR.userId,
          userRole: SYSTEM_ACTOR.userRole,
          action: AuditAction.StatusChange,
          entityType: 'Member',
          entityId: member.id,
          entityLabel: label(member),
          changes: [
            { field: 'tier', old: member.currentTier, new: tierNow },
            ...planned.map((p) => ({ field: 'downgradeTerm', old: null, new: `${p.tier} ${dayText(p.startsOn)} to ${dayText(p.endsOn)}` })),
            ...transitions.map((t) => ({ field: 'tierChange', old: `${t.from} (${dayText(t.on)})`, new: `${t.to}: ${t.reason}` })),
          ],
        });
      }
      return { terms: planned.length, transitions: transitions.length };
    });
  }
}

/** The tiers a correction can grant: VIP needs an approval (FR-VIP-02), Bronze is the floor. */
export const CORRECTABLE_TIERS: readonly Tier[] = ['SILVER', 'GOLD'];

/**
 * FR-TIR-09, FR-AUD-14: a user with "Wellness+ settings: manage" corrects a
 * member's tier with a required reason and an end date. The correction is a term
 * of its own (source CORRECTION, from today to the end date), so it is the one
 * tier rule that counts it, and the history records it with the reason
 * Correction. The end date is a day, today or later.
 */
export class CorrectMemberTierUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; memberId: string; tier: unknown; endsOn: unknown; reason: unknown }): Promise<{ memberId: string; tier: Tier; endsOn: string }> {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    const today = dayKeyInZone(this.now(), input.timezone);
    const tier = CORRECTABLE_TIERS.find((t) => t === input.tier);
    if (!tier) throw new InvalidMemberError('tier', 'The corrected tier is Silver or Gold.');
    const endsOn = typeof input.endsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.endsOn) && dayText(dayDate(input.endsOn)) === input.endsOn ? input.endsOn : null;
    if (!endsOn) throw new InvalidMemberError('endsOn', 'The end date is a day, YYYY-MM-DD.');
    if (endsOn < today) throw new InvalidMemberError('endsOn', 'The end date cannot be in the past.');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason) throw new InvalidMemberError('reason', 'A reason is required to correct a tier.');
    if (reason.length > MEMBER_LIMITS.reason) throw new InvalidMemberError('reason', `The reason is at most ${MEMBER_LIMITS.reason} characters.`);

    return this.writeTx.run(async ({ memberStore, paymentStore, settingsStore, relationshipStore, auditTrail }) => {
      if (!(await paymentStore.lockMember(input.tenantId, input.memberId))) throw new MemberNotFoundError();
      const member = (await memberStore.find(input.tenantId, input.memberId)) as MemberRecord;
      const deps = { paymentStore, settingsStore, memberStore: memberStore as IMemberStore, relationshipStore };
      const tierBefore = await effectiveTierAt(deps, input.tenantId, member, await paymentStore.listTerms(member.id), today);

      await paymentStore.insertTerm({ id: randomUUID(), memberId: member.id, tier, source: 'CORRECTION', startsOn: today, endsOn, paymentId: null });
      const tierAfter = await effectiveTierAt(deps, input.tenantId, member, await paymentStore.listTerms(member.id), today);
      await paymentStore.setCurrentTier(input.tenantId, member.id, tierAfter);
      if (tierAfter !== tierBefore) {
        await paymentStore.addTierHistory({
          memberId: member.id,
          fromTier: tierBefore,
          toTier: tierAfter,
          reason: 'Correction',
          comment: reason,
          changedByUserId: input.access.userId,
        });
      }
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'Member',
        entityId: member.id,
        entityLabel: label(member),
        changes: [
          { field: 'tier', old: tierBefore, new: tierAfter },
          { field: 'correctionTier', old: null, new: tier },
          { field: 'correctionEndsOn', old: null, new: endsOn },
          { field: 'reason', old: null, new: reason },
        ],
      });
      return { memberId: member.id, tier, endsOn };
    });
  }
}
