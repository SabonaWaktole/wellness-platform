import { InvalidPricingInputError } from '../../../pricing/domain/errors';
import { PricingScreenState } from '../../../pricing/application/PricingScreen';
import { PricingLabel } from '../../../pricing/application/ports/IPricingSubjectReader';
import { OfferContent } from '../../domain/Offer';

/** The version of the `ruleSnapshot` shape, so a later reader knows what it holds (D2). */
export const RULE_SNAPSHOT_VERSION = 1;

const label = (item: PricingLabel | null) => (item ? { id: item.id, nameSq: item.nameSq, nameEn: item.nameEn } : null);

const INPUT_MESSAGES: Record<string, string> = {
  employees: 'Enter the number of employees.',
  zoneId: "Choose one of the zones of the company's city.",
  frequencyId: 'Choose a visit frequency.',
  packageId: 'Choose a package.',
};

/**
 * What a draft offer stores from one pass of the pricing screen (FR-OFR-04,
 * D2): the inputs with their labels, the rule values used and the amounts.
 * A draft needs every input chosen; a "Price on request" result is saved
 * without amounts (FR-PRC-07). A discount above the cap is refused here, on
 * the server, whatever the client sends (FR-DSC-04).
 */
export function offerContentFrom(state: PricingScreenState, note: string | null): OfferContent {
  const { outcome, settings, config } = state;
  if (outcome.kind === 'COMPANY_INCOMPLETE') {
    throw new InvalidPricingInputError(outcome.missing[0], 'Complete the company record first.', 'COMPANY_INCOMPLETE');
  }
  if (outcome.kind === 'INPUT_REQUIRED') {
    throw new InvalidPricingInputError(outcome.missing[0], INPUT_MESSAGES[outcome.missing[0]]);
  }
  const employees = state.employees;
  const frequency = state.frequency;
  const pkg = state.package;
  for (const [field, value] of [['employees', employees], ['frequencyId', frequency], ['packageId', pkg]] as const) {
    if (value === null) throw new InvalidPricingInputError(field, INPUT_MESSAGES[field]);
  }
  if (state.discountAboveCap) {
    throw new InvalidPricingInputError(
      'discountPercent',
      `A discount above ${config.discountCap.toString()}% needs approval.`,
      'DISCOUNT_ABOVE_CAP'
    );
  }

  const band = config.bands.find((b) => employees! >= b.min && employees! <= b.max) ?? null;
  const riskSurcharge = state.riskLevel ? config.riskSurcharges[state.riskLevel.id] : undefined;
  const ruleSnapshot: Record<string, unknown> = {
    schemaVersion: RULE_SNAPSHOT_VERSION,
    currency: settings.currency,
    band: band
      ? {
          minEmployees: band.min,
          maxEmployees: band.max,
          baseFee: band.baseFee.toString(),
          perEmployeeFee: band.perEmployeeFee.toString(),
        }
      : null,
    riskSurchargePercent: riskSurcharge?.toString() ?? null,
    frequency: { pricingType: frequency!.pricingType, frequencyValue: frequency!.frequencyValue },
    surchargePercent: state.zone?.surchargePercent ?? null,
    discountCapPercent: config.discountCap.toString(),
    contractMonths: config.contractMonths,
    offerValidityDays: settings.offerSettings.offerValidityDays,
  };
  if (outcome.kind === 'PRICE_ON_REQUEST') ruleSnapshot.priceOnRequest = outcome.reason;

  return {
    employeesPriced: employees!,
    packageId: pkg!.id,
    frequencyId: frequency!.id,
    zoneId: state.zone?.id ?? null,
    pricingInputs: {
      employees,
      businessType: label(state.businessType),
      riskLevel: state.riskLevel ? { ...label(state.riskLevel), level: state.riskLevel.level } : null,
      city: state.subject.city,
      area: state.subject.area,
      zone: label(state.zone),
      frequency: label(frequency),
      package: label(pkg),
      discountPercent: state.discountPercent.toString(),
    },
    ruleSnapshot,
    amounts:
      outcome.kind === 'PRICED'
        ? {
            baseFee: outcome.breakdown.baseFee,
            riskFee: outcome.breakdown.riskFee,
            visitFee: outcome.breakdown.visitFee,
            locationFee: outcome.breakdown.locationFee,
            listPrice: outcome.breakdown.listPrice,
            discountPercent: state.discountPercent,
            discountAmount: outcome.discount.discountAmount,
            netMonthlyPrice: outcome.discount.netMonthlyPrice,
            pricePerEmployee: outcome.breakdown.pricePerEmployee,
            annualValue: outcome.netAnnualValue,
          }
        : null,
    services: pkg!.services.map((service) => ({
      serviceId: service.id,
      nameSq: service.nameSq,
      nameEn: service.nameEn,
      descriptionSq: service.descriptionSq,
      descriptionEn: service.descriptionEn,
    })),
    note,
  };
}
