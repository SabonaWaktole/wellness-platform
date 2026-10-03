export interface PublicQuotationLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PublicQuotationView {
  /**
   * Deliberately NOT part of the public JSON response — the route builds its
   * own body and omits these. They live on the view because responding to a
   * quotation (accept/reject) needs the tenant-scoped identity the mutation
   * use cases require, and the token is the only handle a public caller has.
   */
  quotationId: string;
  tenantId: string;
  /**
   * The workspace runs the sales process (D6): it has no public link and
   * sends no quotation email (FR-OFR-07). Never part of the public body.
   */
  salesProcess?: boolean;
  reference: string;
  status: string;
  issuedAt: Date;
  sentAt: Date | null;
  respondedAt: Date | null;
  clientName: string;
  /**
   * Deliberately NOT part of the public JSON response — the route builds its
   * own body and omits this. It lives on the view because the delivery service
   * needs the recipient's address and the token is the only handle it has;
   * threading a client repository into two use cases to fetch one column would
   * be more machinery for less cohesion.
   */
  clientEmail: string | null;
  companyName: string;
  companyLogoUrl: string | null;
  companyAddress: string | null;
  companyContactEmail: string | null;
  companyContactPhone: string | null;
  currency: string;
  locale: string;
  dateFormat: string;
  lines: PublicQuotationLine[];
  subtotal: number;
}

/**
 * The read side of the customer-facing quotation link.
 *
 * A port rather than the usual repositories because this view crosses four
 * aggregates (quotation, line items with product names, client, tenant) and is
 * reached without a tenant context — the token IS the context. Assembling it
 * from the tenant-scoped repositories would mean first resolving a tenant from
 * a token in order to then scope by that tenant, which is circular.
 */
export interface IPublicQuotationReader {
  /** Null when the token matches nothing. Never throws on a bad token. */
  findByShareToken(token: string): Promise<PublicQuotationView | null>;
}

/**
 * Resolves a share token to something a customer can read.
 *
 * There is no authentication here and that is the design: the token is the
 * capability. What keeps that safe is the combination of a 256-bit token
 * (see `generateShareToken`), a token that only exists once a quotation has
 * been sent, and this use case's refusal to serve anything that has since gone
 * back to being internal.
 */
export class GetPublicQuotationUseCase {
  constructor(private readonly reader: IPublicQuotationReader) {}

  async execute(token: string): Promise<PublicQuotationView | null> {
    // A blank token must not become "find the first row with a NULL token",
    // which would hand out an arbitrary unsent quotation.
    if (!token || token.trim() === '') return null;

    const view = await this.reader.findByShareToken(token);
    if (!view) return null;

    // FR-OFR-07: a sales-process workspace has no public quotation link.
    if (view.salesProcess) return null;

    /*
     * A quotation returned to Draft stops being publicly readable even though
     * its token survives (the entity never reissues, so the customer's original
     * link keeps working once it is sent again). Draft is internal by
     * definition — half-edited pricing is exactly what must not be visible.
     *
     * Sent, Accepted, Rejected and Expired all remain readable: the customer
     * has legitimately seen this document and a link that dies the moment they
     * answer is a link they cannot refer back to.
     */
    if (view.status === 'DRAFT' || view.status === 'PENDING_APPROVAL') return null;

    return view;
  }
}
