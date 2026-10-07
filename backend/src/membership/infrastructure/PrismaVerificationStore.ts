import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import type { IdentityChoice, VerificationChannel, VerificationResult } from '../domain/verification';
import type { IVerificationStore, NewVerificationEvent, VerificationEventRecord } from '../application/ports/IVerificationStore';

export class PrismaVerificationStore implements IVerificationStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async record(event: NewVerificationEvent): Promise<string> {
    const id = randomUUID();
    await this.prisma.verificationEvent.create({ data: { id, ...event } });
    return id;
  }

  async setIdentity(tenantId: string, id: string, userId: string, choice: IdentityChoice): Promise<boolean> {
    const changed = await this.prisma.verificationEvent.updateMany({ where: { id, tenantId, userId }, data: { identityChoice: choice } });
    return changed.count > 0;
  }

  async listForMember(tenantId: string, memberId: string, limit: number): Promise<VerificationEventRecord[]> {
    const rows = await this.prisma.verificationEvent.findMany({ where: { tenantId, memberId }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((r) => ({
      id: r.id,
      memberId: r.memberId,
      channel: r.channel as VerificationChannel,
      userId: r.userId,
      result: r.result as VerificationResult,
      identityChoice: r.identityChoice as IdentityChoice,
      createdAt: r.createdAt,
    }));
  }
}
