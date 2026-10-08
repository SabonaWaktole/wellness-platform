import { randomUUID } from 'crypto';
import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { addDays } from '../../../contracts/domain/calendarDay';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { vipTerm } from '../../domain/termDates';
import {
  checkVipDecision,
  checkVipRequest,
  decisionNote,
  vipDecision,
  vipReason,
  VIP_REQUEST_STATUSES,
  type VipRefusal,
  type VipRequestStatus,
} from '../../domain/vipRequest';
import { dayDate, dayText, effectiveTierAt } from '../memberPaymentQuote';
import { MEMBERS_MANAGE, MEMBERS_VIP_APPROVE } from '../membershipPermissions';
import type { IMemberStore, MemberRecord } from '../ports/IMemberStore';
import type { IVipRequestStore, VipRequestRecord } from '../ports/IVipRequestStore';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';
import { presentVipRequest, vipUserIds, type VipRequestView } from '../presentVip';
import { MemberNotFoundError } from './MemberUseCases';

/** The VIP action breaks a rule of FR-VIP-01, 02 or 05. Mapped to 409 with the reason. */
export class VipRefusedError extends Error {
  readonly code = 'VIP_REFUSED';
  constructor(readonly reason: VipRefusal) {
    super(`This VIP action is not allowed: ${reason}.`);
  }
}

export class VipRequestNotFoundError extends Error {
  readonly code = 'VIP_REQUEST_NOT_FOUND';
  constructor() {
    super('VIP request not found.');
  }
}

const label = (member: { memberNumber: string; firstName: string; lastName: string }) => `${member.memberNumber} ${member.firstName} ${member.lastName}`;

/**
 * FR-VIP-01, FR-AUD-14, NFR-DAT-02: a user with "Members: manage" asks for VIP
 * with a reason. The member's row is locked first, so two parallel requests are
 * checked one after the other and only one is created (PostgreSQL also has the
 * partial unique index).
 */
export class RequestVipUseCase {
  constructor(private readonly writeTx: IMembershipWriteTransaction) {}

  async execute(input: { access: AccessContext; tenantId: string; memberId: string; reason: unknown }): Promise<VipRequestView> {
    input.access.ensure(MEMBERS_MANAGE);
    const reason = vipReason(input.reason, 'A reason is required to request VIP.');

    return this.writeTx.run(async ({ memberStore, paymentStore, vipStore, auditTrail }) => {
      if (!(await paymentStore.lockMember(input.tenantId, input.memberId))) throw new MemberNotFoundError();
      const member = (await memberStore.find(input.tenantId, input.memberId)) as MemberRecord;
      const refusal = checkVipRequest({ memberClosed: member.status === 'CLOSED', hasOpenRequest: (await vipStore.findPending(input.tenantId, member.id)) !== null });
      if (refusal) throw new VipRefusedError(refusal);

      const created = await vipStore.create({ id: randomUUID(), tenantId: input.tenantId, memberId: member.id, requestedBy: input.access.userId, reason });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Member',
        entityId: member.id,
        entityLabel: label(member),
        changes: [
          { field: 'vipRequest', old: null, new: 'PENDING' },
          { field: 'vipRequestReason', old: null, new: reason },
        ],
      });
      return presentVipRequest(created, await memberStore.userNames(input.tenantId, vipUserIds([created])));
    });
  }
}

/**
 * FR-VIP-02, FR-VIP-03, FR-VIP-04, FR-TIR-08, FR-AUD-14: a user with "Members:
 * approve VIP", who is not the requester, approves or rejects a pending request.
 * An approval creates a free VIP term from today for the VIP term length (from
 * the day after the current VIP term when approved before it ends), a tier
 * history row when the tier changes, the refreshed stored tier and the audit
 * entry, in one transaction. No payment is created.
 */
