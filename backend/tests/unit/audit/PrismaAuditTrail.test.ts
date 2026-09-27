import { PrismaAuditTrail } from '../../../src/audit/infrastructure/PrismaAuditTrail';
import { AuditAction } from '../../../src/audit/domain/AuditAction';

describe('PrismaAuditTrail', () => {
  it('FR-AUD-01 creates one row with the entry mapped onto AuditEntry columns', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const prisma = { auditEntry: { create } } as any;
    const trail = new PrismaAuditTrail(prisma);

    await trail.record({
      tenantId: 'tenant-1',
      userId: 'user-1',
      userRole: 'ADMINISTRATOR',
      action: AuditAction.Update,
      entityType: 'Contract',
      entityId: 'contract-1',
      entityLabel: 'Acme — Gold',
      changes: [{ field: 'amount', old: 100, new: 200 }],
    });

    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0];
    expect(data).toMatchObject({
      tenantId: 'tenant-1',
      userId: 'user-1',
      userRole: 'ADMINISTRATOR',
      action: 'UPDATE',
      entityType: 'Contract',
      entityId: 'contract-1',
      entityLabel: 'Acme — Gold',
      changes: [{ field: 'amount', old: 100, new: 200 }],
    });
    expect(typeof data.id).toBe('string');
    expect(data.id.length).toBeGreaterThan(0);
  });

  it('FR-AUD-05 exposes no way to update or delete a written entry', () => {
    const trail = new PrismaAuditTrail({} as any);
    expect((trail as unknown as { update?: unknown }).update).toBeUndefined();
    expect((trail as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
