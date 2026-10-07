import { PrismaClient } from '@prisma/client';
import { DEFAULT_MEMBERSHIP_SETTINGS } from '../domain/DefaultMembership';
import { formatReceiptNumber } from '../domain/memberPayment';
import type { IReceiptNumbers } from '../application/ports/IMemberPaymentStore';

/** The kind of document the receipt numbers count (D7). */
export const RECEIPT_SEQUENCE = 'MEMBER_RECEIPT';

/**
 * Receipt numbers from DocumentSequence, as offer and contract numbers are
 * (FR-MPAY-05, D7): one row per workspace and calendar year, created if missing
 * (`skipDuplicates`, so two first payments of a year cannot collide) and then
 * incremented, which takes the row's lock until the transaction ends. Two
 * payments recorded at the same moment get consecutive numbers. A voided
 * payment keeps its number; the prefix is the workspace's setting.
 */
export class PrismaReceiptNumbers implements IReceiptNumbers {
  constructor(private readonly prisma: PrismaClient) {}

  async next(tenantId: string, year: number): Promise<string> {
    const settings = await this.prisma.membershipSettings.findUnique({ where: { tenantId }, select: { receiptPrefix: true } });
    const key = { tenantId, kind: RECEIPT_SEQUENCE, year };
    await this.prisma.documentSequence.createMany({ data: [{ ...key, next: 1 }], skipDuplicates: true });
    const row = await this.prisma.documentSequence.update({
      where: { tenantId_kind_year: key },
      data: { next: { increment: 1 } },
    });
    return formatReceiptNumber(settings?.receiptPrefix ?? DEFAULT_MEMBERSHIP_SETTINGS.receiptPrefix, year, row.next - 1);
  }
}
