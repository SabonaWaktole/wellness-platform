import { Contract } from './Contract';

export interface ContractFilters {
  tenantId: string;
  query?: string;
  status?: string;
  clientId?: string;
  assignedUserId?: string;
  /** Active contracts ending within this many days. Drives the renewals view. */
  expiringWithinDays?: number;
  page?: number;
  limit?: number;
}

export interface PaginatedContracts {
  data: Contract[];
  total: number;
}

export interface IContractRepository {
  findById(tenantId: string, id: string): Promise<Contract | null>;
  /** Every term for one client, newest first. Powers the client detail tab. */
  findByClientId(tenantId: string, clientId: string): Promise<Contract[]>;
  search(filters: ContractFilters): Promise<PaginatedContracts>;
  save(contract: Contract): Promise<void>;
}
