/** What a deal is for (FR-DEAL-01). A String column, like every other status in the schema. */
export enum DealType {
  NewContract = 'NEW_CONTRACT',
  Renewal = 'RENEWAL',
  ExtraServices = 'EXTRA_SERVICES',
}

export function isDealType(value: string): value is DealType {
  return Object.values(DealType).includes(value as DealType);
}
