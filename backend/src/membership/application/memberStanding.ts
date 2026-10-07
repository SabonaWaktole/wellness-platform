import { dayKeyInZone } from '../../shared/domain/time/tenantDay';
import { effectiveTierOn, validTermsOn, type MemberTermValue } from '../domain/MemberTerm';
import { validityOn } from '../domain/memberValidity';
import type { Tier } from '../domain/Tier';
import type { IMemberPaymentStore } from './ports/IMemberPaymentStore';
import type { IMemberStore, MemberRecord } from './ports/IMemberStore';
import type { IBenefitStore, IMembershipSettingsStore } from './ports/IMembershipSettingsStore';
import { SponsorValidity } from './SponsorValidity';

const day = (date: Date): string => date.toISOString().slice(0, 10);
const dayDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export interface MemberStanding {
  valid: boolean;
  /** Why a member is not valid; the tier is never a reason (FR-MEM-06). */
  reason: 'SUSPENDED' | 'CLOSED' | null;
  tier: Tier;
  tierLabel: { tier: Tier; labelSq: string; labelEn: string; colour: string };
  /** YYYY-MM-DD, or null when the tier has no expiry (Bronze). */
  validUntil: string | null;
  /** The active services with a discount at the effective tier; empty for a member who is not valid. */
  discounts: Array<{ nameSq: string; nameEn: string; percent: string }>;
}

/**
 * What a card or a verification says about a member right now (FR-MEM-06, D2):
 * the tier is calculated from the terms on today's date in the workspace's time
 * zone, never read from the stored copy, so it is right before the daily job
 * has run. The card page and both verification pages share this one rule.
 */
export class MemberStandingResolver {
  constructor(
    private readonly members: IMemberStore,
    private readonly settings: IMembershipSettingsStore,
    private readonly benefits: IBenefitStore,
    private readonly payments: IMemberPaymentStore
  ) {}

  async resolve(tenantId: string, timezone: string, member: MemberRecord, now: Date): Promise<MemberStanding> {
    const today = dayDate(dayKeyInZone(now, timezone));
    const [terms, tiers, settings, services] = await Promise.all([
      this.members.listTerms(member.id),
      this.settings.getTiers(tenantId),
      this.settings.getSettings(tenantId).then((s) => s.toJSON()),
      this.benefits.list(tenantId),
    ]);
    const sponsor = member.employerClientId ? (await new SponsorValidity(this.payments).forCompanies(tenantId, [member.employerClientId], day(today))).get(member.employerClientId) : undefined;

    const values: MemberTermValue[] = terms.map((t) => ({ tier: t.tier, source: t.source, startsOn: dayDate(t.startsOn), endsOn: t.endsOn ? dayDate(t.endsOn) : null }));
    const tier = effectiveTierOn(values, sponsor?.valid ?? false, settings.graceDays, today);
    const current = validTermsOn(values, sponsor?.valid ?? false, settings.graceDays, today)
      .filter((v) => v.tier === tier)
      .sort((a, b) => (b.endsOn?.getTime() ?? Infinity) - (a.endsOn?.getTime() ?? Infinity))[0];
    const validUntil = !current ? null : current.source === 'SPONSORED' ? (sponsor?.endsOn ?? null) : current.endsOn ? day(current.endsOn) : null;
    const standing = validityOn(member.status, tier, null);
    const valid = standing.valid && member.anonymisedAt === null;

    const setting = tiers.find((t) => t.tier === tier);
    return {
      valid,
      reason: valid ? null : (standing.reason ?? 'CLOSED'),
      tier,
      tierLabel: { tier, labelSq: setting?.labelSq ?? tier, labelEn: setting?.labelEn ?? tier, colour: setting?.colour ?? '#888888' },
      validUntil,
      discounts: valid ? services.filter((s) => s.active && s.discounts[tier] !== null).map((s) => ({ nameSq: s.nameSq, nameEn: s.nameEn, percent: s.discounts[tier] as string })) : [],
    };
  }
}
