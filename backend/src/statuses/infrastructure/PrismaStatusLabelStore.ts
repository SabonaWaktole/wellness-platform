import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IStatusLabelStore } from '../application/ports/IStatusLabelStore';
import { StatusDomain } from '../domain/StatusCatalogue';
import { StatusLabel } from '../domain/StatusLabel';

const toDomain = (row: { domain: string; key: string; labelSq: string; labelEn: string | null; colour: string; order: number }): StatusLabel => ({
  domain: row.domain as StatusDomain,
  key: row.key,
  labelSq: row.labelSq,
  labelEn: row.labelEn,
  colour: row.colour,
  order: row.order,
});

export class PrismaStatusLabelStore implements IStatusLabelStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async list(tenantId: string, domain: StatusDomain): Promise<StatusLabel[]> {
    const rows = await this.prisma.statusLabel.findMany({ where: { tenantId, domain } });
    return rows.map(toDomain);
  }

  async find(tenantId: string, domain: StatusDomain, key: string): Promise<StatusLabel | null> {
    const row = await this.prisma.statusLabel.findUnique({ where: { tenantId_domain_key: { tenantId, domain, key } } });
    return row ? toDomain(row) : null;
  }
}
