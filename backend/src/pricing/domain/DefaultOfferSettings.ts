import type { RichTextDoc } from '../../shared/domain/richText';

/**
 * The services, package and offer settings every new workspace starts with
 * (M2 Slice 4: FR-PCF-06, FR-PCF-08), and the SRS answers to Q5, Q6 and Q9.
 * The services and the package are placeholders until Wellness Albania sends
 * its list (SRS §11.3); the Administrator replaces them from Settings →
 * Pricing.
 *
 * `PrismaPricingSeeder` writes these for new workspaces; the migration
 * `20261001100000_m2_services_offer_settings` and
 * `mysql_migration_m2_services_offer_settings.sql` write the same values for
 * workspaces that already exist. `DefaultOfferSettings.test.ts` keeps them
 * in step. No value contains an apostrophe, so each is a plain SQL literal.
 */
export interface DefaultService {
  nameSq: string;
  nameEn: string;
  descriptionSq: string;
  descriptionEn: string;
}

export const DEFAULT_SERVICES: DefaultService[] = [
  {
    nameSq: 'Vlerësimi i riskut',
    nameEn: 'Risk assessment',
    descriptionSq: 'Vlerësimi i rreziqeve për sigurinë dhe shëndetin në vendin e punës.',
    descriptionEn: 'Assessment of the health and safety risks at the workplace.',
  },
  {
    nameSq: 'Vizita mjekësore në punë',
    nameEn: 'Occupational health visits',
    descriptionSq: 'Vizitat e mjekut të punës në objekt, sipas frekuencës së zgjedhur.',
    descriptionEn: 'Visits of the occupational physician on site, at the chosen frequency.',
  },
  {
    nameSq: 'Trajnim për sigurinë dhe shëndetin në punë',
    nameEn: 'Health and safety training',
    descriptionSq: 'Trajnimi i punonjësve për sigurinë dhe shëndetin në punë.',
    descriptionEn: 'Training of the employees in health and safety at work.',
  },
];

/** The default package, holding every default service in order (Q11: it describes, it does not price). */
export const DEFAULT_SERVICE_PACKAGE = {
  nameSq: 'Standart',
  nameEn: 'Standard',
  descriptionSq: 'Paketa standarde e shërbimeve.',
  descriptionEn: 'The standard package of services.',
};

/** Q9: an offer is valid 30 days from the date it is marked as sent. */
export const DEFAULT_OFFER_VALIDITY_DAYS = 30;

/** Q6: contracts run 12 months unless the Administrator changes it. */
export const DEFAULT_CONTRACT_MONTHS = 12;

export const DEFAULT_OFFER_NUMBER_PREFIX = 'OF';

/** The six offer texts: introduction, terms and closing, in Albanian and English. */
export const OFFER_TEXT_FIELDS = ['introSq', 'introEn', 'termsSq', 'termsEn', 'closingSq', 'closingEn'] as const;
export type OfferTextField = (typeof OFFER_TEXT_FIELDS)[number];

const paragraphs = (...lines: string[]): RichTextDoc => ({
  type: 'doc',
  content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

/** Q5: prices are monthly, in EUR, VAT not included, and the terms say so. */
export const DEFAULT_OFFER_TEXTS: Record<OfferTextField, RichTextDoc> = {
  introSq: paragraphs('Ju falënderojmë për interesin tuaj. Më poshtë gjeni ofertën tonë për shërbimet e sigurisë dhe shëndetit në punë.'),
  introEn: paragraphs('Thank you for your interest. Below is our offer for health and safety services at work.'),
  termsSq: paragraphs('Çmimet janë mujore, në EUR.', 'TVSH nuk përfshihet.'),
  termsEn: paragraphs('Prices are monthly, in EUR.', 'VAT not included.'),
  closingSq: paragraphs('Mbetemi në dispozicion për çdo pyetje.'),
  closingEn: paragraphs('We remain at your disposal for any questions.'),
};
