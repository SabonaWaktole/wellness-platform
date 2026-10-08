import { InvalidMemberError, MEMBER_LIMITS } from './Member';

export const VIP_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
export type VipRequestStatus = (typeof VIP_REQUEST_STATUSES)[number];

export const VIP_DECISIONS = ['APPROVE', 'REJECT'] as const;
export type VipDecision = (typeof VIP_DECISIONS)[number];

export type VipRefusal = 'MEMBER_CLOSED' | 'OPEN_REQUEST' | 'OWN_REQUEST' | 'NOT_PENDING' | 'NOT_VIP';

/** A required free-text reason, trimmed and limited (FR-VIP-01, FR-VIP-02, FR-VIP-05). */
export function vipReason(value: unknown, message: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') throw new InvalidMemberError('reason', message);
  if (text.length > MEMBER_LIMITS.reason) throw new InvalidMemberError('reason', `The reason is at most ${MEMBER_LIMITS.reason} characters.`);
  return text;
}

export function vipDecision(value: unknown): VipDecision {
  if (!VIP_DECISIONS.includes(value as VipDecision)) throw new InvalidMemberError('decision', 'The decision is Approve or Reject.');
  return value as VipDecision;
}

/** An optional note on an approval; a rejection needs a reason (FR-VIP-02). */
export function decisionNote(decision: VipDecision, value: unknown): string | null {
  if (decision === 'REJECT') return vipReason(value, 'A reason is required to reject a VIP request.');
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > MEMBER_LIMITS.reason) throw new InvalidMemberError('reason', `The note is at most ${MEMBER_LIMITS.reason} characters.`);
  return text === '' ? null : text;
}

/** FR-VIP-01: a closed member cannot be given VIP, and a member has one open request. */
export function checkVipRequest(input: { memberClosed: boolean; hasOpenRequest: boolean }): VipRefusal | null {
  if (input.memberClosed) return 'MEMBER_CLOSED';
  if (input.hasOpenRequest) return 'OPEN_REQUEST';
  return null;
}

/** FR-VIP-02: only a pending request is decided, never by the person who made it, even if they hold the permission. */
export function checkVipDecision(input: { status: VipRequestStatus; requestedBy: string; deciderId: string; memberClosed: boolean; decision: VipDecision }): VipRefusal | null {
  if (input.status !== 'PENDING') return 'NOT_PENDING';
  if (input.requestedBy === input.deciderId) return 'OWN_REQUEST';
  if (input.decision === 'APPROVE' && input.memberClosed) return 'MEMBER_CLOSED';
  return null;
}
