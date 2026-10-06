import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { AuditChange } from '../../../audit/domain/AuditChange';
import { actionFor, diff } from '../../../audit/domain/diff';
import { Money } from '../../../pricing/domain/Money';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { Contract, ContractStatus } from '../../domain/Contract';
import { ContractPayment, PaymentStatus } from '../../domain/ContractPayment';
import { ContractPaymentHistoryEntry, NO_PREVIOUS_STATUS } from '../../domain/ContractPaymentHistory';
import { PaymentRuleError, correct, markInvoiced, markPending, recordReceipt, reverseReceipt } from '../../domain/instalmentRules';
import { IContractWriteTransaction, ContractWriteRepos } from '../ports/IContractWriteTransaction';
import { PAYMENT_AUDIT_FIELDS, paymentLabel, paymentSnapshot } from './contractAudit';

/**
 * The instalment actions of M3 Slice 8 (FR-PAY-03..08). Each is the Slice 1
 * rule for that action plus the same three writes, in one transaction: the
 * instalment, one `ContractPaymentHistory` row (FR-PAY-08) and one
 * `ContractPayment` audit entry (FR-AUD-11).
 *
 * Only `payments.update` changes an instalment (FR-PAY-05, FR-RBAC-24). The
 * route checks it and so does `InstalmentChange.run`, so a use case called from
 * somewhere else is still refused. The permission is not scoped, so it is not
 * narrowed to the user's own companies: a Sales User never holds it, and a
 * Finance role that does is meant to work across the workspace.
 */

interface InstalmentInput {
  tenantId: string;
  contractId: string;
  paymentId: string;
  actingUserId: string;
  access: AccessContext;
}

/** What an action did, beyond the new state of the instalment. */
interface Outcome {
  comment?: string | null;
  amountReceived?: Money;
  receivedOn?: Date | null;
  method?: string | null;
  /** Extra audit changes, such as the reason. */
  extra?: AuditChange[];
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;

/** `YYYY-MM-DD` (or a full ISO date) as the workspace day, at UTC midnight (D4). */
export const parseDay = (value: string, what: string): Date => {
  const day = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) throw new PaymentRuleError(`${what} is not a valid date`);
  return day;
};

const requireReason = (reason: string | null | undefined, message: string): string => {
  const trimmed = text(reason);
  if (!trimmed) throw new PaymentRuleError(message);
  return trimmed;
};

const positiveMoney = (value: string | number, what: string): Money => {
  const money = Money.of(value);
  if (!money.isPositive()) throw new PaymentRuleError(`${what} must be more than zero`);
  return money;
};

type ChangeContext = { today: Date; contract: Contract; repos: ContractWriteRepos };

abstract class InstalmentUseCase {
  constructor(
    protected readonly writeTx: IContractWriteTransaction,
    protected readonly tenants: ITenantRepository,
    protected readonly now: () => Date = () => new Date()
  ) {}

