import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';

/**
 * The tenant's company profile: address, contact details, registration number,
 * and the branding URLs.
 *
 * These are presentation-only strings with no domain behaviour, so they are
 * read and written directly through Prisma rather than being threaded through
 * the Tenant entity — the same reasoning that already kept logoUrl and
 * coverImageUrl off it. This type exists so that decision is expressed once, in
 * a testable place, instead of as an inline `require('.../prisma/client')`
 * inside a controller method.
 */
export interface TenantProfile {
  registrationNumber: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface TenantBranding {
  logoUrl: string | null;
  coverImageUrl: string | null;
}

const PROFILE_FIELDS = [
  'registrationNumber',
  'addressLine',
  'addressCity',
  'addressState',
  'addressPostalCode',
  'contactEmail',
  'contactPhone',
] as const;

export class TenantProfileStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async get(tenantId: string): Promise<(TenantProfile & TenantBranding) | null> {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        registrationNumber: true,
        addressLine: true,
        addressCity: true,
        addressState: true,
        addressPostalCode: true,
        contactEmail: true,
        contactPhone: true,
        logoUrl: true,
        coverImageUrl: true,
      },
    });
  }

  /**
   * Writes only the keys present, so an absent field is left untouched rather
   * than being nulled out — the same partial-update guarantee the domain
   * repository gives for the localization fields.
   */
  async update(tenantId: string, profile: Partial<TenantProfile>): Promise<void> {
    const data: Partial<TenantProfile> = {};
    for (const field of PROFILE_FIELDS) {
      if (profile[field] !== undefined) data[field] = profile[field] ?? null;
    }

    if (Object.keys(data).length === 0) return;

    await this.prisma.tenant.update({ where: { id: tenantId }, data });
  }
}
