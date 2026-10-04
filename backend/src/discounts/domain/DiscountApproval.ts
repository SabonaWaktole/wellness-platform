import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { ApprovedDiscount } from './DiscountPolicy';
import { DiscountApprovalNotFoundError, DiscountApprovalTransitionError, SelfApprovalError } from './errors';

export type DiscountApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'SUPERSEDED';

/**
 * What is asked for: a discount above the cap (FR-DSC-03), or a manual
 * monthly price on a "Price on request" offer (FR-PRC-09).
 */
export type DiscountApprovalKind = 'DISCOUNT' | 'MANUAL_PRICE';

export interface DiscountApprovalProps {
  id: string;
  tenantId: string;
  quotationId: string;
  requestedByUserId: string;
  kind: DiscountApprovalKind;
  /** DISCOUNT only. */
  requestedPercent: Percent | null;
  /** DISCOUNT only: the list price the discount was asked on (FR-DSC-08). */
  listPriceAtRequest: Money | null;
  /** MANUAL_PRICE only. */
  requestedMonthlyPrice: Money | null;
  approvedPercent: Percent | null;
  approvedMonthlyPrice: Money | null;
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

interface RequestBase {
  id: string;
  tenantId: string;
  quotationId: string;
  requestedByUserId: string;
  reason: string;
  now: Date;
}

const cleanReason = (reason: string, what: string): string => {
  const trimmed = reason.trim();
  if (!trimmed) throw new DiscountApprovalTransitionError(`A reason is required for ${what}.`);
  if (trimmed.length > REASON_MAX) throw new DiscountApprovalTransitionError('The reason is too long.');
  return trimmed;
};

const positive = (price: Money): Money => {
  if (price.isZero() || Number(price.toString()) < 0) {
    throw new DiscountApprovalTransitionError('A manual price must be more than 0.');
  }
  return price;
};

/**
 * A request to apply a discount above the cap (FR-DSC-03..12), or to set a
 * manual price on a "Price on request" offer (FR-PRC-09). One row per
 * request; a new request supersedes the offer's earlier pending one.
 */
export class DiscountApproval {
  private constructor(private props: DiscountApprovalProps) {}

  /** FR-DSC-03: a discount above the cap, with a reason. */
  static request(
    input: RequestBase & { requestedPercent: Percent; listPriceAtRequest: Money }
  ): DiscountApproval {
    return new DiscountApproval({
      ...DiscountApproval.base(input, cleanReason(input.reason, 'a discount above the cap')),
      kind: 'DISCOUNT',
      requestedPercent: input.requestedPercent,
      listPriceAtRequest: input.listPriceAtRequest,
    });
  }

  /** FR-PRC-09: a Sales User proposes a manual price; it waits for approval. */
  static requestManualPrice(input: RequestBase & { requestedMonthlyPrice: Money }): DiscountApproval {
    return new DiscountApproval({
      ...DiscountApproval.base(input, cleanReason(input.reason, 'a manual price')),
      kind: 'MANUAL_PRICE',
      requestedMonthlyPrice: positive(input.requestedMonthlyPrice),
    });
  }

  /**
   * FR-PRC-09: a user who holds `discounts.approve` for the deal sets the
   * manual price directly. It is recorded as an approved request of its own,
   * so the audit trail and the "covers this price" check read the same as for
   * a decided request. This is not a self-approval in the FR-DSC-09 sense:
   * nothing was asked of anyone else.
   */
  static setManualPrice(input: RequestBase & { monthlyPrice: Money }): DiscountApproval {
    const price = positive(input.monthlyPrice);
    return new DiscountApproval({
      ...DiscountApproval.base(input, cleanReason(input.reason, 'a manual price')),
      kind: 'MANUAL_PRICE',
      requestedMonthlyPrice: price,
      approvedMonthlyPrice: price,
      status: 'APPROVED',
      decidedByUserId: input.requestedByUserId,
      decidedAt: input.now,
    });
  }

  static rebuild(props: DiscountApprovalProps): DiscountApproval {
    return new DiscountApproval({ ...props });
  }

  private static base(input: RequestBase, reason: string): DiscountApprovalProps {
    return {
      id: input.id,
      tenantId: input.tenantId,
      quotationId: input.quotationId,
      requestedByUserId: input.requestedByUserId,
      kind: 'DISCOUNT',
      requestedPercent: null,
      listPriceAtRequest: null,
      requestedMonthlyPrice: null,
      approvedPercent: null,
      approvedMonthlyPrice: null,
      reason,
      status: 'PENDING',
      decidedByUserId: null,
      decidedAt: null,
      comment: null,
      remindedAt: null,
      createdAt: input.now,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get kind(): DiscountApprovalKind {
    return this.props.kind;
  }
  get status(): DiscountApprovalStatus {
    return this.props.status;
  }
  get approvedPercent(): Percent | null {
    return this.props.approvedPercent;
  }
  get approvedMonthlyPrice(): Money | null {
    return this.props.approvedMonthlyPrice;
  }

  /** An approved discount, as `DiscountPolicy` weighs it (FR-DSC-08); null otherwise. */
  get approvedDiscount(): ApprovedDiscount | null {
    const { kind, status, listPriceAtRequest, approvedPercent } = this.props;
    if (kind !== 'DISCOUNT' || status !== 'APPROVED' || !listPriceAtRequest || !approvedPercent) return null;
    return { listPriceAtRequest, approvedPercent };
  }

  /** FR-PRC-09: an approved manual price covers exactly that price, no other. */
  coversManualPrice(price: Money): boolean {
    const { kind, status, approvedMonthlyPrice } = this.props;
    return kind === 'MANUAL_PRICE' && status === 'APPROVED' && approvedMonthlyPrice !== null && approvedMonthlyPrice.equals(price);
  }

  /**
   * FR-DSC-06, FR-PRC-09: approve, with an optional comment. A discount may be
   * approved at or below the requested percent; a manual price at the
   * requested price or another one the approver sets.
   */
  approve(input: {
    decidedByUserId: string;
    approvedPercent?: Percent | null;
    approvedMonthlyPrice?: Money | null;
    comment: string | null;
    now: Date;
  }): void {
    this.ensurePending();
    if (input.decidedByUserId === this.props.requestedByUserId) throw new SelfApprovalError();
    const comment = input.comment?.trim() ?? '';
    if (comment.length > COMMENT_MAX) throw new DiscountApprovalTransitionError('The comment is too long.');
    let approvedPercent: Percent | null = null;
    let approvedMonthlyPrice: Money | null = null;
    if (this.props.kind === 'DISCOUNT') {
      approvedPercent = input.approvedPercent ?? this.props.requestedPercent!;
      if (approvedPercent.exceeds(this.props.requestedPercent!)) {
        throw new DiscountApprovalTransitionError('The approved percent cannot be higher than requested.');
      }
    } else {
      approvedMonthlyPrice = positive(input.approvedMonthlyPrice ?? this.props.requestedMonthlyPrice!);
    }
    this.props = {
      ...this.props,
      status: 'APPROVED',
      approvedPercent,
      approvedMonthlyPrice,
      decidedByUserId: input.decidedByUserId,
      decidedAt: input.now,
      comment: comment === '' ? null : comment,
    };
  }

  /** FR-DSC-06, 07: reject with a required comment. */
  reject(input: { decidedByUserId: string; comment: string; now: Date }): void {
    this.ensurePending();
    if (input.decidedByUserId === this.props.requestedByUserId) throw new SelfApprovalError();
    const comment = input.comment.trim();
    if (!comment) throw new DiscountApprovalTransitionError('A comment is required to reject a request.');
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
