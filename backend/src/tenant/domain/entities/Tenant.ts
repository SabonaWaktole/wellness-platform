/**
 * Localization values the tenant can hold.
 *
 * `currency` and `timezone` are validated at the API boundary against
 * `Intl.supportedValuesOf`, so an accepted value is by construction one the
 * formatter can render. `dateFormat` is our own closed set because there is no
 * external standard to defer to — each value must map to a formatter we write.
 *
 * See settingsSchemas.ts for the checks themselves.
 */
// 'DD.MM.YYYY' is the Albanian convention and Wellness Albania's workspace
// default (FR-LNG-04). Mirrored in the frontend's utils/dateFormatPattern.ts.
export const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/**
 * Formatting locales we actually support, as opposed to every tag `Intl` will
 * parse. Kept deliberately small and honest: this is a BCP-47 tag used for
 * number and date *conventions* (separators, ordering), which is a different
 * concern from UI translation language.
 *
 * `sq-AL`, `el-GR` and `it-IT` are offered because Albanian, Greek and Italian
 * are shipped UI languages and their users are the most likely to want matching
 * formatting — but the two remain independent. Choosing Greek as an interface
 * language does NOT change formatting, and a tenant may pair any locale with
 * any language.
 */
export const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'sq-AL', 'el-GR', 'it-IT'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Interface languages, as opposed to formatting locales above.
 *
 * These are two different axes and must not be merged. `el-GR` is a formatting
 * locale; `el` is a language. A tenant can hold any combination of the two.
 */
export const SUPPORTED_LANGUAGES = ['en', 'sq', 'el', 'it'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

export { SubscriptionStatus } from '../enums/SubscriptionStatus';
import { SubscriptionStatus } from '../enums/SubscriptionStatus';

export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_LOCALE: SupportedLocale = 'en-US';
export const DEFAULT_TIMEZONE = 'UTC';
export const DEFAULT_DATE_FORMAT: DateFormat = 'MM/DD/YYYY';

interface TenantProps {
  id: string;
  name: string;
  urlSlug: string;
  requiresQuotationApproval?: boolean;
  currency?: string;
  locale?: string;
  timezone?: string;
  dateFormat?: string;
  defaultLanguage?: string;
  subscriptionStatus?: SubscriptionStatus;
  createdAt: Date;
}

export class Tenant {
  public readonly id: string;
  public readonly name: string;
  public readonly urlSlug: string;
  public readonly requiresQuotationApproval: boolean;

  /**
   * Localization lives on the entity because it drives behaviour rather than
   * being merely displayed — the money formatter reads both `locale` and
   * `currency`. The company profile fields (address, contact details) are
   * deliberately NOT here: they are presentation-only, and follow the
   * logoUrl/coverImageUrl precedent of being read straight from Prisma.
   */
  public readonly currency: string;
  public readonly locale: string;
  public readonly timezone: string;
  public readonly dateFormat: string;

  /**
   * The workspace's interface language. Independent of `locale` above — that is
   * how values are formatted, this is what language the words are in.
   */
  public readonly defaultLanguage: string;

  /**
   * Whether the workspace may operate. Behaviour-bearing like the localization
   * fields above, not presentation: it is the value `LoginUseCase` and
   * `resolveTenant` read to decide whether to let anyone in at all.
   */
  public readonly subscriptionStatus: SubscriptionStatus;

  public readonly createdAt: Date;

  private constructor(props: TenantProps) {
    this.id = props.id;
    this.name = props.name;
    this.urlSlug = props.urlSlug;
    this.requiresQuotationApproval = props.requiresQuotationApproval ?? true;
    // These mirror the column defaults. A tenant constructed in memory before
    // it has ever been persisted still formats money correctly.
    this.currency = props.currency ?? DEFAULT_CURRENCY;
    this.locale = props.locale ?? DEFAULT_LOCALE;
    this.timezone = props.timezone ?? DEFAULT_TIMEZONE;
    this.dateFormat = props.dateFormat ?? DEFAULT_DATE_FORMAT;
    this.defaultLanguage = props.defaultLanguage ?? DEFAULT_LANGUAGE;
    // Mirrors the column default. A tenant constructed in memory is ACTIVE, so
    // no code path can accidentally treat "not stated" as suspended.
    this.subscriptionStatus = props.subscriptionStatus ?? SubscriptionStatus.ACTIVE;
    this.createdAt = props.createdAt;
  }

  public static create(props: TenantProps): Tenant {
    return new Tenant(props);
  }

  /**
   * The single expression of "this workspace is cut off".
   *
   * Read by `LoginUseCase`, `resolveTenant` and `getMe`. Having one predicate
   * rather than three separate `=== 'SUSPENDED'` comparisons means adding a
   * future status (PAST_DUE, TRIAL_EXPIRED) is one edit here, not a hunt for
   * every site that compared against a literal.
   */
  public isSuspended(): boolean {
    return this.subscriptionStatus === SubscriptionStatus.SUSPENDED;
  }
}
