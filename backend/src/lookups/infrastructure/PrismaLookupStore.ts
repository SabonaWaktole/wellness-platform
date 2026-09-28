import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ILookupStore } from '../application/ports/ILookupStore';
import { LookupList } from '../domain/LookupList';
import { LookupRecord } from '../domain/LookupItem';
import { lookupDelegate, selectFor } from './prismaLookupTables';

export class PrismaLookupStore implements ILookupStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async list(tenantId: string, list: LookupList, filter: Record<string, string> = {}): Promise<LookupRecord[]> {
    return lookupDelegate(this.prisma, list).findMany({ where: { tenantId, ...filter }, select: selectFor(list) });
  }

  async findById(tenantId: string, list: LookupList, id: string): Promise<LookupRecord | null> {
    return lookupDelegate(this.prisma, list).findFirst({ where: { id, tenantId }, select: selectFor(list) });
  }
}
