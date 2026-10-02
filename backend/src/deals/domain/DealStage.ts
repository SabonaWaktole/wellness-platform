/**
 * The pipeline stages (FR-DEAL-06), fixed in code because the platform's
 * logic depends on them: Won and Lost close a deal, and the automatic moves
 * (FR-DEAL-08) only go forward in this order. The Administrator changes their
 * labels, order on screen and colour through the DEAL status domain in
 * `statuses/domain/StatusCatalogue.ts`, never the keys.
 */
export enum DealStage {
  NewLead = 'NEW_LEAD',
  Contacted = 'CONTACTED',
  Interested = 'INTERESTED',
  OfferPrepared = 'OFFER_PREPARED',
  OfferSent = 'OFFER_SENT',
  FollowUp = 'FOLLOW_UP',
  Negotiation = 'NEGOTIATION',
  Won = 'WON',
  Lost = 'LOST',
}

export const CLOSED_DEAL_STAGES: readonly DealStage[] = [DealStage.Won, DealStage.Lost];

export const OPEN_DEAL_STAGES: readonly DealStage[] = Object.values(DealStage).filter(
  (stage) => !CLOSED_DEAL_STAGES.includes(stage)
);

export function isDealStage(value: string): value is DealStage {
  return Object.values(DealStage).includes(value as DealStage);
}

export function isOpenStage(stage: DealStage): boolean {
  return OPEN_DEAL_STAGES.includes(stage);
}

/** Position in the fixed pipeline order, which automatic moves never go back on. */
export function stageRank(stage: DealStage): number {
  return Object.values(DealStage).indexOf(stage);
}
