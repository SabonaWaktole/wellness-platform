/**
 * The short code shown for a contract, mirroring the backend's
 * `contractReference`. Duplicated rather than fetched because it is pure
 * formatting over an id the client already holds — a round trip to learn the
 * first eight characters of a string would be absurd.
 */
export const contractReference = (contractId: string): string =>
  contractId.split('-')[0].toUpperCase();
