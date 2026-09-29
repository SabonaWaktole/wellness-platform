import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';
import { contractReference } from '../../../contracts/domain/contractReference';

/**
 * Payments received on the company's contracts, under `payments.view`.
 * There is no payment status history, so the event is the recorded receipt
 * (`paidAt`), not every status change.
 */
export class PrismaPaymentTimelineSource implements TimelineSource {
  readonly category = 'PAYMENT' as const;
  readonly permission = 'payments.view';

  constructor(private prisma: PrismaClient) {}

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const payments = await this.prisma.contractPayment.findMany({
      where: { tenantId, paidAt: { not: null }, contract: { tenantId, clientId } },
      include: { contract: { select: { planName: true } } },
    });

    return payments.map((payment) => ({
      id: `payment:${payment.id}`,
      category: this.category,
      type: 'PAYMENT_RECEIVED',
      timestamp: payment.paidAt!.toISOString(),
      actorId: null,
      details: {
        contractId: payment.contractId,
        reference: contractReference(payment.contractId),
        planName: payment.contract.planName,
        paymentId: payment.id,
        status: payment.status,
        amount: payment.amount,
        paidAmount: payment.paidAmount,
        dueDate: payment.dueDate.toISOString(),
        method: payment.method,
      },
    }));
  }
}