  /** The permission check, the workspace day and the transaction every action shares. */
  private async inTransaction<T>(
    input: { tenantId: string; contractId: string; access: AccessContext },
    work: (ctx: ChangeContext & { now: Date }) => Promise<T>
  ): Promise<T> {
    if (!input.access.can('payments.update')) {
      throw new PermissionDeniedError('payments.update', 'You do not have permission to change payments.');
    }
    const now = this.now();
    const tenant = await this.tenants.findById(input.tenantId);
    const today = new Date(`${dayKeyInZone(now, tenant?.timezone ?? 'UTC')}T00:00:00.000Z`);

    return this.writeTx.run(async (repos) => {
      const contract = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!contract) throw new Error('Contract not found');
      return work({ today, contract, repos, now });
    });
  }

  /** Changes one existing instalment: the rule runs in `change`, which returns what to put in history. */
  protected async changeInstalment(
    input: InstalmentInput,
    change: (payment: ContractPayment, ctx: ChangeContext) => Outcome
  ) {
    return this.inTransaction(input, async (ctx) => {
      const { repos, contract, now } = ctx;
      const payment = await repos.paymentRepo.findById(input.tenantId, input.paymentId);
      // The parent check is not redundant: without it a payment id of another
      // contract would be changed through this one.
      if (!payment || payment.contractId !== input.contractId) throw new Error('Payment not found');

      const before = paymentSnapshot(payment);
      const fromStatus = payment.status;
      const outcome = change(payment, ctx);
      payment.updatedAt = now;

      await repos.paymentRepo.save(payment);
      await this.writeHistoryAndAudit(repos, input, { contract, payment, before, fromStatus, outcome, now });
      return { payment, contract: (await repos.contractRepo.findById(input.tenantId, input.contractId)) ?? contract };
    });
  }

  protected add(
    input: Omit<InstalmentInput, 'paymentId'>,
    create: (ctx: ChangeContext, nextIndex: number) => { payment: ContractPayment; outcome: Outcome }
  ) {
    return this.inTransaction(input, async (ctx) => {
      const { repos, contract, now } = ctx;
      const existing = await repos.paymentRepo.findByContractId(input.tenantId, input.contractId);
      const nextIndex = existing.reduce((max, p) => Math.max(max, p.periodIndex), 0) + 1;
      const { payment, outcome } = create(ctx, nextIndex);

      await repos.paymentRepo.save(payment);
      await this.writeHistoryAndAudit(
        repos,
        { ...input, paymentId: payment.id },
        { contract, payment, before: null, fromStatus: NO_PREVIOUS_STATUS, outcome, now, action: AuditAction.Create }
      );
      return { payment, contract: (await repos.contractRepo.findById(input.tenantId, input.contractId)) ?? contract };
    });
  }

  protected remove(input: InstalmentInput, check: (payment: ContractPayment) => Outcome) {
    return this.inTransaction(input, async ({ repos, contract }) => {
      const payment = await repos.paymentRepo.findById(input.tenantId, input.paymentId);
      if (!payment || payment.contractId !== input.contractId) throw new Error('Payment not found');
      const outcome = check(payment);

      // The history goes with the instalment; the audit entry is what keeps the record.
      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: input.actingUserId,
        userRole: input.access.auditRole,
        action: AuditAction.Delete,
        entityType: 'ContractPayment',
        entityId: payment.id,
        entityLabel: paymentLabel(contract, payment),
        changes: [
          ...diff(paymentSnapshot(payment), {} as Record<string, unknown>, [...PAYMENT_AUDIT_FIELDS]),
          ...(outcome.extra ?? []),
        ],
      });
      await repos.paymentRepo.delete(input.tenantId, input.paymentId);
      return { contract: (await repos.contractRepo.findById(input.tenantId, input.contractId)) ?? contract };
    });
  }

  private async writeHistoryAndAudit(
    repos: ContractWriteRepos,
    input: InstalmentInput,
    done: {
      contract: Contract;
      payment: ContractPayment;
      before: Record<string, unknown> | null;
      fromStatus: string;
      outcome: Outcome;
      now: Date;
      action?: AuditAction;
    }
  ) {
    const { contract, payment, before, fromStatus, outcome, now } = done;
    await repos.paymentHistoryRepo.save({
      id: randomUUID(),
      tenantId: input.tenantId,
      paymentId: payment.id,
      fromStatus,
      toStatus: payment.status,
      amountReceived: outcome.amountReceived ?? Money.zero(),
      receivedOn: outcome.receivedOn ?? null,
      method: outcome.method ?? null,
      changedByUserId: input.actingUserId,
      comment: outcome.comment ?? null,
      changedAt: now,
    });

    const changes = [
      ...diff(before ?? ({} as Record<string, unknown>), paymentSnapshot(payment), [...PAYMENT_AUDIT_FIELDS]),
      ...(outcome.extra ?? []),
    ];
    await repos.auditTrail.record({
      tenantId: input.tenantId,
      userId: input.actingUserId,
      userRole: input.access.auditRole,
      action: done.action ?? actionFor(changes, AuditAction.Update),
      entityType: 'ContractPayment',
      entityId: payment.id,
      entityLabel: paymentLabel(contract, payment),
      changes,
    });
  }
}

const reasonChange = (reason: string | null): AuditChange[] =>
  reason ? [{ field: 'reason', old: null, new: reason }] : [];

/** NOT_INVOICED -> INVOICE_ISSUED, with the invoice number and date (FR-PAY-06). */
export class RecordInvoiceUseCase extends InstalmentUseCase {
  execute(input: InstalmentInput & { invoiceNumber: string; invoiceDate: string }) {
    return this.changeInstalment(input, (payment) => {
      const result = markInvoiced(payment.state(), input.invoiceNumber, parseDay(input.invoiceDate, 'The invoice date'));
      payment.apply(result);
      return { comment: `Invoice ${result.invoiceNumber}` };
    });
  }
}

/** INVOICE_ISSUED -> PAYMENT_PENDING: the invoice was sent and the client has not paid (FR-PAY-06). */
export class MarkPaymentPendingUseCase extends InstalmentUseCase {
  execute(input: InstalmentInput & { comment?: string | null }) {
    return this.changeInstalment(input, (payment) => {
      payment.apply(markPending(payment.state()));
      return { comment: text(input.comment) };
    });
  }
}

/**
 * Adds a receipt to the amount already received (FR-PAY-07). The status follows
 * from the amounts: Partially Paid, or Paid at the full amount. A receipt above
 * what is outstanding, dated in the future or without a method is refused.
 */
