import { GetCalendarUseCase, CALENDAR_LIST_LIMIT, InvalidCalendarRangeError } from '../../../../../src/appointments/application/calendar/GetCalendarUseCase';
import { CalendarItem } from '../../../../../src/appointments/application/calendar/calendarViews';
import { ICalendarStore } from '../../../../../src/appointments/application/calendar/ports/ICalendarStore';
import { administrator, salesUser, scopeResolver } from '../../../../support/access';

const NOW = new Date('2026-10-05T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const item = (overrides: Partial<CalendarItem> = {}): Omit<CalendarItem, 'isOverdue'> => ({
  id: 'a1',
  kind: 'PLANNED',
  type: 'MEETING',
  status: 'SCHEDULED' as any,
  scheduledAt: '2026-10-06T09:00:00.000Z',
  endAt: null,
  place: null,
  notes: null,
  clientId: 'c1',
  companyName: 'Kafe Blloku',
  dealId: null,
  dealTitle: null,
  dealType: null,
  contactPersonId: null,
  contactName: null,
  assignedUserId: 'u1',
  assignedUserName: 'Besa Test',
  ...overrides,
});

describe('GetCalendarUseCase (M2 Slice 12)', () => {
  let store: jest.Mocked<ICalendarStore>;
  let useCase: GetCalendarUseCase;
  const from = new Date('2026-10-05T00:00:00Z');
  const to = new Date('2026-10-06T00:00:00Z');

  beforeEach(() => {
    store = { inRange: jest.fn().mockResolvedValue([]), openBefore: jest.fn().mockResolvedValue([]), contractDates: jest.fn().mockResolvedValue([]) };
    useCase = new GetCalendarUseCase(store, scopeResolver(), () => NOW);
  });

  it('FR-CAL-04 the overdue list is everything open before the range and before now', async () => {
    await useCase.execute({ access: administrator(), tenantId: 't1', from, to });
    // The range starts today, before now: overdue is what is before it.
    expect(store.openBefore.mock.calls[0][3]).toEqual(from);
  });

  it('FR-CAL-04 looking at a later week still lists what is overdue up to now, not up to that week', async () => {
    const nextWeek = new Date(NOW.getTime() + 7 * DAY);
    await useCase.execute({ access: administrator(), tenantId: 't1', from: nextWeek, to: new Date(nextWeek.getTime() + 7 * DAY) });
    expect(store.openBefore.mock.calls[0][3]).toEqual(NOW);
  });

  it('marks an open item past its time as overdue and a completed one as not', async () => {
    store.inRange.mockResolvedValue([
      item({ id: 'open-past', scheduledAt: '2026-10-05T08:00:00.000Z' }),
      item({ id: 'open-later', scheduledAt: '2026-10-05T15:00:00.000Z' }),
      item({ id: 'done', scheduledAt: '2026-10-05T07:00:00.000Z', status: 'COMPLETED' as any }),
    ]);
    const feed = await useCase.execute({ access: administrator(), tenantId: 't1', from, to });
    expect(Object.fromEntries(feed.items.map((entry) => [entry.id, entry.isOverdue]))).toEqual({ 'open-past': true, 'open-later': false, done: false });
  });

  it('cuts a list at the limit and says so', async () => {
    store.inRange.mockResolvedValue(Array.from({ length: CALENDAR_LIST_LIMIT + 1 }, (_, i) => item({ id: `i${i}` })));
    store.openBefore.mockResolvedValue([item()]);
    const feed = await useCase.execute({ access: administrator(), tenantId: 't1', from, to });
    expect(feed.items).toHaveLength(CALENDAR_LIST_LIMIT);
    expect(feed.itemsTruncated).toBe(true);
    expect(feed.overdueTruncated).toBe(false);
  });

  it('refuses a reversed, empty or oversized range', async () => {
    await expect(useCase.execute({ access: administrator(), tenantId: 't1', from: to, to: from })).rejects.toThrow(InvalidCalendarRangeError);
    await expect(useCase.execute({ access: administrator(), tenantId: 't1', from, to: from })).rejects.toThrow(InvalidCalendarRangeError);
    await expect(useCase.execute({ access: administrator(), tenantId: 't1', from, to: new Date(from.getTime() + 63 * DAY) })).rejects.toThrow(InvalidCalendarRangeError);
    expect(store.inRange).not.toHaveBeenCalled();
  });

  it('FR-RBAC-13 hands the store the caller\'s scope: a Sales User gets their own, in the query', async () => {
    await useCase.execute({ access: salesUser({ userId: 'u1' }), tenantId: 't1', from, to });
    const scope = store.inRange.mock.calls[0][1];
    expect(scope).not.toBe('ALL');
    expect(JSON.stringify(scope)).toContain('u1');
  });

  describe('contract end and renewal dates (M3 Slice 11, FR-REN-11)', () => {
    it('FR-REN-11 reads the contract dates at the contract scope and for the workspace days the range covers', async () => {
      await useCase.execute({
        access: salesUser({ userId: 'u1' }), tenantId: 't1', timezone: 'Europe/Tirane',
        from: new Date('2026-10-04T22:00:00Z'), to: new Date('2026-10-05T22:00:00Z'),
      });
      const [, scope, filters, fromDay, toDay] = store.contractDates.mock.calls[0];
      expect(JSON.stringify(scope)).toContain('u1');
      expect(filters.kinds).toEqual(['CONTRACT_END', 'CONTRACT_RENEWAL']);
      // Midnight in Tirane to midnight: the one day, 5 October, so the range stops before the 6th.
      expect([fromDay, toDay]).toEqual(['2026-10-05', '2026-10-06']);
    });

    it('FR-REN-11 returns the items in the feed, apart from the appointments, and none are overdue-marked', async () => {
      const contractItem = { id: 'k1:END', kind: 'CONTRACT_END' as const, date: '2026-10-05', contractId: 'k1', number: 'CTR-2026-0001', contractStatus: 'ACTIVE', clientId: 'c1', companyName: 'Kafe Blloku', assignedUserId: 'u1', assignedUserName: 'Besa Test' };
      store.contractDates.mockResolvedValue([contractItem]);
      const feed = await useCase.execute({ access: administrator(), tenantId: 't1', from, to });
      expect(feed.contractItems).toEqual([contractItem]);
      expect(feed.items).toEqual([]);
    });

    it('a viewer without contracts.validity.view gets no contract items and no read of them', async () => {
      const access = salesUser({ userId: 'u1', revoke: ['contracts.validity.view'] });
      expect(access.can('contracts.validity.view')).toBe(false);
      const feed = await useCase.execute({ access, tenantId: 't1', from, to });
      expect(store.contractDates).not.toHaveBeenCalled();
      expect(feed.contractItems).toEqual([]);
    });

    it('asking for contract kinds alone does not read the appointments, and the reverse', async () => {
      await useCase.execute({ access: administrator(), tenantId: 't1', from, to, kinds: ['CONTRACT_END'] });
      expect(store.inRange).not.toHaveBeenCalled();
      expect(store.contractDates.mock.calls[0][2].kinds).toEqual(['CONTRACT_END']);

      store.contractDates.mockClear();
      await useCase.execute({ access: administrator(), tenantId: 't1', from, to, kinds: ['FOLLOW_UP'] });
      expect(store.inRange).toHaveBeenCalledTimes(1);
      expect(store.contractDates).not.toHaveBeenCalled();
    });

    it('asking for activity types asks for activities only', async () => {
      await useCase.execute({ access: administrator(), tenantId: 't1', from, to, types: ['CALL'] });
      expect(store.contractDates).not.toHaveBeenCalled();
    });
  });
});
