import { LookupList } from '../../domain/LookupList';

/**
 * How many records use a list value. A value in use can only be deactivated,
 * never deleted (FR-SET-01, 02). Each list that other records point at adds
 * its references to the implementation — business types gain companies in
 * Slice 11.
 */
export interface ILookupInUsePolicy {
  usages(tenantId: string, list: LookupList, id: string): Promise<number>;
}
