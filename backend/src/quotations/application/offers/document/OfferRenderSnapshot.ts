import { RichTextDoc } from '../../../../shared/domain/richText';

/** A list value's two labels, as the offer was made (sq always, en when given). */
export interface SnapshotLabel {
  nameSq: string;
  nameEn: string | null;
}

/**
 * Everything the offer's PDF shows besides the offer's own columns (D2,
 * FR-OFR-02): Wellness Albania's details and texts, the company, the contact
 * and the salesperson. Read live for a draft; frozen into
 * `Quotation.renderSnapshot` when the offer becomes Ready, so the final
 * document reads the same after any of them change (FR-OFR-04). Both
 * languages are kept, since the language is chosen at download (FR-OFR-06).
 */
export interface OfferRenderSnapshot {
  schemaVersion: 1;
  issuer: {
    companyName: string | null;
    nipt: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    bankDetails: string | null;
  };
  texts: {
    introSq: RichTextDoc | null;
    introEn: RichTextDoc | null;
    termsSq: RichTextDoc | null;
    termsEn: RichTextDoc | null;
    closingSq: RichTextDoc | null;
    closingEn: RichTextDoc | null;
  };
  company: {
    name: string;
    /** NIPT, if recorded. */
    nipt: string | null;
    streetAddress: string | null;
    area: SnapshotLabel | null;
    city: SnapshotLabel | null;
  };
  /** The chosen contact, or the company's primary one; null if it has none. */
  contact: { name: string; position: string | null; phone: string | null; email: string | null } | null;
  salesperson: { name: string; phone: string | null; email: string };
}

export const RENDER_SNAPSHOT_VERSION = 1;
