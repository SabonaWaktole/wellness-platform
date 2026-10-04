import { Tenant, SalesWorkflow } from '../entities/Tenant';
import { SubscriptionStatus } from '../enums/SubscriptionStatus';

/**
 * The subset of tenant state that settings can change.
 *
 * Deliberately `Partial` and deliberately typed rather than `boolean`: the
 * previous signature took a required `{ requiresQuotationApproval: boolean }`,
 * and the controller fed it `Boolean(req.body.requiresQuotationApproval)`. A
 * request body of `{}` therefore coerced `undefined` to `false` and silently
 * turned quotation approval OFF for the tenant. With a partial, an absent key
 * means "leave it alone" and cannot be confused with "set it to false".
 *
 * The company profile fields (address, contact details, registration number)
 * are absent by design — they are presentation-only and are written through
 * TenantProfileStore, not through the domain repository.
 *
 * `subscriptionStatus` is absent by design too, and for a stronger reason: it
 * is not a setting. A workspace must never be able to un-suspend itself by
 * PATCHing its own settings, so it gets its own platform-level method below
 * rather than riding in on this partial.
 */
export interface TenantSettingsUpdate {
  /** The company's display name. Already NOT NULL, so it can change but never clear. */
  name?: string;
  requiresQuotationApproval?: boolean;
  currency?: string;
  locale?: string;
  timezone?: string;
  dateFormat?: string;
  /** Interface language, not a formatting locale. */
  defaultLanguage?: string;
}

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  create(tenant: Tenant): Promise<Tenant>;
  findAll(skip: number, take: number): Promise<{ items: Tenant[]; total: number }>;
  updateSettings(id: string, settings: TenantSettingsUpdate): Promise<void>;

  /**
   * The platform console's bulk apply: the same fields as `updateSettings`,
   * written to every id in `tenantIds` in one statement.
   *
   * Deliberately `Omit<..., 'name'>` — a company name is that company's
   * identity, not a policy setting, and writing one name across several
   * tenants at once can never be what a caller meant. `TenantSettingsUpdate`
   * stays the single source of truth for which fields are settings at all;
   * this only narrows it, rather than declaring its own separate list that
   * could drift from `updateSettings`'s.
   *
   * Returns the number of rows actually changed, so a caller who asked for 5
   * tenants but got back 3 (some ids stale, or already at these exact values —
   * Prisma's `updateMany` count reflects the WHERE match, not "value changed")
   * can surface that rather than reporting silent success.
   */
  updateSettingsForMany(
    tenantIds: string[],
    settings: Omit<TenantSettingsUpdate, 'name'>
  ): Promise<number>;

  /**
   * Platform-level: set whether the workspace may operate.
   *
   * Separate from `updateSettings` because it is not a tenant-editable setting
   * — only SUPER_ADMIN reaches it, through /api/tenants. Writing the same value
   * twice is a no-op at the database level, which is what makes the suspend and
   * reactivate endpoints idempotent for free.
   */
  setSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<void>;

  /**
   * Platform-level: which quotation workflow the workspace runs (D6). Not a
   * tenant-editable setting: it is set when the Wellness Albania workspace is
   * provisioned, and by migration for the one that already exists.
   */
  setSalesWorkflow(id: string, workflow: SalesWorkflow): Promise<void>;
}
