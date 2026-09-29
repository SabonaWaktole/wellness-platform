import { PrismaClient, Prisma } from '@prisma/client';
import { IClientRepository, SearchClientsFilters, ClientRelatedCounts, FindClientOptions } from '../../domain/repositories/IClientRepository';
import { RecordScope, admits, ALL_RECORDS } from '../../../access/domain/RecordScope';
import { ownerSql, ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import { Client } from '../../domain/entities/Client';
import { FieldRole } from '../../domain/enums/FieldRole';
import { insensitiveContains, insensitiveEquals } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';
import { IS_MYSQL } from '../../../shared/infrastructure/prisma/provider';
import { TaxIdTakenError } from '../../domain/errors';

/** Legacy Client column each role mirrors into — see backfillLegacyBasicFields. */
const LEGACY_COLUMN_BY_ROLE: Record<FieldRole, string> = {
  [FieldRole.PRIMARY_NAME]: 'name',
  [FieldRole.PRIMARY_EMAIL]: 'email',
  [FieldRole.PRIMARY_PHONE]: 'phone',
  [FieldRole.STATUS]: 'status',
  [FieldRole.ASSIGNEE]: 'assignedUserId',
};

export class PrismaClientRepository implements IClientRepository {
  constructor(private prisma: PrismaClient) {}

  private mapToDomain(record: any): Client {
    // Note: We bypass strict custom field validation on read from DB 
    // by using Client.reconstitute, assuming data in DB is already valid.
    return Client.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      // Falls back to "Client"/empty when a tenant has deleted the field
      // currently holding this role — see ClientFieldResolver for the
      // canonical version of this fallback (used wherever defs are in scope).
      name: record.name ?? 'Client',
      contactInfo: { email: record.email || undefined, phone: record.phone || undefined },
      status: record.status ?? '',
      assignedUserId: record.assignedUserId,
      customFieldValues: typeof record.customFieldValues === 'string' 
        ? JSON.parse(record.customFieldValues) 
        : record.customFieldValues,
      notes: record.notes ?? null,
      profile: {
        businessTypeId: record.businessTypeId ?? null,
        employeeCount: record.employeeCount ?? null,
        areaId: record.areaId ?? null,
        cityId: record.cityId ?? null,
        streetAddress: record.streetAddress ?? null,
        taxId: record.taxId ?? null,
        website: record.website ?? null,
      },
      lastUpdatedByUserId: record.lastUpdatedByUserId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt ?? null,
    });
  }

  async findById(tenantId: string, id: string, options?: FindClientOptions): Promise<Client | null> {
    const record = await this.prisma.client.findUnique({ where: { id } });
    if (!record || record.tenantId !== tenantId) return null;
    // Archived clients read as "not found" everywhere except the archive and
    // restore paths, which opt in explicitly.
    if (record.deletedAt && !options?.includeArchived) return null;
    // A single row by primary key: checking its owner here is the same as a
    // WHERE on it, and keeps the unique lookup.
    if (!admits(options?.scope ?? ALL_RECORDS, record.assignedUserId)) return null;
    return this.mapToDomain(record);
  }

  async search(tenantId: string, filters: SearchClientsFilters, skip: number, take: number): Promise<{ items: Client[]; total: number }> {
    const scope = filters.scope ?? ALL_RECORDS;
    if (filters.customFields && Object.keys(filters.customFields).length > 0) {
      // Use raw query for custom field containment
      const customFieldsJson = JSON.stringify(filters.customFields);

      // NOTE: these conditions must stay in step with the Prisma branch below.
      // The two paths diverge only on custom-field containment, so a filter
      // added to one and not the other silently changes search behaviour
      // depending on whether a custom-field filter happens to be active.
      const like = (value: string) => `%${value}%`;

      // The two dialects diverge on more than just syntax sugar here: MySQL
      // has no ILIKE (its default utf8mb4_unicode_ci collation makes LIKE
      // case-insensitive already), no double-quoted identifiers (backticks
      // instead), and no `@>` jsonb-containment operator (JSON_CONTAINS
      // instead — same "every key/value on the right appears on the left"
      // semantics for object arguments).
      const whereClause = IS_MYSQL
        ? Prisma.sql`
            WHERE \`tenantId\` = ${tenantId}
            ${filters.archived ? Prisma.sql`AND \`deletedAt\` IS NOT NULL` : Prisma.sql`AND \`deletedAt\` IS NULL`}
            ${filters.search ? Prisma.sql`AND (name LIKE ${like(filters.search)} OR email LIKE ${like(filters.search)} OR phone LIKE ${like(filters.search)})` : Prisma.empty}
            ${filters.name ? Prisma.sql`AND name LIKE ${like(filters.name)}` : Prisma.empty}
            ${filters.email ? Prisma.sql`AND email LIKE ${like(filters.email)}` : Prisma.empty}
            ${filters.phone ? Prisma.sql`AND phone LIKE ${like(filters.phone)}` : Prisma.empty}
            ${filters.status ? Prisma.sql`AND status = ${filters.status}` : Prisma.empty}
            ${filters.assignedUserId ? Prisma.sql`AND \`assignedUserId\` = ${filters.assignedUserId}` : Prisma.empty}
            ${filters.businessTypeId ? Prisma.sql`AND \`businessTypeId\` = ${filters.businessTypeId}` : Prisma.empty}
            ${filters.areaId ? Prisma.sql`AND \`areaId\` = ${filters.areaId}` : Prisma.empty}
            ${filters.cityId ? Prisma.sql`AND \`cityId\` = ${filters.cityId}` : Prisma.empty}
            ${filters.riskLevelId ? Prisma.sql`AND \`businessTypeId\` IN (SELECT id FROM \`BusinessType\` WHERE \`riskLevelId\` = ${filters.riskLevelId})` : Prisma.empty}
            ${ownerSql(scope, Prisma.raw('`assignedUserId`'))}
            AND JSON_CONTAINS(\`customFieldValues\`, CAST(${customFieldsJson} AS JSON))
          `
        // A NULL email/phone yields NULL from ILIKE rather than false, so a
        // client with no email simply does not match on that column — while
        // still matching on name via the OR.
        : Prisma.sql`
            WHERE "tenantId" = ${tenantId}
            ${filters.archived ? Prisma.sql`AND "deletedAt" IS NOT NULL` : Prisma.sql`AND "deletedAt" IS NULL`}
            ${filters.search ? Prisma.sql`AND (name ILIKE ${like(filters.search)} OR email ILIKE ${like(filters.search)} OR phone ILIKE ${like(filters.search)})` : Prisma.empty}
            ${filters.name ? Prisma.sql`AND name ILIKE ${like(filters.name)}` : Prisma.empty}
            ${filters.email ? Prisma.sql`AND email ILIKE ${like(filters.email)}` : Prisma.empty}
            ${filters.phone ? Prisma.sql`AND phone ILIKE ${like(filters.phone)}` : Prisma.empty}
            ${filters.status ? Prisma.sql`AND status = ${filters.status}` : Prisma.empty}
            ${filters.assignedUserId ? Prisma.sql`AND "assignedUserId" = ${filters.assignedUserId}` : Prisma.empty}
            ${filters.businessTypeId ? Prisma.sql`AND "businessTypeId" = ${filters.businessTypeId}` : Prisma.empty}
            ${filters.areaId ? Prisma.sql`AND "areaId" = ${filters.areaId}` : Prisma.empty}
            ${filters.cityId ? Prisma.sql`AND "cityId" = ${filters.cityId}` : Prisma.empty}
            ${filters.riskLevelId ? Prisma.sql`AND "businessTypeId" IN (SELECT id FROM "BusinessType" WHERE "riskLevelId" = ${filters.riskLevelId})` : Prisma.empty}
            ${ownerSql(scope, Prisma.raw('"assignedUserId"'))}
            AND "customFieldValues" @> ${customFieldsJson}::jsonb
          `;

      const [table, createdAt] = IS_MYSQL ? ['`Client`', '`createdAt`'] : ['"Client"', '"createdAt"'];

      const rawQuery = Prisma.sql`
        SELECT * FROM ${Prisma.raw(table)}
        ${whereClause}
        ORDER BY ${Prisma.raw(createdAt)} DESC
        LIMIT ${take} OFFSET ${skip}
      `;

      // `::int` rather than a bare COUNT(*): Postgres returns bigint, which
      // arrives as a JS BigInt that JSON.stringify refuses to serialise. The
      // Number() below is a second guard on the same hazard, and covers
      // MySQL's own COUNT(*) BigInt the same way.
      const countQuery = IS_MYSQL
        ? Prisma.sql`SELECT COUNT(*) as total FROM ${Prisma.raw(table)} ${whereClause}`
        : Prisma.sql`SELECT COUNT(*)::int as total FROM ${Prisma.raw(table)} ${whereClause}`;

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
      where.deletedAt = filters.archived ? { not: null } : null;
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
      if (filters.businessTypeId) where.businessTypeId = filters.businessTypeId;
      if (filters.areaId) where.areaId = filters.areaId;
      if (filters.cityId) where.cityId = filters.cityId;
      if (filters.riskLevelId) where.businessType = { riskLevelId: filters.riskLevelId };
      // Its own AND entry: the scope may carry an OR of its own, beside search's.
      where.AND = [ownerWhere(scope, 'assignedUserId')];

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
    const where: Prisma.ClientWhereInput = { tenantId, deletedAt: null };
    if (createdBefore) {
      where.createdAt = { lt: createdBefore };
    }
    return this.prisma.client.count({ where });
  }

  async findRecentByTenant(tenantId: string, limit: number, scope: RecordScope = ALL_RECORDS): Promise<Client[]> {
    const where: Prisma.ClientWhereInput = { tenantId, deletedAt: null, AND: [ownerWhere(scope, 'assignedUserId')] };
    const records = await this.prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map(r => this.mapToDomain(r));
  }

  async save(tenantId: string, client: Client): Promise<void> {
    try {
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
          notes: client.notes,
          ...profileColumns(client),
          lastUpdatedByUserId: client.lastUpdatedByUserId,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
        },
      });
    } catch (error) {
      throw mapTaxIdViolation(error);
    }
  }

  async countByName(tenantId: string, name: string, excludeId?: string): Promise<number> {
    return this.prisma.client.count({
      where: {
        tenantId,
        deletedAt: null,
        name: insensitiveEquals(name),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findByTaxId(tenantId: string, taxId: string, excludeId?: string): Promise<Client | null> {
    const record = await this.prisma.client.findFirst({
      where: { tenantId, taxId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async backfillLegacyBasicFields(tenantId: string, fieldNameByRole: Partial<Record<FieldRole, string>>): Promise<void> {
    const entries = Object.entries(fieldNameByRole) as [FieldRole, string][];
    if (entries.length === 0) return;

    if (IS_MYSQL) {
      // Each JSON_SET path/value pair is a bound parameter, not a raw
      // fragment — the field name goes in as a value, not spliced into SQL.
      const setArgs = entries.flatMap(([role, fieldName]) => {
        const column = LEGACY_COLUMN_BY_ROLE[role];
        return [
          Prisma.sql`CONCAT('$."', ${fieldName}, '"')`,
          Prisma.raw(`\`${column}\``),
        ];
      });
      const joined = Prisma.join(setArgs, ', ');
      await this.prisma.$executeRaw`
        UPDATE \`Client\`
        SET \`customFieldValues\` = JSON_SET(\`customFieldValues\`, ${joined})
        WHERE \`tenantId\` = ${tenantId}
      `;
    } else {
      const pairs = entries.map(([role, fieldName]) => {
        const column = LEGACY_COLUMN_BY_ROLE[role];
        return Prisma.sql`${fieldName}, to_jsonb(${Prisma.raw(`"${column}"`)})`;
      });
      const joined = Prisma.join(pairs, ', ');
      await this.prisma.$executeRaw`
        UPDATE "Client"
        SET "customFieldValues" = "customFieldValues" || jsonb_strip_nulls(jsonb_build_object(${joined}))
        WHERE "tenantId" = ${tenantId}
      `;
    }
  }

  async renameCustomFieldKey(tenantId: string, from: string, to: string): Promise<void> {
    if (from === to) return;

    if (IS_MYSQL) {
      // JSON_REMOVE after JSON_SET rather than a single rename primitive —
      // MySQL's JSON functions have no "rename key", so this is copy-then-drop
      // in one statement. Only rows that actually have the old key are
      // touched: the WHERE clause is what keeps clients who never set this
      // field untouched rather than growing a null entry under the new name.
      await this.prisma.$executeRaw`
        UPDATE \`Client\`
        SET \`customFieldValues\` = JSON_REMOVE(
          JSON_SET(\`customFieldValues\`, CONCAT('$."', ${to}, '"'), JSON_EXTRACT(\`customFieldValues\`, CONCAT('$."', ${from}, '"'))),
          CONCAT('$."', ${from}, '"')
        )
        WHERE \`tenantId\` = ${tenantId}
          AND JSON_CONTAINS_PATH(\`customFieldValues\`, 'one', CONCAT('$."', ${from}, '"'))
      `;
    } else {
      // `-` removes a jsonb key; `||` merges the renamed pair back in. Scoped by
      // `? from` (the jsonb "has key" operator) so a client without this field
      // set is never touched.
      await this.prisma.$executeRaw`
        UPDATE "Client"
        SET "customFieldValues" = ("customFieldValues" - ${from})
          || jsonb_build_object(${to}, "customFieldValues" -> ${from})
        WHERE "tenantId" = ${tenantId}
          AND "customFieldValues" ? ${from}
      `;
    }
  }

  async update(tenantId: string, client: Client): Promise<void> {
    try {
      await this.prisma.client.update({
        where: { id: client.id },
        data: {
          name: client.name,
          email: client.contactInfo.email,
          phone: client.contactInfo.phone,
          status: client.status,
          assignedUserId: client.assignedUserId,
          customFieldValues: client.customFieldValues,
          notes: client.notes,
          ...profileColumns(client),
          lastUpdatedByUserId: client.lastUpdatedByUserId,
          updatedAt: client.updatedAt,
        },
      });
    } catch (error) {
      throw mapTaxIdViolation(error);
    }
  }

  async archive(tenantId: string, id: string, archivedByUserId: string): Promise<void> {
    // updateMany, not update: the tenantId lives in the WHERE clause, so a
    // client belonging to another workspace matches zero rows instead of
    // being archived.
    await this.prisma.client.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), lastUpdatedByUserId: archivedByUserId },
    });
  }

  async restore(tenantId: string, id: string, restoredByUserId: string): Promise<void> {
    await this.prisma.client.updateMany({
      where: { id, tenantId, deletedAt: { not: null } },
      data: { deletedAt: null, lastUpdatedByUserId: restoredByUserId },
    });
  }

  async countRelatedRecords(tenantId: string, id: string): Promise<ClientRelatedCounts> {
    const [interactions, appointments, quotations, invoices] = await Promise.all([
      this.prisma.interaction.count({ where: { tenantId, clientId: id } }),
      this.prisma.appointment.count({ where: { tenantId, clientId: id } }),
      this.prisma.quotation.count({ where: { tenantId, clientId: id } }),
      this.prisma.invoice.count({ where: { tenantId, clientId: id } }),
    ]);
    return { interactions, appointments, quotations, invoices };
  }
}

/** The Slice 11 profile columns, from whatever `client.profile` currently holds (possibly all null). */
function profileColumns(client: Client) {
  const profile = client.profile;
  return {
    businessTypeId: profile?.businessTypeId ?? null,
    employeeCount: profile?.employeeCount ?? null,
    areaId: profile?.areaId ?? null,
    cityId: profile?.cityId ?? null,
    streetAddress: profile?.streetAddress ?? null,
    taxId: profile?.taxId ?? null,
    website: profile?.website ?? null,
  };
}

/** `@@unique([tenantId, taxId])` violated concurrently with the use case's own check. */
function mapTaxIdViolation(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    // `target` is an array of column names on Postgres, or the index name as
    // a string on MySQL (e.g. "Client_tenantId_taxId_key") — `includes`
    // matches either shape, since it means "has this element" on an array
    // and "contains this substring" on a string.
    const target = (error.meta?.target as string[] | string | undefined) ?? '';
    if (target.includes('taxId')) {
      return new TaxIdTakenError();
    }
  }
  return error;
}
