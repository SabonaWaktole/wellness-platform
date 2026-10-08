import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import type { IRelationshipStore, RelationshipRecord } from '../application/ports/IMembershipSettingsStore';

const toRecord = (row: RelationshipRecord & { tenantId?: string }): RelationshipRecord => ({
  id: row.id,
  nameSq: row.nameSq,
  nameEn: row.nameEn,
  order: row.order,
  active: row.active,
});

export class PrismaRelationshipStore implements IRelationshipStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async list(tenantId: string): Promise<RelationshipRecord[]> {
    const rows = await this.prisma.familyRelationship.findMany({ where: { tenantId }, orderBy: [{ order: 'asc' }, { nameEn: 'asc' }] });
    return rows.map(toRecord);
  }

  async find(tenantId: string, id: string): Promise<RelationshipRecord | null> {
    const row = await this.prisma.familyRelationship.findFirst({ where: { id, tenantId } });
    return row ? toRecord(row) : null;
  }

  async create(tenantId: string, values: Omit<RelationshipRecord, 'id'>): Promise<RelationshipRecord> {
    const row = await this.prisma.familyRelationship.create({ data: { id: randomUUID(), tenantId, ...values } });
    return toRecord(row);
  }

  async update(tenantId: string, record: RelationshipRecord): Promise<void> {
    await this.prisma.familyRelationship.updateMany({
      where: { id: record.id, tenantId },
      data: { nameSq: record.nameSq, nameEn: record.nameEn, order: record.order, active: record.active },
    });
  }
}
