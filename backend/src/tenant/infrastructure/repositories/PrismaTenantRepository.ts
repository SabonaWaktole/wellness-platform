import { PrismaClient } from '@prisma/client';
import { ITenantRepository, TenantSettingsUpdate } from '../../domain/repositories/ITenantRepository';
import { Tenant } from '../../domain/entities/Tenant';
import { SubscriptionStatus } from '../../domain/enums/SubscriptionStatus';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';

/**
 * Every mapping goes through this one function so a new column cannot be
 * remembered in `findBySlug` and forgotten in `findAll` — which is exactly how
 * `requiresQuotationApproval` ended up being read inconsistently before.
 */
const toDomain = (data: {
  id: string;
  name: string;
  urlSlug: string;
  requiresQuotationApproval: boolean;
  currency: string;
  locale: string;
  timezone: string;
  dateFormat: string;
  defaultLanguage: string;
  subscriptionStatus: SubscriptionStatus;
  salesWorkflow: string;
  createdAt: Date;
}): Tenant =>
  Tenant.create({
    id: data.id,
    name: data.name,
    urlSlug: data.urlSlug,
    requiresQuotationApproval: data.requiresQuotationApproval,
    currency: data.currency,
    locale: data.locale,
    timezone: data.timezone,
    dateFormat: data.dateFormat,
    defaultLanguage: data.defaultLanguage,
    subscriptionStatus: data.subscriptionStatus,
    salesWorkflow: data.salesWorkflow,
    createdAt: data.createdAt,
  });

export class PrismaTenantRepository implements ITenantRepository {
  /**
   * The client is injected so this repository can be constructed bound to a
   * transaction client. Defaulting to the global one keeps every existing
   * `new PrismaTenantRepository()` call site working unchanged.
   *
   * Before this, the global client was imported at module scope, which made it
   * impossible for any wrapper to enrol this repository in a transaction —
   * the exact reason `PrismaUnitOfWork` could never have worked. See
   * ITenantProvisioningTransaction.
   */
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findById(id: string): Promise<Tenant | null> {
    const data = await this.prisma.tenant.findUnique({ where: { id } });
    return data ? toDomain(data) : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const data = await this.prisma.tenant.findUnique({ where: { urlSlug: slug } });
    return data ? toDomain(data) : null;
  }

  async create(tenant: Tenant): Promise<Tenant> {
    await this.prisma.tenant.create({
      data: {
        id: tenant.id,
        name: tenant.name,
        urlSlug: tenant.urlSlug,
        requiresQuotationApproval: tenant.requiresQuotationApproval,
        currency: tenant.currency,
        locale: tenant.locale,
        timezone: tenant.timezone,
        dateFormat: tenant.dateFormat,
        defaultLanguage: tenant.defaultLanguage,
        subscriptionStatus: tenant.subscriptionStatus,
        createdAt: tenant.createdAt,
      },
    });
    return tenant;
  }

  /**
   * Returns EVERY tenant, suspended ones included, and deliberately so: this
   * backs the Super Admin console, whose whole purpose is seeing and acting on
   * suspended workspaces. Filtering here would hide exactly the rows the
   * operator needs.
   */
  async findAll(skip: number, take: number): Promise<{ items: Tenant[]; total: number }> {
    const [records, total] = await Promise.all([
      this.prisma.tenant.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.tenant.count(),
    ]);

    return { items: records.map(toDomain), total };
  }

  /**
   * Only the keys actually present are written. Passing `{}` updates nothing,
   * rather than coercing absent fields to `false`/empty.
   */
  async updateSettings(id: string, settings: TenantSettingsUpdate): Promise<void> {
    const data: TenantSettingsUpdate = {};
    if (settings.name !== undefined) data.name = settings.name;
    if (settings.requiresQuotationApproval !== undefined) {
      data.requiresQuotationApproval = settings.requiresQuotationApproval;
    }
    if (settings.currency !== undefined) data.currency = settings.currency;
    if (settings.locale !== undefined) data.locale = settings.locale;
    if (settings.timezone !== undefined) data.timezone = settings.timezone;
    if (settings.dateFormat !== undefined) data.dateFormat = settings.dateFormat;
    if (settings.defaultLanguage !== undefined) data.defaultLanguage = settings.defaultLanguage;

    if (Object.keys(data).length === 0) return;

    await this.prisma.tenant.update({ where: { id }, data });
  }

  async updateSettingsForMany(
    tenantIds: string[],
    settings: Omit<TenantSettingsUpdate, 'name'>
  ): Promise<number> {
    const data: Omit<TenantSettingsUpdate, 'name'> = {};
    if (settings.requiresQuotationApproval !== undefined) {
      data.requiresQuotationApproval = settings.requiresQuotationApproval;
    }
    if (settings.currency !== undefined) data.currency = settings.currency;
    if (settings.locale !== undefined) data.locale = settings.locale;
    if (settings.timezone !== undefined) data.timezone = settings.timezone;
    if (settings.dateFormat !== undefined) data.dateFormat = settings.dateFormat;
    if (settings.defaultLanguage !== undefined) data.defaultLanguage = settings.defaultLanguage;

    if (Object.keys(data).length === 0 || tenantIds.length === 0) return 0;

    // One UPDATE ... WHERE id IN (...) statement — atomic by construction, with
    // no explicit transaction wrapper needed. Either every matched row gets the
    // new values or (on a DB-level failure) none do.
    const result = await this.prisma.tenant.updateMany({
      where: { id: { in: tenantIds } },
      data,
    });
    return result.count;
  }

  async setSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<void> {
    await this.prisma.tenant.update({ where: { id }, data: { subscriptionStatus: status } });
  }
}
