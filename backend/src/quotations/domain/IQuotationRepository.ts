import { RecordScope } from '../../access/domain/RecordScope';
import { Quotation } from './Quotation';

export interface QuotationFilters {
  tenantId: string;
  query?: string;
  status?: string;
  clientId?: string;
  createdByUserId?: string;
  /** Reach over the quotation's company's assignee (FR-RBAC-11..13). Omitted means every quotation. */
  scope?: RecordScope;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedQuotations {
  data: Quotation[];
  total: number;
}

export interface IQuotationRepository {
  findById(tenantId: string, id: string): Promise<Quotation | null>;
  findPendingApprovals(tenantId: string): Promise<Quotation[]>;
  search(filters: QuotationFilters): Promise<PaginatedQuotations>;
  save(quotation: Quotation): Promise<void>;
}
