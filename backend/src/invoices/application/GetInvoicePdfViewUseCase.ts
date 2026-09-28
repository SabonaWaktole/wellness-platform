import { AccessContext } from '../../access/domain/AccessContext';
export interface InvoicePdfLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoicePdfView {
  reference: string;
  status: string;
  issuedAt: Date;
  dueDate: Date;
  sentAt: Date | null;
  paidAt: Date | null;
  clientName: string;
  companyName: string;
  companyAddress: string | null;
  companyContactEmail: string | null;
  companyContactPhone: string | null;
  currency: string;
  locale: string;
  lines: InvoicePdfLine[];
  subtotal: number;
}

/**
 * The read side of an invoice PDF.
 *
 * A separate port from `IInvoiceRepository` for the same reason
 * `IPublicQuotationReader` is separate from `IQuotationRepository`: the PDF
 * needs data from four joined tables (invoice, line items with product names,
 * client, tenant) and none of it needs to round-trip through the domain
 * entity — it is read-only, rendered once and thrown away.
 *
 * Unlike the quotation reader this one IS tenant-scoped and DOES require the
 * caller to already be authenticated — there is no public share token for an
 * invoice (see the plan's "authenticated only" decision), so the lookup key
 * is the ordinary `(tenantId, invoiceId)` pair rather than a capability token.
 */
export interface IInvoicePdfReader {
  findByInvoiceId(tenantId: string, invoiceId: string): Promise<InvoicePdfView | null>;
}

export class GetInvoicePdfViewUseCase {
  constructor(private readonly reader: IInvoicePdfReader) {}

  /**
   * An invoice document is its prices, and a PDF cannot have fields removed
   * from it the way a JSON response can — so without `commercial.view` it is
   * refused outright (FR-RBAC-06).
   */
  async execute(tenantId: string, invoiceId: string, access: AccessContext): Promise<InvoicePdfView | null> {
    access.ensure('commercial.view');
    return this.reader.findByInvoiceId(tenantId, invoiceId);
  }
}
