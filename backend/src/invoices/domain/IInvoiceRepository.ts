import { RecordScope } from '../../access/domain/RecordScope';
import { Invoice } from './Invoice';

export interface InvoiceFilters {
  tenantId: string;
  query?: string;
  status?: string;
  clientId?: string;
  /** Reach over the invoice's company's assignee (FR-RBAC-11..13). Omitted means every invoice. */
  scope?: RecordScope;
  page?: number;
  limit?: number;
}

export interface PaginatedInvoices {
  data: Invoice[];
  total: number;
}

export interface IInvoiceRepository {
  findById(tenantId: string, id: string): Promise<Invoice | null>;
  findByQuotationId(tenantId: string, quotationId: string): Promise<Invoice | null>;
  search(filters: InvoiceFilters): Promise<PaginatedInvoices>;
  save(invoice: Invoice): Promise<void>;
}
