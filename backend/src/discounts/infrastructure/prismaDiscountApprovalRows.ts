import { Prisma } from '@prisma/client';
import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { DiscountApproval, DiscountApprovalKind, DiscountApprovalStatus } from '../domain/DiscountApproval';

type ApprovalRow = Prisma.DiscountApprovalGetPayload<Record<string, never>>;

const STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED'] as const;

const money = (value: Prisma.Decimal | null): Money | null => (value === null ? null : Money.of(value.toFixed(2)));
const percent = (value: Prisma.Decimal | null): Percent | null => (value === null ? null : Percent.of(value.toFixed(2)));

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
    kind: (row.kind === 'MANUAL_PRICE' ? 'MANUAL_PRICE' : 'DISCOUNT') as DiscountApprovalKind,
    requestedPercent: percent(row.requestedPercent),
    listPriceAtRequest: money(row.listPriceAtRequest),
    requestedMonthlyPrice: money(row.requestedMonthlyPrice),
    approvedPercent: percent(row.approvedPercent),
    approvedMonthlyPrice: money(row.approvedMonthlyPrice),
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
    approvedMonthlyPrice: props.approvedMonthlyPrice?.toString() ?? null,
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
    kind: props.kind,
    requestedPercent: props.requestedPercent?.toString() ?? null,
    listPriceAtRequest: props.listPriceAtRequest?.toString() ?? null,
    requestedMonthlyPrice: props.requestedMonthlyPrice?.toString() ?? null,
    reason: props.reason,
    createdAt: props.createdAt,
  };
}
