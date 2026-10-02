import type { RichTextDoc } from '../../shared/domain/richText';
import type { OfferTextField } from './DefaultOfferSettings';
import { InvalidPricingValueError } from './errors';

/**
 * The offer settings (FR-PCF-08): how long an offer is valid, the contract
 * length its annual value is calculated over, the offer number prefix, the
 * company details printed on the offer, and the standard texts in sq and en.
 * Stored on the workspace's `PricingSettings` row.
 */
export interface OfferSettings {
  offerValidityDays: number;
  contractMonthsDefault: number;
  offerNumberPrefix: string;
  companyName: string | null;
  nipt: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bankDetails: string | null;
  introSq: RichTextDoc | null;
  introEn: RichTextDoc | null;
  termsSq: RichTextDoc | null;
  termsEn: RichTextDoc | null;
  closingSq: RichTextDoc | null;
  closingEn: RichTextDoc | null;
}

export type OfferSettingsDetails = Omit<OfferSettings, OfferTextField>;

/** Whole-number settings and their ranges. */
const NUMBERS = {
  offerValidityDays: { min: 1, max: 365 },
  contractMonthsDefault: { min: 1, max: 60 },
} as const;

/** The company details and the longest each may be: a one-line field fits a MySQL VARCHAR(191). */
export const OFFER_DETAIL_LIMITS = {
  companyName: 191,
  nipt: 191,
  address: 500,
  phone: 191,
  email: 191,
  website: 191,
  bankDetails: 2000,
} as const;

type DetailField = keyof typeof OFFER_DETAIL_LIMITS;

const PREFIX = /^[A-Z]{1,6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** An http(s) address, or a bare domain as printed on letterheads ("wellness.al"). */
const WEBSITE = /^(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#]\S*)?$/i;

const invalid = (field: string, message: string) => new InvalidPricingValueError('INVALID_OFFER_SETTING', field, message);

function parseNumber(value: unknown, field: keyof typeof NUMBERS): number {
  const { min, max } = NUMBERS[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw invalid(field, `Enter a whole number from ${min} to ${max}.`);
  }
  return value;
}

function parseDetail(value: unknown, field: DetailField): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw invalid(field, 'Enter text.');
  const text = field === 'bankDetails' || field === 'address' ? value.trim() : value.replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  if (text.length > OFFER_DETAIL_LIMITS[field]) throw invalid(field, `Use at most ${OFFER_DETAIL_LIMITS[field]} characters.`);
  if (field === 'email' && !EMAIL.test(text)) throw invalid(field, 'Enter an email address.');
  if (field === 'website' && !WEBSITE.test(text)) throw invalid(field, 'Enter a website address.');
  return text;
}

/**
 * The offer settings in `values`, checked: validity 1–365 days, contract 1–60
 * months, a prefix of one to six capital letters, and company details of a
 * sensible length (an empty one is cleared). Only the fields present are
 * returned, so an edit can change one setting. The texts are sanitised by the
 * use case, not here.
 */
export function parseOfferSettings(values: Record<string, unknown>): Partial<OfferSettingsDetails> {
  const result: Partial<OfferSettingsDetails> = {};
  const has = (field: string) => field in values && values[field] !== undefined;

  if (has('offerValidityDays')) result.offerValidityDays = parseNumber(values.offerValidityDays, 'offerValidityDays');
  if (has('contractMonthsDefault')) result.contractMonthsDefault = parseNumber(values.contractMonthsDefault, 'contractMonthsDefault');
  if (has('offerNumberPrefix')) {
    const prefix = values.offerNumberPrefix;
    if (typeof prefix !== 'string' || !PREFIX.test(prefix.trim())) {
      throw invalid('offerNumberPrefix', 'Use one to six capital letters, e.g. OF.');
    }
    result.offerNumberPrefix = prefix.trim();
  }
  for (const field of Object.keys(OFFER_DETAIL_LIMITS) as DetailField[]) {
    if (has(field)) result[field] = parseDetail(values[field], field);
  }
  return result;
}
