import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { IPlanningLinks } from '../../domain/repositories/IPlanningLinks';

export class PrismaPlanningLinks implements IPlanningLinks {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async dealBelongsToCompany(tenantId: string, clientId: string, dealId: string): Promise<boolean> {
    return (await this.prisma.deal.count({ where: { id: dealId, tenantId, clientId, deletedAt: null } })) > 0;
  }

  async contactBelongsToCompany(tenantId: string, clientId: string, contactPersonId: string): Promise<boolean> {
    return (await this.prisma.contactPerson.count({ where: { id: contactPersonId, tenantId, clientId, deletedAt: null } })) > 0;
  }
}
