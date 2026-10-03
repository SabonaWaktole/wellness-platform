import { dayKeyInZone } from '../../../../shared/domain/time/tenantDay';
import { RichTextDoc } from '../../../../shared/domain/richText';
import { OfferLanguage } from '../../../domain/Offer';
import { QuotationStatus } from '../../../domain/Quotation';
import { OfferView } from '../offerViews';
import { OfferDocument } from './OfferDocument';
import { OfferRenderSnapshot, SnapshotLabel } from './OfferRenderSnapshot';

const DRAFT_STATUSES: readonly string[] = [QuotationStatus.Draft, QuotationStatus.PendingApproval];

/** The label in `language`; English falls back to Albanian, which every list value has. */
function pick(label: SnapshotLabel | null | undefined, language: OfferLanguage): string | null {
  if (!label) return null;
  return language === 'en' ? (label.nameEn ?? label.nameSq) : label.nameSq;
}

function inputLabel(inputs: Record<string, unknown> | null, key: string, language: OfferLanguage): string | null {
  const value = inputs?.[key];
  return value && typeof value === 'object' ? pick(value as SnapshotLabel, language) : null;
}

function text(en: RichTextDoc | null, sq: RichTextDoc | null, language: OfferLanguage): RichTextDoc | null {
  return language === 'en' ? (en ?? sq) : sq;
}

const numberOr = (value: unknown): number | null => (typeof value === 'number' ? value : null);

/**
 * The offer's PDF content in one language (FR-OFR-02, 06): the offer's own
 * columns (its number, inputs with their labels, amounts and services, all
 * stored when it was priced, FR-OFR-04) plus `details`, which is the frozen
 * render snapshot for a Ready or later offer and the live values for a draft
 * (D2). Pure: the same offer and details always give the same document, so
 * preview and download match (FR-OFR-05).
 */
export function buildOfferDocument(
  offer: OfferView,
  details: OfferRenderSnapshot,
  language: OfferLanguage,
  timeZone: string
): OfferDocument {
  const rules = offer.ruleSnapshot ?? {};
  const inputs = offer.pricingInputs;
  return {
    language,
    draft: DRAFT_STATUSES.includes(offer.status),
    reference: offer.reference,
    issuedOn: dayKeyInZone(new Date(offer.readyAt ?? offer.createdAt), timeZone),
    validUntil: offer.validUntil,
    validityDays: numberOr(rules.offerValidityDays),
    currency: typeof rules.currency === 'string' ? rules.currency : 'EUR',
    issuer: { ...details.issuer },
    company: {
      name: details.company.name,
      nipt: details.company.nipt,
      streetAddress: details.company.streetAddress,
      area: pick(details.company.area, language),
      city: pick(details.company.city, language),
    },
    contact: details.contact ? { ...details.contact } : null,
    inputs: {
      employees: offer.employeesPriced,
      businessType: inputLabel(inputs, 'businessType', language),
      riskLevel: inputLabel(inputs, 'riskLevel', language),
      zone: inputLabel(inputs, 'zone', language),
      frequency: inputLabel(inputs, 'frequency', language),
      package: inputLabel(inputs, 'package', language),
    },
    services: offer.services.map((service) => ({
      name: language === 'en' ? (service.nameEn ?? service.nameSq) : service.nameSq,
      description: language === 'en' ? (service.descriptionEn ?? service.descriptionSq) : service.descriptionSq,
    })),
    amounts:
      offer.listPrice === null
        ? null
        : {
            baseFee: offer.baseFee!,
            riskFee: offer.riskFee!,
            visitFee: offer.visitFee!,
            locationFee: offer.locationFee!,
            listPrice: offer.listPrice,
            discountPercent: offer.discountPercent!,
            discountAmount: offer.discountAmount!,
            netMonthlyPrice: offer.netMonthlyPrice!,
            annualValue: offer.annualValue!,
          },
    contractMonths: numberOr(rules.contractMonths),
    vatIncluded: false,
    note: offer.note,
    texts: {
      intro: text(details.texts.introEn, details.texts.introSq, language),
      terms: text(details.texts.termsEn, details.texts.termsSq, language),
      closing: text(details.texts.closingEn, details.texts.closingSq, language),
    },
    salesperson: { ...details.salesperson },
  };
}
