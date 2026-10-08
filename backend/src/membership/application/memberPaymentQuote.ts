import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { effectiveTierOn, type MemberTermValue } from '../domain/MemberTerm';
import { quotePayment, type QuoteResult } from '../domain/paymentQuote';
import type { PurchaseRefusal } from '../domain/membershipPricing';
import type { Tier } from '../domain/Tier';
import type { PaymentKind } from '../domain/termDates';
import type { IMemberPaymentStore, PaymentTermRecord } from './ports/IMemberPaymentStore';
import type { MemberRecord } from './ports/IMemberStore';
import type { IMembershipSettingsStore, IRelationshipStore } from './ports/IMembershipSettingsStore';
import type { IMemberStore } from './ports/IMemberStore';

export const dayDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
export const dayText = (value: Date): string => value.toISOString().slice(0, 10);

export const termValues = (terms: readonly PaymentTermRecord[]): Array<MemberTermValue & { id: string }> =>
  terms.map((t) => ({ id: t.id, tier: t.tier, source: t.source, startsOn: dayDate(t.startsOn), endsOn: t.endsOn ? dayDate(t.endsOn) : null }));

/** The payment is refused by a purchase rule (FR-MPAY-02..04, D5). Mapped to 409 with the reason. */
export class PaymentRefusedError extends Error {
  readonly code = 'PAYMENT_REFUSED';
  constructor(readonly reason: PurchaseRefusal) {
    super(`This payment is not allowed: ${reason}.`);
  }
}

export interface QuoteDeps {
  paymentStore: IMemberPaymentStore;
  settingsStore: IMembershipSettingsStore;
  memberStore: IMemberStore;
  relationshipStore: IRelationshipStore;
}

/** The reason line of a family price (FR-FAM-05): the principal and the relationship. */
export interface FamilyLine {
  principalMemberId: string;
  principalName: string;
  relationshipId: string | null;
  relationshipNameSq: string | null;
  relationshipNameEn: string | null;
}

/** A sponsored term counts while the employer's contract is valid (D8). */
const sponsorValidOn = (deps: QuoteDeps, tenantId: string, member: MemberRecord, day: string): Promise<boolean> =>
  member.employerClientId ? deps.paymentStore.employerContractValid(tenantId, member.employerClientId, day) : Promise.resolve(false);

/** The member's effective tier on a day, from the one domain rule (D2). */
export async function effectiveTierAt(deps: QuoteDeps, tenantId: string, member: MemberRecord, terms: readonly PaymentTermRecord[], day: string): Promise<Tier> {
  const { graceDays } = (await deps.settingsStore.getSettings(tenantId)).toJSON();
  return effectiveTierOn(termValues(terms), await sponsorValidOn(deps, tenantId, member, day), graceDays, dayDate(day));
}

/**
 * The quote for one member, kind, tier and date received, from the settings and
 * the member's terms (FR-MPAY-01, FR-MPAY-02). The family discount is decided on
 * the payment date from the principal's status and effective tier (FR-FAM-04),
 * so a principal upgraded later never changes an earlier payment.
 */
export async function quoteFor(
  deps: QuoteDeps,
  tenantId: string,
  member: MemberRecord,
  terms: readonly PaymentTermRecord[],
  input: { kind: PaymentKind; targetTier: Tier; receivedOn: string }
): Promise<QuoteResult & { family: FamilyLine | null }> {
  const [settings, tiers] = await Promise.all([deps.settingsStore.getSettings(tenantId), deps.settingsStore.getTiers(tenantId)]);
  const silver = tiers.find((t) => t.tier === 'SILVER')!;
  const gold = tiers.find((t) => t.tier === 'GOLD')!;
  const principal = member.principalMemberId ? await deps.memberStore.find(tenantId, member.principalMemberId) : null;
  const principalState = principal
    ? {
        status: principal.status,
        effectiveTier: await effectiveTierAt(deps, tenantId, principal, await deps.paymentStore.listTerms(principal.id), input.receivedOn),
      }
    : null;
  const relationship = principal && member.relationshipId ? await deps.relationshipStore.find(tenantId, member.relationshipId) : null;
  const result = quotePayment({
    status: member.status,
    terms: termValues(terms),
    sponsorValid: await sponsorValidOn(deps, tenantId, member, input.receivedOn),
    graceDays: settings.graceDays,
    fees: { SILVER: Money.of(silver.fee!), GOLD: Money.of(gold.fee!) },
    termMonths: { SILVER: silver.termMonths!, GOLD: gold.termMonths! },
    familyDiscountPercent: Percent.of(settings.familyDiscountPercent),
    principal: principalState,
    kind: input.kind,
    targetTier: input.targetTier,
    receivedOn: dayDate(input.receivedOn),
  });
  const family: FamilyLine | null = principal
    ? {
        principalMemberId: principal.id,
        principalName: `${principal.firstName} ${principal.lastName}`,
        relationshipId: member.relationshipId,
        relationshipNameSq: relationship?.nameSq ?? null,
        relationshipNameEn: relationship?.nameEn ?? null,
      }
    : null;
  return { ...result, family };
}
