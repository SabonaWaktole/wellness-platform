import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { OfferLanguage } from '../../domain/Offer';
import { OfferNotFoundError } from '../../domain/offerErrors';
import { buildOfferDocument } from './document/buildOfferDocument';
import { VIEW_COMMERCIAL } from './offerAccess';
import { IOfferDocumentSource } from './ports/IOfferDocumentSource';
import { IOfferPdfRenderer } from './ports/IOfferPdfRenderer';
import { IOfferStore } from './ports/IOfferStore';

/** "Kafe Blloku" → "kafe-blloku": ASCII, so the file name survives every mail client. */
export function companySlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'kompania';
}

/** Oferta_<company>_<number>.pdf (FR-OFR-06), with the version from v2 on (FR-OFR-11). */
export function offerFileName(companyName: string, number: string | null, version: number, fallback: string): string {
  const base = number ?? fallback;
  return `Oferta_${companySlug(companyName)}_${version > 1 ? `${base}-v${version}` : base}.pdf`;
}

/**
 * The offer's PDF in Albanian or English (FR-OFR-06, NFR-I18N-02). The
 * preview is the same PDF served inline, so preview and download match
 * (FR-OFR-05). A Ready or later offer is drawn from its frozen details, a
 * draft from the live ones and with the DRAFT watermark (D2, FR-OFR-09).
 * Readable with `commercial.view` in scope on the deal's salesperson.
 */
export class GetOfferDocumentUseCase {
  constructor(
    private readonly store: IOfferStore,
    private readonly scopes: RecordScopeResolver,
    private readonly documents: IOfferDocumentSource,
    private readonly renderer: IOfferPdfRenderer
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    offerId: string;
    language: OfferLanguage;
    timeZone: string;
  }): Promise<{ pdf: Buffer; fileName: string }> {
    const { access, tenantId, offerId } = input;
    access.ensure(VIEW_COMMERCIAL);
    const offer = await this.store.find(tenantId, offerId);
    if (!offer || !admits(await this.scopes.resolve(access, VIEW_COMMERCIAL), offer.dealOwnerUserId)) {
      throw new OfferNotFoundError();
    }
    const details =
      (await this.store.frozenDetails(tenantId, offerId)) ??
      (await this.documents.current(tenantId, {
        clientId: offer.clientId,
        contactPersonId: offer.contactPersonId,
        salespersonUserId: offer.dealOwnerUserId,
      }));
    const document = buildOfferDocument(offer, details, input.language, input.timeZone);
    return {
      pdf: await this.renderer.render(document),
      fileName: offerFileName(details.company.name, offer.number, offer.version, offer.reference),
    };
  }
}
