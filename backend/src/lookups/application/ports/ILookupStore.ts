import { LookupList } from '../../domain/LookupList';
import { LookupRecord } from '../../domain/LookupItem';

/** Reads a workspace's list values. Every method takes `tenantId` first, so no read can cross tenants. */
export interface ILookupStore {
  /** Every value of `list`, active and inactive, in no particular order. */
  list(tenantId: string, list: LookupList): Promise<LookupRecord[]>;
  findById(tenantId: string, list: LookupList, id: string): Promise<LookupRecord | null>;
}