export class RecordReceiptUseCase extends InstalmentUseCase {
  execute(input: InstalmentInput & { amount: string | number; receivedOn: string; method: string; comment?: string | null }) {
    return this.changeInstalment(input, (payment, { today }) => {
      const amount = Money.of(input.amount);
      const receivedOn = parseDay(input.receivedOn, 'The date received');
      const result = recordReceipt(payment.state(), amount, receivedOn, input.method, today);
      payment.apply({ paidAmount: result.paidAmount, status: result.status, paidAt: result.paidAt, method: result.method });
      return { comment: text(input.comment), amountReceived: amount, receivedOn: result.paidAt, method: result.method };
    });
  }
}

/**
 * Takes money back off an instalment: a receipt recorded against the wrong
 * month, or a transfer that bounced (D6). It is a history row with a negative
 * amount, and the status is worked out again from what is left.
 */
export class ReverseReceiptUseCase extends InstalmentUseCase {
  execute(input: InstalmentInput & { amount: string | number; comment: string }) {
    return this.changeInstalment(input, (payment) => {
      const amount = Money.of(input.amount);
      const result = reverseReceipt(payment.state(), amount, input.comment);
      payment.apply({
        paidAmount: result.paidAmount,
        status: result.status,
        paidAt: result.paidAmount.isZero() ? null : payment.paidAt,
      });
      return { comment: input.comment.trim(), amountReceived: Money.zero().subtract(amount) };
    });
  }
}

/** Puts an instalment back to an earlier status, with a comment, while nothing is received (FR-PAY-06). */
export class CorrectPaymentStatusUseCase extends InstalmentUseCase {
  execute(input: InstalmentInput & { status: PaymentStatus; comment: string }) {
    return this.changeInstalment(input, (payment) => {
      payment.apply(correct(payment.state(), input.status, input.comment));
      return { comment: input.comment.trim() };
    });
  }
}

/**
 * An instalment the generated schedule did not anticipate: a set-up fee, an
 * extra service, a catch-up. It starts Not Invoiced and needs a reason
 * (FR-PAY-04). `periodIndex` is derived, so two rows never claim the same one.
 */
export class AddContractPaymentUseCase extends InstalmentUseCase {
  execute(input: Omit<InstalmentInput, 'paymentId'> & { dueDate: string; amount: string | number; reason: string; note?: string | null }) {
    return this.add(input, ({ contract }, periodIndex) => {
      const reason = requireReason(input.reason, 'A reason is required to add an instalment');
      if (![ContractStatus.Active, ContractStatus.Suspended, ContractStatus.Expired].includes(contract.status)) {
        throw new PaymentRuleError('Instalments are created when the contract is activated; this contract has none to add to');
      }
      const amount = positiveMoney(input.amount, 'The amount');
      const payment = ContractPayment.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        contractId: input.contractId,
        periodIndex,
        dueDate: parseDay(input.dueDate, 'The due date'),
        amount: Number(amount.toString()),
        status: PaymentStatus.NotInvoiced,
        note: text(input.note),
      });
      return { payment, outcome: { comment: reason, extra: reasonChange(reason) } };
    });
  }
}

/**
 * Changes the due date or amount of an instalment with nothing received, with a
 * reason (FR-PAY-04), or its note. An instalment that has received money keeps
 * its due date and amount: reverse the receipt first. The contract's price is
 * never touched, so a later price change does not reach issued instalments.
 */
export class UpdateContractPaymentUseCase extends InstalmentUseCase {
  execute(input: InstalmentInput & { dueDate?: string; amount?: string | number; note?: string | null; reason?: string | null }) {
    return this.changeInstalment(input, (payment) => {
      const changesTerms = input.dueDate !== undefined || input.amount !== undefined;
      if (changesTerms) {
        if (!payment.state().paidAmount.isZero()) {
          throw new PaymentRuleError('Money has been received on this instalment: reverse the receipt before changing its due date or amount');
        }
        if (payment.status === PaymentStatus.Waived) throw new PaymentRuleError('A waived instalment cannot be changed');
      }
      const reason = changesTerms ? requireReason(input.reason, 'A reason is required to change the due date or amount') : text(input.reason);
      payment.apply({
        dueDate: input.dueDate !== undefined ? parseDay(input.dueDate, 'The due date') : undefined,
        amount: input.amount !== undefined ? positiveMoney(input.amount, 'The amount') : undefined,
        note: input.note !== undefined ? text(input.note) : undefined,
      });
      return { comment: reason ?? 'Note changed', extra: reasonChange(reason) };
    });
  }
}

/** Removes an instalment with nothing received, with a reason (FR-PAY-04). */
export class DeleteContractPaymentUseCase extends InstalmentUseCase {
  execute(input: InstalmentInput & { reason: string }) {
    return this.remove(input, (payment) => {
      const reason = requireReason(input.reason, 'A reason is required to remove an instalment');
      if (!payment.state().paidAmount.isZero()) {
        throw new PaymentRuleError('An instalment with money received cannot be removed: reverse the receipt first');
      }
      return { extra: reasonChange(reason) };
    });
  }
}
