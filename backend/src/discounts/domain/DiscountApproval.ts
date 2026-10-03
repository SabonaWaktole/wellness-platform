import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { DiscountApprovalNotFoundError, DiscountApprovalTransitionError, SelfApprovalError } from './errors';

export type DiscountApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'SUPERSEDED';

export interface DiscountApprovalProps {
  id: string;
  tenantId: string;
  quotationId: string;
  requestedByUserId: string;
  requestedPercent: Percent;
  listPriceAtRequest: Money;
  approvedPercent: Percent | null;
  reason: string;
  status: DiscountApprovalStatus;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  comment: string | null;
  remindedAt: Date | null;
  createdAt: Date;
}

const REASON_MAX = 2000;
const COMMENT_MAX = 2000;

/**
 * A request to apply a discount above the cap (FR-DSC-03..12).
 *
 * Discount-only in Slice 10: manual prices (FR-PRC-09) are deferred, so there
 * is no MANUAL_PRICE kind yet. One row per request; a new request supersedes
 * the offer's earlier pending one.
 */
export class DiscountApproval {
  private constructor(private props: DiscountApprovalProps) {}

  static request(input: {
    id: string;
    tenantId: string;
    quotationId: string;
    requestedByUserId: string;
    requestedPercent: Percent;
    listPriceAtRequest: Money;
    reason: string;
    now: Date;
  }): DiscountApproval {
    const reason = input.reason.trim();
    if (!reason) throw new DiscountApprovalTransitionError('A reason is required for a discount above the cap.');
    if (reason.length > REASON_MAX) throw new DiscountApprovalTransitionError('The reason is too long.');
    return new DiscountApproval({
      id: input.id,
      tenantId: input.tenantId,
      quotationId: input.quotationId,
      requestedByUserId: input.requestedByUserId,
      requestedPercent: input.requestedPercent,
      listPriceAtRequest: input.listPriceAtRequest,
      approvedPercent: null,
      reason,
      status: 'PENDING',
      decidedByUserId: null,
      decidedAt: null,
      comment: null,
      remindedAt: null,
      createdAt: input.now,
    });
  }

  static rebuild(props: DiscountApprovalProps): DiscountApproval {
    return new DiscountApproval({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get status(): DiscountApprovalStatus {
    return this.props.status;
  }
  get approvedPercent(): Percent | null {
    return this.props.approvedPercent;
  }

  /** FR-DSC-06: approve at or below the requested percent, with an optional comment. */
  approve(input: { decidedByUserId: string; approvedPercent: Percent; comment: string | null; now: Date }): void {
    this.ensurePending();
    if (input.decidedByUserId === this.props.requestedByUserId) throw new SelfApprovalError();
    if (input.approvedPercent.exceeds(this.props.requestedPercent)) {
      throw new DiscountApprovalTransitionError('The approved percent cannot be higher than requested.');
    }
    const comment = input.comment?.trim() ?? '';
    if (comment.length > COMMENT_MAX) throw new DiscountApprovalTransitionError('The comment is too long.');
    this.props = {
      ...this.props,
      status: 'APPROVED',
      approvedPercent: input.approvedPercent,
      decidedByUserId: input.decidedByUserId,
      decidedAt: input.now,
      comment: comment === '' ? null : comment.slice(0, COMMENT_MAX),
    };
  }

  /** FR-DSC-06, 07: reject with a required comment; the offer returns to draft at the cap. */
  reject(input: { decidedByUserId: string; comment: string; now: Date }): void {
    this.ensurePending();
    if (input.decidedByUserId === this.props.requestedByUserId) throw new SelfApprovalError();
    const comment = input.comment.trim();
    if (!comment) throw new DiscountApprovalTransitionError('A comment is required to reject a discount.');
    this.props = {
      ...this.props,
      status: 'REJECTED',
      decidedByUserId: input.decidedByUserId,
      decidedAt: input.now,
      comment: comment.slice(0, COMMENT_MAX),
    };
  }

  /** FR-DSC-10: the salesperson withdraws their pending request. */
  withdraw(now: Date): void {
    this.ensurePending();
    this.props = { ...this.props, status: 'WITHDRAWN', decidedAt: now };
  }

  /** A newer request replaces this pending one. */
  supersede(): void {
    this.ensurePending();
    this.props = { ...this.props, status: 'SUPERSEDED' };
  }

  markReminded(now: Date): void {
    if (this.props.status !== 'PENDING' || this.props.remindedAt) {
      throw new DiscountApprovalNotFoundError();
    }
    this.props = { ...this.props, remindedAt: now };
  }

  /** FR-DSC-12: pending longer than `hours` with no reminder sent yet. */
  needsReminder(hours: number, now: Date): boolean {
    if (this.props.status !== 'PENDING' || this.props.remindedAt) return false;
    return now.getTime() - this.props.createdAt.getTime() >= hours * 3_600_000;
  }

  toProps(): DiscountApprovalProps {
    return { ...this.props };
  }

  private ensurePending(): void {
    if (this.props.status !== 'PENDING') {
      throw new DiscountApprovalTransitionError('Only a pending request can be decided.');
    }
  }
}
