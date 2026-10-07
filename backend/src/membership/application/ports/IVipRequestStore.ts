import type { VipRequestStatus } from '../../domain/vipRequest';

/** A VIP request with the member it is about (M4 Slice 7). */
export interface VipRequestRecord {
  id: string;
  memberId: string;
  memberNumber: string;
  memberFirstName: string;
  memberLastName: string;
  requestedBy: string;
  reason: string;
  status: VipRequestStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  endedAt: Date | null;
  endedBy: string | null;
  endReason: string | null;
  createdAt: Date;
}

export interface NewVipRequest {
  id: string;
  tenantId: string;
  memberId: string;
  requestedBy: string;
  reason: string;
}

export interface IVipRequestStore {
  create(request: NewVipRequest): Promise<VipRequestRecord>;
  find(tenantId: string, id: string): Promise<VipRequestRecord | null>;
  /** The member's open request, if any (NFR-DAT-02). */
  findPending(tenantId: string, memberId: string): Promise<VipRequestRecord | null>;
  decide(tenantId: string, id: string, decision: { status: 'APPROVED' | 'REJECTED'; decidedBy: string; decidedAt: Date; note: string | null }): Promise<void>;
  /** Marks the member's latest approved request that is still running as ended early (FR-VIP-05). */
  markLatestApprovedEnded(tenantId: string, memberId: string, ended: { endedAt: Date; endedBy: string; reason: string }): Promise<void>;
  listForMember(tenantId: string, memberId: string): Promise<VipRequestRecord[]>;
  search(tenantId: string, params: { status?: VipRequestStatus; page: number; limit: number }): Promise<{ data: VipRequestRecord[]; total: number }>;
}
