import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { IAuditTrail } from '../application/ports/IAuditTrail';
import { AuditEntry } from '../domain/AuditEntry';

/**
 * Writes AuditEntry rows and nothing else — no `update`, no `delete`, on this
 * class or anywhere else in the codebase (FR-AUD-05). Constructed on the same
 * `tx` a business write is using, so its `create` commits or rolls back with
 * that write (FR-AUD-04); see `PrismaContractWriteTransaction` for how a
 * write-transaction port builds one.
 */
export class PrismaAuditTrail implements IAuditTrail {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditEntry.create({
      data: {
        id: randomUUID(),
        tenantId: entry.tenantId,
        userId: entry.userId,
        userRole: entry.userRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityLabel: entry.entityLabel,
        changes: entry.changes as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
