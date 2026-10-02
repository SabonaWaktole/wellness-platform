/**
 * An activity's type (FR-ACT-01). The four M1 channels kept their keys, so
 * every existing interaction is already a valid activity (FR-ACT-07); VISIT
 * and ONLINE_MEETING are new in M2 Slice 7.
 */
export enum InteractionChannel {
  MEETING = 'MEETING',
  CALL = 'CALL',
  NOTE = 'NOTE',
  EMAIL = 'EMAIL',
  VISIT = 'VISIT',
  ONLINE_MEETING = 'ONLINE_MEETING',
}
