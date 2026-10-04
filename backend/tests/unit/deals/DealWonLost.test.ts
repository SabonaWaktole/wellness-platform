import { Deal, WinningOffer } from '../../../src/deals/domain/Deal';
import { DealStage } from '../../../src/deals/domain/DealStage';
import { DealType } from '../../../src/deals/domain/DealType';
import { DealNotWinnableError, DealStageNotAllowedError, InvalidDealError } from '../../../src/deals/domain/errors';

const T0 = new Date('2026-10-01T08:00:00Z');
const T1 = new Date('2026-10-02T08:00:00Z');
const DAY = new Date('2026-10-02T00:00:00Z');
let n = 0;
const newId = () => `id-${++n}`;

const openDeal = () =>
  Deal.open({
    id: 'deal-1', tenantId: 't', clientId: 'c', ownerUserId: 'sales-a', createdByUserId: 'sales-a',
    type: DealType.NewContract, title: null, expectedCloseDate: null, notes: null, now: T0, newId,
  }).deal;

const offer = (overrides: Partial<WinningOffer> = {}): WinningOffer => ({
  id: 'offer-1', dealId: 'deal-1', status: 'SENT', superseded: false, hasPendingApproval: false,
  netMonthlyPrice: '49.40', annualValue: '592.80', packageId: 'pkg-1', ...overrides,
});

describe('Deal win and lose (FR-DEAL-14, 16, 17)', () => {
  it('FR-DEAL-14 wins with a ready, sent or accepted offer and copies its values', () => {
    for (const status of ['READY', 'SENT', 'ACCEPTED']) {
      const deal = openDeal();
      const change = deal.win(offer({ status }), DAY, 'sales-a', T1, newId);
      expect(deal.stage).toBe(DealStage.Won);
      expect(change).toMatchObject({ fromStage: DealStage.NewLead, toStage: DealStage.Won, changedByUserId: 'sales-a' });
      expect(deal.toProps()).toMatchObject({
        agreedMonthlyPrice: '49.40', agreedAnnualValue: '592.80', packageId: 'pkg-1', wonQuotationId: 'offer-1', wonAt: DAY, closedAt: DAY,
      });
    }
  });

  it('FR-DEAL-14 refuses a draft, a pending approval, an old version, another deal\'s offer and an unpriced one', () => {
    const refused = [
      offer({ status: 'DRAFT' }),
      offer({ status: 'PENDING_APPROVAL', hasPendingApproval: true }),
      offer({ superseded: true }),
      offer({ dealId: 'other' }),
      offer({ netMonthlyPrice: null, annualValue: null }),
    ];
    for (const candidate of refused) {
      const deal = openDeal();
      expect(() => deal.win(candidate, DAY, 'sales-a', T1, newId)).toThrow(DealNotWinnableError);
      expect(deal.stage).toBe(DealStage.NewLead);
    }
  });

  it('FR-DEAL-14 the price cannot be typed: win() takes the offer and no price', () => {
    expect(openDeal().win.length).toBe(5);
  });

  it('FR-DEAL-16 refuses a loss without a reason, and records the reason, note and date', () => {
    expect(() => openDeal().lose('', null, DAY, 'sales-a', T1, newId)).toThrow(InvalidDealError);
    const deal = openDeal();
    deal.lose('reason-1', '  too dear ', DAY, 'sales-a', T1, newId);
    expect(deal.toProps()).toMatchObject({ stage: DealStage.Lost, lostReasonId: 'reason-1', lostNote: 'too dear', lostAt: DAY });
  });

  it('FR-DEAL-17 reopens into an open stage with a comment, keeping the result in the note', () => {
    const deal = openDeal();
    deal.win(offer(), DAY, 'sales-a', T1, newId);
    expect(() => deal.reopen(DealStage.Won, 'x', 'mgr', T1, newId)).toThrow(InvalidDealError);
    expect(() => deal.reopen(DealStage.Negotiation, ' ', 'mgr', T1, newId)).toThrow(InvalidDealError);
    const change = deal.reopen(DealStage.Negotiation, 'Customer called back', 'mgr', T1, newId);
    expect(change).toMatchObject({ fromStage: DealStage.Won, toStage: DealStage.Negotiation, changedByUserId: 'mgr' });
    expect(change.note).toContain('Customer called back');
    expect(change.note).toContain('49.40');
    expect(deal.toProps()).toMatchObject({ closedAt: null, wonAt: null, agreedMonthlyPrice: null, wonQuotationId: null });
  });

  it('FR-DEAL-17 an open deal cannot be reopened, and a closed one cannot be won or lost again', () => {
    expect(() => openDeal().reopen(DealStage.Contacted, 'x', 'mgr', T1, newId)).toThrow(DealStageNotAllowedError);
    const deal = openDeal();
    deal.lose('r', null, DAY, 'sales-a', T1, newId);
    expect(() => deal.win(offer(), DAY, 'sales-a', T1, newId)).toThrow(DealStageNotAllowedError);
    expect(() => deal.lose('r', null, DAY, 'sales-a', T1, newId)).toThrow(DealStageNotAllowedError);
  });
});
