/**
 * The fixed client status set (Slice 11, Q9). ACTIVE and INACTIVE were
 * remapped to CLIENT and FORMER_CLIENT by the Slice 11 migration; LEAD is
 * new and has no legacy equivalent.
 */
export enum ClientStatus {
  LEAD = 'LEAD',
  PROSPECT = 'PROSPECT',
  CLIENT = 'CLIENT',
  FORMER_CLIENT = 'FORMER_CLIENT',
}
