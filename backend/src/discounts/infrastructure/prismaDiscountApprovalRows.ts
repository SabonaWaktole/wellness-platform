import { Prisma } from '@prisma/client';
import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { DiscountApproval, DiscountApprovalStatus } from '../domain/DiscountApproval';

type ApprovalRow = Prisma.DiscountApprovalGetPayload<Record<string, never>>;

const STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED'] as const;

/** A discount-approval row as the domain entity. */
export function toDiscountApproval(row: ApprovalRow): DiscountApproval {
  const status = STATUS.includes(row.status as (typeof STATUS)[number])
    ? (row.status as DiscountApprovalStatus)
    : 'PENDING';
  return DiscountApproval.rebuild({
    id: row.id,
    tenantId: row.tenantId,
    quotationId: row.quotationId,
    requestedByUserId: row.requestedByUserId,
    requestedPercent: Percent.of(row.requestedPercent.toFixed(2)),
    listPriceAtRequest: Money.of(row.listPriceAtRequest.toFixed(2)),
    approvedPercent: row.approvedPercent === null ? null : Percent.of(row.approvedPercent.toFixed(2)),
    reason: row.reason,
    status,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt,
    comment: row.comment,
    remindedAt: row.remindedAt,
    createdAt: row.createdAt,
  });
}

/** The columns a discount approval writes; identity columns are written once, on insert. */
export function approvalColumns(approval: DiscountApproval) {
  const props = approval.toProps();
  return {
    approvedPercent: props.approvedPercent?.toString() ?? null,
    status: props.status,
    decidedByUserId: props.decidedByUserId,
    decidedAt: props.decidedAt,
    comment: props.comment,
    remindedAt: props.remindedAt,
  };
}

/** A new approval row, with its requested values. */
export function insertColumns(approval: DiscountApproval) {
  const props = approval.toProps();
  return {
    ...approvalColumns(approval),
    id: props.id,
    tenantId: props.tenantId,
    quotationId: props.quotationId,
    requestedByUserId: props.requestedByUserId,
    requestedPercent: props.requestedPercent.toString(),
    listPriceAtRequest: props.listPriceAtRequest.toString(),
    reason: props.reason,
    createdAt: props.createdAt,
  };
}
