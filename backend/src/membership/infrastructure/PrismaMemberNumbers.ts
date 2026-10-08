import { PrismaClient } from '@prisma/client';
import { DEFAULT_MEMBERSHIP_SETTINGS } from '../domain/DefaultMembership';
import { formatMemberNumber } from '../domain/Member';
import type { IMemberNumbers } from '../application/ports/IMemberStore';

/** The kind of document the member numbers count (D7). */
export const MEMBER_SEQUENCE = 'MEMBER';

/**
 * Member numbers from DocumentSequence, as offer and contract numbers are
 * (FR-MEM-03, D7), with `year = 0` so the count never restarts. The row is
 * created if missing (`skipDuplicates`, so two first members cannot collide)
 * and then incremented, which takes the row's lock until the transaction ends:
 * two members created at the same moment get consecutive numbers. The prefix is
 * the workspace's setting; a number already issued is never changed.
 */
export class PrismaMemberNumbers implements IMemberNumbers {
  constructor(private readonly prisma: PrismaClient) {}

  async next(tenantId: string): Promise<string> {
    const settings = await this.prisma.membershipSettings.findUnique({ where: { tenantId }, select: { memberPrefix: true } });
    const key = { tenantId, kind: MEMBER_SEQUENCE, year: 0 };
    await this.prisma.documentSequence.createMany({ data: [{ ...key, next: 1 }], skipDuplicates: true });
    const row = await this.prisma.documentSequence.update({
      where: { tenantId_kind_year: key },
      data: { next: { increment: 1 } },
    });
    return formatMemberNumber(settings?.memberPrefix ?? DEFAULT_MEMBERSHIP_SETTINGS.memberPrefix, row.next - 1);
  }
}
