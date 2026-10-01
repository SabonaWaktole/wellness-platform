import { DealStage, OPEN_DEAL_STAGES, CLOSED_DEAL_STAGES, isOpenStage, isDealStage } from '../../../src/deals/domain/DealStage';
import { StatusDomain, catalogueKeys, isStatusDomain, STATUS_CATALOGUE } from '../../../src/statuses/domain/StatusCatalogue';

describe('Deal stages (FR-DEAL-06)', () => {
  it('FR-DEAL-06 the nine stages are fixed in code, in pipeline order', () => {
    expect(Object.values(DealStage)).toEqual([
      'NEW_LEAD',
      'CONTACTED',
      'INTERESTED',
      'OFFER_PREPARED',
      'OFFER_SENT',
      'FOLLOW_UP',
      'NEGOTIATION',
      'WON',
      'LOST',
    ]);
    expect(CLOSED_DEAL_STAGES).toEqual([DealStage.Won, DealStage.Lost]);
    expect(OPEN_DEAL_STAGES).toHaveLength(7);
    expect(isOpenStage(DealStage.Negotiation)).toBe(true);
    expect(isOpenStage(DealStage.Won)).toBe(false);
    expect(isDealStage('INTERESTED')).toBe(true);
    expect(isDealStage('ARCHIVED')).toBe(false);
  });

  it('FR-DEAL-06 the status catalogue has a DEAL domain with the same keys, so the Administrator can relabel them', () => {
    expect(isStatusDomain('DEAL')).toBe(true);
    expect(catalogueKeys(StatusDomain.Deal)).toEqual(Object.values(DealStage));
    for (const entry of STATUS_CATALOGUE[StatusDomain.Deal]) {
      expect(entry.labelSq).not.toBe('');
      expect(entry.labelEn).not.toBe('');
      expect(entry.colour).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(STATUS_CATALOGUE[StatusDomain.Deal].map((entry) => entry.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
