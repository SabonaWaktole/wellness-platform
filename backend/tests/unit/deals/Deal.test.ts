import { Deal } from '../../../src/deals/domain/Deal';
import { DealStage } from '../../../src/deals/domain/DealStage';
import { DealType } from '../../../src/deals/domain/DealType';
import { DealStageNotAllowedError, InvalidDealError } from '../../../src/deals/domain/errors';

const T0 = new Date('2026-10-01T08:00:00Z');
const T1 = new Date('2026-10-02T08:00:00Z');

function openDeal(overrides: Partial<Parameters<typeof Deal.open>[0]> = {}) {
  return Deal.open({
    id: 'deal-1',
    tenantId: 'tenant-1',
    clientId: 'client-1',
    ownerUserId: 'sales-a',
    createdByUserId: 'sales-a',
    type: DealType.NewContract,
    title: null,
    expectedCloseDate: null,
    notes: null,
    now: T0,
    newId: () => 'change-1',
    ...overrides,
  });
}

/** A deal already in `stage`, as a store would rebuild it. */
function dealIn(stage: DealStage) {
  const { deal } = openDeal();
  return Deal.rebuild({ ...deal.toProps(), stage, closedAt: stage === DealStage.Won || stage === DealStage.Lost ? T0 : null });
}

describe('Deal (FR-DEAL-01, 07, 08, 09)', () => {
  it('FR-DEAL-01 a new deal starts in New Lead, owned by the given salesperson', () => {
    const { deal, change } = openDeal({ title: '  Annual contract  ', notes: '  ' });
    expect(deal.stage).toBe(DealStage.NewLead);
    expect(deal.ownerUserId).toBe('sales-a');
    expect(deal.title).toBe('Annual contract');
    expect(deal.notes).toBeNull();
    expect(deal.isOpen).toBe(true);
    expect(change).toEqual({
      id: 'change-1',
      dealId: 'deal-1',
      fromStage: null,
      toStage: DealStage.NewLead,
      changedByUserId: 'sales-a',
      at: T0,
    });
  });

  it('FR-DEAL-01 refuses an unknown type and an over-long title with a field error', () => {
    expect(() => openDeal({ type: 'PARTNERSHIP' as DealType })).toThrow(InvalidDealError);
    let caught: unknown;
    try {
      openDeal({ title: 'x'.repeat(201) });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'INVALID_DEAL', field: 'title' });
  });

  it('FR-DEAL-07 moves between open stages in either direction: Negotiation back to Follow-Up', () => {
    const deal = dealIn(DealStage.Negotiation);
    const change = deal.moveTo(DealStage.FollowUp, 'sales-a', T1, () => 'change-2');
    expect(deal.stage).toBe(DealStage.FollowUp);
    expect(change).toMatchObject({ fromStage: DealStage.Negotiation, toStage: DealStage.FollowUp });
  });

  it.each([DealStage.Won, DealStage.Lost])('FR-DEAL-07 refuses %s through moveTo: it has its own action', (target) => {
    const deal = dealIn(DealStage.Negotiation);
    expect(() => deal.moveTo(target, 'sales-a', T1, () => 'x')).toThrow(DealStageNotAllowedError);
    expect(deal.stage).toBe(DealStage.Negotiation);
  });

  it('FR-DEAL-07 refuses to move a closed deal; reopening is its own action', () => {
    const deal = dealIn(DealStage.Lost);
    expect(() => deal.moveTo(DealStage.Negotiation, 'sales-a', T1, () => 'x')).toThrow(DealStageNotAllowedError);
  });

  it('FR-DEAL-07 a move to the stage the deal is already in changes nothing and records nothing', () => {
    const deal = dealIn(DealStage.Interested);
    expect(deal.moveTo(DealStage.Interested, 'sales-a', T1, () => 'x')).toBeNull();
  });

  it('FR-DEAL-08 advances automatically only forwards, recorded as automatic', () => {
    const deal = dealIn(DealStage.Interested);
    const change = deal.advanceAutomatically(DealStage.OfferSent, T1, () => 'change-3');
    expect(deal.stage).toBe(DealStage.OfferSent);
    expect(change).toMatchObject({ fromStage: DealStage.Interested, toStage: DealStage.OfferSent, changedByUserId: null });
  });

  it('FR-DEAL-08 never moves a deal backwards automatically: a deal in Negotiation stays there', () => {
    const deal = dealIn(DealStage.Negotiation);
    expect(deal.advanceAutomatically(DealStage.OfferSent, T1, () => 'x')).toBeNull();
    expect(deal.stage).toBe(DealStage.Negotiation);
  });

  it.each([DealStage.Won, DealStage.Lost])('FR-DEAL-08 never moves a deal out of %s automatically', (closed) => {
    const deal = dealIn(closed);
    expect(deal.advanceAutomatically(DealStage.FollowUp, T1, () => 'x')).toBeNull();
    expect(deal.stage).toBe(closed);
  });

  it('FR-DEAL-08 never closes a deal automatically', () => {
    const deal = dealIn(DealStage.Negotiation);
    expect(deal.advanceAutomatically(DealStage.Won, T1, () => 'x')).toBeNull();
  });

  it('FR-DEAL-09 every stage change records from, to, the user and the time', () => {
    const { deal } = openDeal();
    const first = deal.moveTo(DealStage.Contacted, 'manager', T1, () => 'change-2');
    expect(first).toEqual({
      id: 'change-2',
      dealId: 'deal-1',
      fromStage: DealStage.NewLead,
      toStage: DealStage.Contacted,
      changedByUserId: 'manager',
      at: T1,
    });
    expect(deal.updatedAt).toEqual(T1);
  });

  it('FR-DEAL-05 reassigning returns the previous salesperson', () => {
    const { deal } = openDeal();
    expect(deal.reassign('sales-b', T1)).toBe('sales-a');
    expect(deal.ownerUserId).toBe('sales-b');
  });

  it('FR-DEAL-19 a soft-deleted deal keeps its row with the time it was deleted', () => {
    const { deal } = openDeal();
    deal.softDelete(T1);
    expect(deal.deletedAt).toEqual(T1);
  });

  it('FR-DEAL-01 an edit trims the title, and an empty title falls back to the default', () => {
    const { deal } = openDeal({ title: 'Old' });
    deal.edit({ title: '   ', type: DealType.ExtraServices, notes: 'Call after the audit', expectedCloseDate: T1 }, T1);
    expect(deal.title).toBeNull();
    expect(deal.type).toBe(DealType.ExtraServices);
    expect(deal.notes).toBe('Call after the audit');
    expect(deal.expectedCloseDate).toEqual(T1);
  });
});