export class DecideVipRequestUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    timezone: string;
    requestId: string;
    decision: unknown;
    note?: unknown;
  }): Promise<VipRequestView> {
    input.access.ensure(MEMBERS_VIP_APPROVE);
    const decision = vipDecision(input.decision);
    const note = decisionNote(decision, input.note);
    const now = this.now();
    const today = dayKeyInZone(now, input.timezone);

    return this.writeTx.run(async ({ memberStore, paymentStore, settingsStore, relationshipStore, vipStore, auditTrail }) => {
      const found = await vipStore.find(input.tenantId, input.requestId);
      if (!found) throw new VipRequestNotFoundError();
      await paymentStore.lockMember(input.tenantId, found.memberId);
      // Read again after the lock: a parallel decision has already changed the status.
      const request = (await vipStore.find(input.tenantId, input.requestId)) as VipRequestRecord;
      const member = (await memberStore.find(input.tenantId, request.memberId)) as MemberRecord;
      const refusal = checkVipDecision({ status: request.status, requestedBy: request.requestedBy, deciderId: input.access.userId, memberClosed: member.status === 'CLOSED', decision });
      if (refusal) throw new VipRefusedError(refusal);

      const changes: Array<{ field: string; old: unknown; new: unknown }> = [
        { field: 'vipRequest', old: 'PENDING', new: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' },
        ...(note ? [{ field: 'vipDecisionNote', old: null, new: note }] : []),
      ];

      if (decision === 'APPROVE') {
        const deps = { paymentStore, settingsStore, memberStore, relationshipStore };
        const vipSetting = (await settingsStore.getTiers(input.tenantId)).find((t) => t.tier === 'VIP');
        const termsBefore = await paymentStore.listTerms(member.id);
        const tierBefore = await effectiveTierAt(deps, input.tenantId, member, termsBefore, today);
        const vipEnds = termsBefore.filter((t) => t.source === 'VIP' && t.endsOn).map((t) => t.endsOn!).sort();
        const currentVipEnd = vipEnds.length > 0 ? dayDate(vipEnds[vipEnds.length - 1]) : null;
        const term = vipTerm(dayDate(today), vipSetting?.termMonths ?? 12, currentVipEnd);

        await paymentStore.insertTerm({
          id: randomUUID(),
          memberId: member.id,
          tier: 'VIP',
          source: 'VIP',
          startsOn: dayText(term.startsOn),
          endsOn: dayText(term.endsOn),
          paymentId: null,
        });
        const tierAfter = await effectiveTierAt(deps, input.tenantId, member, await paymentStore.listTerms(member.id), today);
        await paymentStore.setCurrentTier(input.tenantId, member.id, tierAfter);
        // An approval before the end keeps the tier VIP, so it changes nothing in the history (FR-TIR-08).
        if (tierAfter !== tierBefore) {
          await paymentStore.addTierHistory({
            memberId: member.id,
            fromTier: tierBefore,
            toTier: tierAfter,
            reason: 'VIP approved',
            comment: `Review ${dayText(term.reviewDate)}`,
            changedByUserId: input.access.userId,
          });
        }
        changes.push(
          { field: 'vipTermStartsOn', old: null, new: dayText(term.startsOn) },
          { field: 'vipTermEndsOn', old: null, new: dayText(term.endsOn) },
          { field: 'vipReviewDate', old: null, new: dayText(term.reviewDate) }
        );
      }

      await vipStore.decide(input.tenantId, request.id, { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decidedBy: input.access.userId, decidedAt: now, note });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'Member',
        entityId: member.id,
        entityLabel: label(member),
        changes,
      });
      const decided = (await vipStore.find(input.tenantId, request.id)) as VipRequestRecord;
      return presentVipRequest(decided, await memberStore.userNames(input.tenantId, vipUserIds([decided])));
    });
  }
}

/**
 * FR-VIP-05, FR-TIR-08, FR-AUD-14: ends the VIP early, with a reason. A VIP term
 * that has started ends yesterday, so today the member holds the highest other
 * valid tier, Bronze if none; a term not yet started is removed. The earlier
 * end date is kept on the term.
 */
export class EndVipUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; memberId: string; reason: unknown }): Promise<{ memberId: string; endedOn: string }> {
    input.access.ensure(MEMBERS_VIP_APPROVE);
    const reason = vipReason(input.reason, 'A reason is required to end VIP.');
    const now = this.now();
    const today = dayKeyInZone(now, input.timezone);
    const yesterday = dayText(addDays(dayDate(today), -1));

    return this.writeTx.run(async ({ memberStore, paymentStore, settingsStore, relationshipStore, vipStore, auditTrail }) => {
      if (!(await paymentStore.lockMember(input.tenantId, input.memberId))) throw new MemberNotFoundError();
      const member = (await memberStore.find(input.tenantId, input.memberId)) as MemberRecord;
      const deps = { paymentStore, settingsStore, memberStore, relationshipStore };
      const termsBefore = await paymentStore.listTerms(member.id);
      const running = termsBefore.filter((t) => t.source === 'VIP' && (t.endsOn === null || t.endsOn >= today));
      if (running.length === 0) throw new VipRefusedError('NOT_VIP');
      const tierBefore = await effectiveTierAt(deps, input.tenantId, member, termsBefore, today);

      for (const term of running) {
        if (term.startsOn >= today) await paymentStore.deleteTerm(term.id);
        else await paymentStore.endTermEarly(term.id, yesterday, term.endsOn ?? yesterday);
      }
      const tierAfter = await effectiveTierAt(deps, input.tenantId, member, await paymentStore.listTerms(member.id), today);
      await paymentStore.setCurrentTier(input.tenantId, member.id, tierAfter);
      if (tierAfter !== tierBefore) {
        await paymentStore.addTierHistory({
          memberId: member.id,
          fromTier: tierBefore,
          toTier: tierAfter,
          reason: 'VIP ended',
          comment: reason,
          changedByUserId: input.access.userId,
        });
      }
      await vipStore.markLatestApprovedEnded(input.tenantId, member.id, { endedAt: now, endedBy: input.access.userId, reason });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'Member',
        entityId: member.id,
        entityLabel: label(member),
        changes: [
          { field: 'vip', old: 'ACTIVE', new: 'ENDED' },
          { field: 'vipEndedOn', old: null, new: today },
          { field: 'reason', old: null, new: reason },
        ],
      });
      return { memberId: member.id, endedOn: today };
    });
  }
}

/** FR-VIP-02: the approvers' list of requests, newest first, filtered by status. */
export class ListVipRequestsUseCase {
  constructor(
    private readonly vipStore: IVipRequestStore,
    private readonly memberStore: IMemberStore
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; status?: unknown; page?: number; limit?: number }) {
    input.access.ensure(MEMBERS_VIP_APPROVE);
    const status = VIP_REQUEST_STATUSES.includes(input.status as VipRequestStatus) ? (input.status as VipRequestStatus) : undefined;
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 25)));
    const result = await this.vipStore.search(input.tenantId, { status, page, limit });
    const names = await this.memberStore.userNames(input.tenantId, vipUserIds(result.data));
    return { data: result.data.map((r) => presentVipRequest(r, names)), total: result.total, page, limit };
  }
}
