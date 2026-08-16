import { PrismaClient, Prisma } from '@prisma/client';
import { IClientRepository, SearchClientsFilters } from '../../domain/repositories/IClientRepository';
import { Client } from '../../domain/entities/Client';
import { ClientStatus } from '../../domain/enums/ClientStatus';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';

export class PrismaClientRepository implements IClientRepository {
  constructor(private prisma: PrismaClient) {}

  private mapToDomain(record: any): Client {
    // Note: We bypass strict custom field validation on read from DB 
    // by using Client.reconstitute, assuming data in DB is already valid.
    return Client.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      contactInfo: { email: record.email || undefined, phone: record.phone || undefined },
      status: record.status as ClientStatus,
      assignedUserId: record.assignedUserId,
      customFieldValues: typeof record.customFieldValues === 'string' 
        ? JSON.parse(record.customFieldValues) 
        : record.customFieldValues,
      lastUpdatedByUserId: record.lastUpdatedByUserId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(tenantId: string, id: string): Promise<Client | null> {
    const record = await this.prisma.client.findUnique({ where: { id } });
    if (!record || record.tenantId !== tenantId) return null;
    return this.mapToDomain(record);
  }

  async search(tenantId: string, filters: SearchClientsFilters, skip: number, take: number): Promise<{ items: Client[]; total: number }> {
    if (filters.customFields && Object.keys(filters.customFields).length > 0) {
      // Use raw query for custom field containment
      const customFieldsJson = JSON.stringify(filters.customFields);

      // NOTE: these conditions must stay in step with the Prisma branch below.
      // The two paths diverge only on custom-field containment, so a filter
      // added to one and not the other silently changes search behaviour
      // depending on whether a custom-field filter happens to be active.
      const like = (value: string) => `%${value}%`;

      /*
       * `JSON_CONTAINS(target, candidate)` is the containment test: for object
       * arguments it means "every key/value in candidate appears in target",
       * which is the semantics this filter wants.
       *
       * `LIKE` with no LOWER() on either side: the schema's utf8mb4_unicode_ci
       * collation makes it case-insensitive already — the same reason
       * `insensitiveContains` is a plain pass-through. A NULL email/phone
       * yields NULL from LIKE rather than false, so a client with no email
       * simply does not match on that column while still matching on name via
       * the OR.
       */
      const whereClause = Prisma.sql`
        WHERE \`tenantId\` = ${tenantId}
        ${filters.search ? Prisma.sql`AND (name LIKE ${like(filters.search)} OR email LIKE ${like(filters.search)} OR phone LIKE ${like(filters.search)})` : Prisma.empty}
        ${filters.name ? Prisma.sql`AND name LIKE ${like(filters.name)}` : Prisma.empty}
        ${filters.email ? Prisma.sql`AND email LIKE ${like(filters.email)}` : Prisma.empty}
        ${filters.phone ? Prisma.sql`AND phone LIKE ${like(filters.phone)}` : Prisma.empty}
        ${filters.status ? Prisma.sql`AND status = ${filters.status}` : Prisma.empty}
        ${filters.assignedUserId ? Prisma.sql`AND \`assignedUserId\` = ${filters.assignedUserId}` : Prisma.empty}
        AND JSON_CONTAINS(\`customFieldValues\`, CAST(${customFieldsJson} AS JSON))
      `;

      const rawQuery = Prisma.sql`
        SELECT * FROM \`Client\`
        ${whereClause}
        ORDER BY \`createdAt\` DESC
        LIMIT ${take} OFFSET ${skip}
      `;

      // MySQL's COUNT(*) returns BIGINT, which arrives as a JS BigInt that
      // JSON.stringify refuses to serialise — hence the Number() below.
      const countQuery = Prisma.sql`SELECT COUNT(*) as total FROM \`Client\` ${whereClause}`;

      const [records, countResult] = await Promise.all([
        this.prisma.$queryRaw<any[]>(rawQuery),
        this.prisma.$queryRaw<[{ total: number }]>(countQuery),
      ]);

      return {
        items: records.map(r => this.mapToDomain(r)),
        total: Number(countResult[0]?.total ?? 0),
      };
    } else {
      // Use standard Prisma findMany if no customFields are filtered
      const where: Prisma.ClientWhereInput = { tenantId };

      // Mirrors the raw-SQL branch above — keep both in step.
      if (filters.search) {
        where.OR = [
          { name: insensitiveContains(filters.search) },
          { email: insensitiveContains(filters.search) },
          { phone: insensitiveContains(filters.search) },
        ];
      }
      if (filters.name) where.name = insensitiveContains(filters.name);
      if (filters.email) where.email = insensitiveContains(filters.email);
      if (filters.phone) where.phone = insensitiveContains(filters.phone);
      if (filters.status) where.status = filters.status;
      if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;

      const [records, total] = await Promise.all([
        this.prisma.client.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        this.prisma.client.count({ where })
      ]);

      return {
        items: records.map(r => this.mapToDomain(r)),
        total,
      };
    }
  }

  async countByTenant(tenantId: string, createdBefore?: Date): Promise<number> {
    const where: Prisma.ClientWhereInput = { tenantId };
    if (createdBefore) {
      where.createdAt = { lt: createdBefore };
    }
    return this.prisma.client.count({ where });
  }

  async findRecentByTenant(tenantId: string, limit: number, assignedUserId?: string): Promise<Client[]> {
    const where: Prisma.ClientWhereInput = { tenantId };
    if (assignedUserId) {
      where.assignedUserId = assignedUserId;
    }
    const records = await this.prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map(r => this.mapToDomain(r));
  }

  async save(tenantId: string, client: Client): Promise<void> {
    await this.prisma.client.create({
      data: {
        id: client.id,
        tenantId: client.tenantId,
        name: client.name,
        email: client.contactInfo.email,
        phone: client.contactInfo.phone,
        status: client.status,
        assignedUserId: client.assignedUserId,
        customFieldValues: client.customFieldValues,
        lastUpdatedByUserId: client.lastUpdatedByUserId,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      },
    });
  }

  async update(tenantId: string, client: Client): Promise<void> {
    await this.prisma.client.update({
      where: { id: client.id },
      data: {
        name: client.name,
        email: client.contactInfo.email,
        phone: client.contactInfo.phone,
        status: client.status,
        assignedUserId: client.assignedUserId,
        customFieldValues: client.customFieldValues,
        lastUpdatedByUserId: client.lastUpdatedByUserId,
        updatedAt: client.updatedAt,
      },
    });
  }
}
