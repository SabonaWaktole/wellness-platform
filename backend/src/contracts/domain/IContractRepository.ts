import { RecordScope } from '../../access/domain/RecordScope';
import { Contract } from './Contract';

export interface ContractFilters {
  tenantId: string;
  query?: string;
  status?: string;
  clientId?: string;
  assignedUserId?: string;
  /** Active contracts ending within this many days. Drives the renewals view. */
  expiringWithinDays?: number;
  /** Valid, expiring soon or not valid on `today` (FR-CON-08). Needs `today` and `expiringSoonDays`. */
  validity?: 'VALID' | 'EXPIRING_SOON' | 'NOT_VALID';
  /** The workspace day, as a UTC-midnight date, and the expiring-soon window (FR-REN-04). */
  today?: Date;
  expiringSoonDays?: number;
  /** End date range, both ends included (FR-CON-08). */
  endsFrom?: Date;
  endsTo?: Date;
  /** Any instalment Overdue (FR-CON-08). */
  hasOverdue?: boolean;
  /** The company's predefined Area and City (FR-CON-08). */
  areaId?: string;
  cityId?: string;
  page?: number;
  limit?: number;
  /** Reach over the contract's company's assignee (FR-RBAC-11..13). Omitted means every contract. */
  scope?: RecordScope;
}

export interface PaginatedContracts {
  data: Contract[];
  total: number;
}

export interface IContractRepository {
  findById(tenantId: string, id: string): Promise<Contract | null>;
  /** Every term for one client, newest first. Powers the client detail tab. */
  findByClientId(tenantId: string, clientId: string, scope?: RecordScope): Promise<Contract[]>;
  search(filters: ContractFilters): Promise<PaginatedContracts>;
  /** The contract made from this deal, if any (FR-CON-01). */
  findByDealId(tenantId: string, dealId: string): Promise<Contract | null>;
  save(contract: Contract): Promise<void>;
}
