import { dealMarkers, InvalidSalesSettingsError, SalesSettings } from '../../../src/deals/domain/SalesSettings';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-05T10:00:00Z');

describe('SalesSettings and the deal markers (M2 Slice 11)', () => {
  it('FR-DEAL-12 a workspace starts at 14 days, and the Administrator sets 1 to 365', () => {
    const settings = SalesSettings.defaults('tenant-1');
    expect(settings.staleDealDays).toBe(14);
    expect(settings.with({ staleDealDays: 30 }).staleDealDays).toBe(30);
    expect(() => settings.with({ staleDealDays: 0 })).toThrow(InvalidSalesSettingsError);
    expect(() => settings.with({ staleDealDays: 366 })).toThrow(InvalidSalesSettingsError);
    expect(() => settings.with({ staleDealDays: 2.5 })).toThrow(InvalidSalesSettingsError);
  });

  it('FR-DEAL-12 a follow-up due yesterday marks an open deal overdue', () => {
    const markers = dealMarkers({ isOpen: true, nextFollowUpAt: new Date(NOW.getTime() - DAY), lastActivityAt: NOW, staleDealDays: 14, now: NOW });
    expect(markers).toEqual({ hasOverdueFollowUp: true, isStale: false });
  });

  it('FR-DEAL-12 no activity for more than the configured days marks an open deal stale', () => {
    const quiet = (days: number) =>
      dealMarkers({ isOpen: true, nextFollowUpAt: null, lastActivityAt: new Date(NOW.getTime() - days * DAY), staleDealDays: 14, now: NOW });
    expect(quiet(13).isStale).toBe(false);
    expect(quiet(15).isStale).toBe(true);
  });

  it('FR-DEAL-12 a won or lost deal is never highlighted', () => {
    const markers = dealMarkers({
      isOpen: false,
      nextFollowUpAt: new Date(NOW.getTime() - DAY),
      lastActivityAt: new Date(NOW.getTime() - 90 * DAY),
      staleDealDays: 14,
      now: NOW,
    });
    expect(markers).toEqual({ hasOverdueFollowUp: false, isStale: false });
  });
});
