import type { VipRequestStatus } from '../domain/vipRequest';
import type { VipRequestRecord } from './ports/IVipRequestStore';

/** A VIP request as the routes send it: names resolved, nothing else added (FR-VIP-05). */
export interface VipRequestView {
  id: string;
  member: { id: string; memberNumber: string; name: string };
  status: VipRequestStatus;
  reason: string;
  requestedBy: { id: string; name: string | null };
  createdAt: Date;
  decidedBy: { id: string; name: string | null } | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  endedBy: { id: string; name: string | null } | null;
  endedAt: Date | null;
  endReason: string | null;
}

export const vipUserIds = (records: readonly VipRequestRecord[]): string[] =>
  records.flatMap((r) => [r.requestedBy, ...(r.decidedBy ? [r.decidedBy] : []), ...(r.endedBy ? [r.endedBy] : [])]);

export function presentVipRequest(r: VipRequestRecord, names: Record<string, string>): VipRequestView {
  const user = (id: string | null) => (id ? { id, name: names[id] ?? null } : null);
  return {
    id: r.id,
    member: { id: r.memberId, memberNumber: r.memberNumber, name: `${r.memberFirstName} ${r.memberLastName}` },
    status: r.status,
    reason: r.reason,
    requestedBy: user(r.requestedBy)!,
    createdAt: r.createdAt,
    decidedBy: user(r.decidedBy),
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    endedBy: user(r.endedBy),
    endedAt: r.endedAt,
    endReason: r.endReason,
  };
}
