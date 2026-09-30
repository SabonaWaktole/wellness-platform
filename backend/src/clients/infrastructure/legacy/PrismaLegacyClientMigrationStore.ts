import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import {
  AppliedClientChange,
  ILegacyClientMigrationStore,
  LegacyMigrationClientRow,
  LegacyMigrationTenantContext,
} from '../../application/ports/ILegacyClientMigrationStore';
import { CompanyProfileData } from '../../domain/value-objects/CompanyProfile';
import { PlannedContact } from '../../domain/legacy/LegacyClientPlan';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { FieldRole } from '../../domain/enums/FieldRole';
import { jsonToStringArray } from '../../../shared/infrastructure/prisma/jsonArray';
import { PrismaAuditTrail } from '../../../audit/infrastructure/PrismaAuditTrail';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { AuditChange } from '../../../audit/domain/AuditChange';
import { SYSTEM_ACTOR } from '../../../audit/domain/AuditEntry';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/** The company-profile columns the migration is allowed to touch, in a fixed order for stable audit entries. */
const PROFILE_COLUMNS: (keyof CompanyProfileData)[] = [
  'businessTypeId',
  'employeeCount',
  'areaId',
  'cityId',
  'streetAddress',
  'taxId',
  'website',
];

/**
 * Prisma-only persistence for the Slice 14 migration (FR-CMP-08): every
 * write goes through Prisma's query API, never raw SQL, so the same code
 * runs against `schema.prisma` (Postgres) and `schema.mysql.prisma` (MySQL)
 * without a dialect branch.
 */
export class PrismaLegacyClientMigrationStore implements ILegacyClientMigrationStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async loadTenantContext(tenantSlug: string): Promise<LegacyMigrationTenantContext> {
    const tenant = await this.prisma.tenant.findUnique({ where: { urlSlug: tenantSlug } });
    if (!tenant) throw new DomainError(`No tenant found at "${tenantSlug}".`);

    const [fieldDefRows, businessTypes, areas, cities] = await Promise.all([
      this.prisma.customFieldDefinition.findMany({ where: { tenantId: tenant.id } }),
      this.prisma.businessType.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, nameSq: true, nameEn: true, order: true, active: true, riskLevelId: true },
      }),
      this.prisma.area.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, nameSq: true, nameEn: true, order: true, active: true },
      }),
      this.prisma.city.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, nameSq: true, nameEn: true, order: true, active: true, areaId: true },
      }),
    ]);

    const fieldDefs = fieldDefRows.map((r) =>
      CustomFieldDefinition.create({
        id: r.id,
        tenantId: r.tenantId,
        fieldName: r.fieldName,
        fieldType: r.fieldType as FieldType,
        options: jsonToStringArray(r.options),
        order: r.order,
        role: (r.role as FieldRole | null) ?? null,
        required: r.required,
      })
    );

    return { tenantId: tenant.id, fieldDefs, businessTypes, areas, cities };
  }

  async listClients(tenantId: string): Promise<LegacyMigrationClientRow[]> {
    const records = await this.prisma.client.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: {
        contactPersons: { where: { deletedAt: null }, select: { id: true }, take: 1 },
        assignedUser: { select: { email: true } },
      },
    });

    return records.map((r) => ({
      id: r.id,
      name: r.name ?? 'Client',
      email: r.email,
      phone: r.phone,
      customFieldValues:
        typeof r.customFieldValues === 'string' ? JSON.parse(r.customFieldValues) : (r.customFieldValues as Record<string, unknown>),
      profile: {
        businessTypeId: r.businessTypeId,
        employeeCount: r.employeeCount,
        areaId: r.areaId,
        cityId: r.cityId,
        streetAddress: r.streetAddress,
        taxId: r.taxId,
        website: r.website,
      },
      hasLiveContact: r.contactPersons.length > 0,
      archived: r.deletedAt !== null,
      assigneeLabel: r.assignedUser?.email ?? null,
    }));
  }

  async applyClient(
    tenantId: string,
    clientId: string,
    patch: Partial<CompanyProfileData>,
    contact: PlannedContact | null
  ): Promise<AppliedClientChange> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findUnique({ where: { id: clientId }, select: { name: true } });

      const appliedPatch: Partial<CompanyProfileData> = {};
      for (const column of PROFILE_COLUMNS) {
        const value = patch[column];
        if (value === undefined) continue;
        // Guards each column on its own: a field a user has since filled by
        // hand is left untouched, even if the rest of the patch still applies.
        const result = await tx.client.updateMany({
          where: { tenantId, id: clientId, [column]: null },
          data: { [column]: value },
        });
        if (result.count > 0) (appliedPatch as Record<string, unknown>)[column] = value;
      }

      let contactCreatedId: string | null = null;
      if (contact) {
        const liveContacts = await tx.contactPerson.count({ where: { tenantId, clientId, deletedAt: null } });
        if (liveContacts === 0) {
          contactCreatedId = randomUUID();
          await tx.contactPerson.create({
            data: {
              id: contactCreatedId,
              tenantId,
              clientId,
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              isPrimary: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      }

      if (Object.keys(appliedPatch).length > 0 || contactCreatedId) {
        const changes: AuditChange[] = [
          ...Object.entries(appliedPatch).map(([field, value]) => ({ field, old: null, new: value })),
          ...(contactCreatedId ? [{ field: 'contactPerson', old: null, new: contactCreatedId }] : []),
        ];
        await new PrismaAuditTrail(tx as unknown as PrismaClient).record({
          tenantId,
          userId: SYSTEM_ACTOR.userId,
          userRole: SYSTEM_ACTOR.userRole,
          action: AuditAction.Update,
          entityType: 'Client',
          entityId: clientId,
          entityLabel: before?.name ?? null,
          changes,
        });
      }

      return { clientId, profilePatch: appliedPatch, contactCreatedId };
    });
  }

  async revertClient(
    tenantId: string,
    clientId: string,
    patch: Partial<CompanyProfileData>,
    contactCreatedId: string | null
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findUnique({ where: { id: clientId }, select: { name: true } });
      const changes: AuditChange[] = [];

      for (const column of PROFILE_COLUMNS) {
        const value = patch[column];
        if (value === undefined) continue;
        // Only resets the column if it still holds exactly the value this
        // migration wrote — a value a user has since changed is left alone.
        const result = await tx.client.updateMany({
          where: { tenantId, id: clientId, [column]: value as Prisma.InputJsonValue | null },
          data: { [column]: null },
        });
        if (result.count > 0) changes.push({ field: column, old: value, new: null });
      }

      if (contactCreatedId) {
        const deleted = await tx.contactPerson.deleteMany({ where: { tenantId, id: contactCreatedId } });
        if (deleted.count > 0) changes.push({ field: 'contactPerson', old: contactCreatedId, new: null });
      }

      if (changes.length > 0) {
        await new PrismaAuditTrail(tx as unknown as PrismaClient).record({
          tenantId,
          userId: SYSTEM_ACTOR.userId,
          userRole: SYSTEM_ACTOR.userRole,
          action: AuditAction.Update,
          entityType: 'Client',
          entityId: clientId,
          entityLabel: before?.name ?? null,
          changes,
        });
      }
    });
  }
}
