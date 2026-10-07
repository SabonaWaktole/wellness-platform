import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { hashCardToken } from '../domain/cardToken';
import type { CardOwner, ICardStore } from '../application/ports/ICardStore';

export class PrismaCardStore implements ICardStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async resolve(token: string): Promise<CardOwner | null> {
    const row = await this.prisma.member.findUnique({
      where: { cardToken: token },
      select: { id: true, tenantId: true, tenant: { select: { timezone: true } } },
    });
    return row ? { tenantId: row.tenantId, memberId: row.id, timezone: row.tenant.timezone } : null;
  }

  async wasReplaced(tokenHash: string): Promise<boolean> {
    return (await this.prisma.memberCardToken.count({ where: { tokenHash } })) > 0;
  }

  async tokenOf(tenantId: string, memberId: string): Promise<string | null> {
    const row = await this.prisma.member.findFirst({ where: { id: memberId, tenantId }, select: { cardToken: true } });
    return row?.cardToken ?? null;
  }

  async tokensOf(tenantId: string, memberIds: string[]): Promise<Record<string, string>> {
    if (memberIds.length === 0) return {};
    const rows = await this.prisma.member.findMany({ where: { tenantId, id: { in: memberIds } }, select: { id: true, cardToken: true } });
    return Object.fromEntries(rows.map((r) => [r.id, r.cardToken]));
  }

  async replace(tenantId: string, memberId: string, oldToken: string, newToken: string): Promise<boolean> {
    // Only the token read a moment ago can be replaced, so two staff members replacing at once cannot lose a hash.
    const changed = await this.prisma.member.updateMany({ where: { id: memberId, tenantId, cardToken: oldToken }, data: { cardToken: newToken } });
    if (changed.count === 0) return false;
    await this.prisma.memberCardToken.create({ data: { id: randomUUID(), memberId, tokenHash: hashCardToken(oldToken) } });
    return true;
  }
}
