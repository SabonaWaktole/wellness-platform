import { OfferDocument } from '../document/OfferDocument';

/** Draws an offer document as a PDF (D3). The preview is the same PDF (FR-OFR-05). */
export interface IOfferPdfRenderer {
  render(document: OfferDocument): Promise<Buffer>;
}
