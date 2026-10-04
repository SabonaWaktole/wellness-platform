import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, createEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarContent } from './CalendarContent';
import { calendarService } from '../../services/calendarService';
import { appointmentService } from '../../services/appointmentService';
import { followUpService } from '../../services/followUpService';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../../components/ui/Toast';
import type { CalendarFeed, CalendarItem } from '../../types/calendar';

vi.mock('../../services/calendarService', () => ({ calendarService: { feed: vi.fn() } }));
vi.mock('../../services/appointmentService', () => ({
  appointmentService: { rescheduleAppointment: vi.fn(), updateAppointmentStatus: vi.fn(), cancelAppointment: vi.fn() },
}));
vi.mock('../../services/statusLabelService', () => ({ statusLabelService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/followUpService', () => ({ followUpService: { reschedule: vi.fn(), get: vi.fn() } }));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({
    staff: [
      { id: 'u-a', email: 'a@example.com', role: 'STAFF', firstName: 'Besa', lastName: 'Test', isActive: true },
      { id: 'u-b', email: 'b@example.com', role: 'STAFF', firstName: 'Dritan', lastName: 'Test', isActive: true },
    ],
    fetchStaff: vi.fn(),
  }),
}));

// Wednesday 7 October 2026, 12:00 in Tirane (UTC+2 until the 25th).
const NOW = new Date('2026-10-07T10:00:00Z');

const item = (id: string, overrides: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  kind: 'PLANNED',
  type: 'MEETING',
  status: 'SCHEDULED',
  scheduledAt: '2026-10-07T08:00:00.000Z',
  endAt: '2026-10-07T09:00:00.000Z',
  place: null,
  notes: null,
  clientId: 'c1',
  companyName: `Company ${id}`,
  dealId: null,
  dealTitle: null,
  dealType: null,
  contactPersonId: null,
  contactName: null,
  assignedUserId: 'u-a',
  assignedUserName: 'Besa Test',
  isOverdue: false,
  ...overrides,
});

const feedOf = (items: CalendarItem[] = [], overdue: CalendarItem[] = []): CalendarFeed => ({
  from: '',
  to: '',
  items,
  itemsTruncated: false,
  overdue,
  overdueTruncated: false,
});

const signIn = (permissions: Record<string, string | boolean>, locale = 'en-US') =>
  useAuthStore.setState({
    user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', tenantLocale: locale, tenantTimezone: 'Europe/Tirane', permissions },
    isAuthenticated: true,
  } as any);

const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;

const renderCalendar = (search = '') =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/acme/appointments${search}`]}>
        <Routes>
          <Route
            path="/:tenantSlug/appointments"
            element={
              <>
                <CalendarContent />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const lastFeedCall = () => vi.mocked(calendarService.feed).mock.calls.at(-1)![1];

describe('Sales calendar (M2 Slice 12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    signIn({ 'calendar.view': 'OWN', 'activities.add': 'OWN', 'followups.manage': 'OWN' });
    vi.mocked(calendarService.feed).mockResolvedValue(feedOf());
  });
  afterEach(() => vi.useRealTimers());

  describe('the visible range (the fixed-window bug)', () => {
    it('FR-CAL-01 asks the server for the month on screen, with its leading and trailing days, in the workspace zone', async () => {
      renderCalendar();
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalled());
      // 1 Oct 2026 is a Thursday: the grid runs from Monday 28 Sep to Sunday 1 Nov.
      expect(lastFeedCall()).toMatchObject({ from: '2026-09-27T22:00:00.000Z', to: '2026-11-01T23:00:00.000Z' });
    });

    it('FR-CAL-01 navigating refetches for the new range, and so does changing the view', async () => {
      renderCalendar();
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalledTimes(2));
      // November 2026 starts on a Sunday and ends on a Monday: Monday 26 Oct (the clocks changed on
      // the 25th) to Sunday 6 Dec, six weeks.
      expect(lastFeedCall()).toMatchObject({ from: '2026-10-25T23:00:00.000Z', to: '2026-12-06T23:00:00.000Z' });
      expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Week' }));
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalledTimes(3));
      expect(new Date(lastFeedCall().to).getTime() - new Date(lastFeedCall().from).getTime()).toBe(7 * 24 * 3600 * 1000);

      fireEvent.click(screen.getByRole('button', { name: 'Today' }));
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalledTimes(4));
      expect(lastFeedCall().from).toBe('2026-10-04T22:00:00.000Z'); // Monday 5 October, 00:00 in Tirane
    });

    it('keeps the view and the day in the address, so a link or a reload lands on the same screen', async () => {
      renderCalendar('?view=week&date=2026-10-14');
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalled());
      expect(lastFeedCall().from).toBe('2026-10-11T22:00:00.000Z'); // Monday 12 October
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('date=2026-10-21'));
      expect(screen.getByTestId('where').textContent).toContain('view=week');
    });
  });

  describe('language and zone (FR-CAL-08, FR-LNG-04)', () => {
    it('FR-LNG-04 renders the month heading and the weekday names in the workspace locale, not the browser default', async () => {
      signIn({ 'calendar.view': 'OWN' }, 'de-DE');
      renderCalendar();
      expect(await screen.findByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument();
      // The grid opens on Monday 28 September.
      const monday = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' }).format(new Date('2026-09-28T12:00:00Z'));
      expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent(monday);
      expect(monday).not.toBe('Mon');
    });

    it('FR-CAL-08 draws an item on the day and at the time it has in the workspace zone', async () => {
      // 22:30 UTC on the 7th is 00:30 on the 8th in Tirane.
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('late', { scheduledAt: '2026-10-07T22:30:00.000Z', endAt: null })]));
      renderCalendar('?view=week');
      const chip = await screen.findByRole('button', { name: /Company late/ });
      expect(chip.closest('[data-day]')).toHaveAttribute('data-day', '2026-10-08');
      expect(chip).toHaveTextContent('12:30 AM');
    });
  });

  describe('the views (FR-CAL-01)', () => {
    const mixed = () =>
      feedOf([
        item('follow', { kind: 'FOLLOW_UP', type: 'CALL', scheduledAt: '2026-10-07T07:00:00.000Z', endAt: null }),
        item('visit', { type: 'VISIT', place: 'Rruga e Kavajës 12', scheduledAt: '2026-10-07T11:00:00.000Z', endAt: '2026-10-07T12:00:00.000Z' }),
        item('online', { type: 'ONLINE_MEETING', scheduledAt: '2026-10-08T07:00:00.000Z' }),
      ]);

    it('the agenda lists the days that have items, each with its type, company, place and time', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(mixed());
      renderCalendar('?view=agenda');
      const wed = await screen.findByRole('region', { name: /Wednesday, October 7/ });
      expect(within(wed).getByText(/Call · Company follow/)).toBeInTheDocument();
      expect(within(wed).getByText('Follow-up', { exact: false })).toBeInTheDocument();
      const visit = within(wed).getByText(/Visit · Company visit/).closest('button')!;
      expect(visit).toHaveTextContent('Rruga e Kavajës 12');
      expect(visit).toHaveTextContent('2:00 PM');
      expect(screen.getByRole('region', { name: /Thursday, October 8/ })).toBeInTheDocument();
    });

    it('each type has its own colour, and a follow-up is told from a planned item', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(mixed());
      renderCalendar('?view=week');
      const call = await screen.findByRole('button', { name: /Company follow/ });
      const visit = screen.getByRole('button', { name: /Company visit/ });
      expect(call.className).toContain('type-CALL');
      expect(visit.className).toContain('type-VISIT');
      expect(call).toHaveAttribute('data-kind', 'FOLLOW_UP');
      expect(visit).toHaveAttribute('data-kind', 'PLANNED');
    });

    it('the month shows what is on each day and "+N more" beyond three', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(
        feedOf(Array.from({ length: 5 }, (_, i) => item(`m${i}`, { scheduledAt: `2026-10-07T0${i + 5}:00:00.000Z`, endAt: null })))
      );
      renderCalendar();
      expect(await screen.findByRole('button', { name: /Company m0/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Company m4/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '+2 more' }));
      await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('view=day'));
      expect(await screen.findByRole('button', { name: /Company m4/ })).toBeInTheDocument();
    });
  });

  describe('overdue (FR-CAL-04)', () => {
    const late = item('late', { kind: 'FOLLOW_UP', type: 'CALL', scheduledAt: '2026-09-30T07:00:00.000Z', endAt: null, isOverdue: true });

    it('FR-CAL-04 lists an overdue follow-up at the top of today\'s day view, in red, with the day it was due', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([], [late]));
      renderCalendar('?view=day');
      const section = await screen.findByTestId('calendar-overdue');
      expect(within(section).getByRole('heading', { name: /Overdue/ })).toBeInTheDocument();
      const row = within(section).getByText(/Call · Company late/).closest('button')!;
      expect(row).toHaveAttribute('data-overdue');
      expect(row).toHaveTextContent('09/30/2026');
    });

    it('FR-CAL-04 and in the agenda, but not on another day, in the week or in the month', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([], [late]));
      const { unmount } = renderCalendar('?view=agenda');
      expect(await screen.findByTestId('calendar-overdue')).toBeInTheDocument();
      unmount();

      for (const search of ['?view=day&date=2026-10-20', '?view=week', '']) {
        const view = renderCalendar(search);
        await waitFor(() => expect(calendarService.feed).toHaveBeenCalled());
        expect(screen.queryByTestId('calendar-overdue')).not.toBeInTheDocument();
        view.unmount();
      }
    });

    it('an overdue item that falls inside the range is red where it stands', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('earlier', { scheduledAt: '2026-10-07T06:00:00.000Z', isOverdue: true })]));
      renderCalendar('?view=week');
      const chip = await screen.findByRole('button', { name: /Company earlier/ });
      expect(chip).toHaveAttribute('data-overdue');
      expect(chip).toHaveTextContent('Overdue');
    });
  });

  describe('the team (FR-CAL-05, 06)', () => {
    it('FR-CAL-05 the Sales Manager picks salespeople, each with a colour, and the feed follows', async () => {
      signIn({ 'calendar.view': 'TEAM', 'activities.add': 'TEAM', 'followups.manage': 'TEAM' });
      renderCalendar();
      const group = await screen.findByRole('group', { name: 'Salespeople' });
      expect(within(group).getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(within(group).getByRole('button', { name: 'Besa Test' }));
      fireEvent.click(within(group).getByRole('button', { name: 'Dritan Test' }));
      await waitFor(() => expect(lastFeedCall().userIds).toEqual(['u-a', 'u-b']));
      expect(screen.getByTestId('where').textContent).toContain('users=u-a%2Cu-b');

      const colours = ['Besa Test', 'Dritan Test'].map((name) => within(group).getByRole('button', { name }).getAttribute('style'));
      expect(new Set(colours).size).toBe(2);

      fireEvent.click(within(group).getByRole('button', { name: 'Everyone' }));
      await waitFor(() => expect(lastFeedCall().userIds).toEqual([]));
    });

    it('FR-CAL-05 an item carries its salesperson\'s name and colour in the team view', async () => {
      signIn({ 'calendar.view': 'TEAM', 'activities.add': 'TEAM' });
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('b', { assignedUserId: 'u-b', assignedUserName: 'Dritan Test' })]));
      renderCalendar('?view=agenda&date=2026-10-07');
      const row = (await screen.findByText(/Meeting · Company b/)).closest('button')!;
      expect(row).toHaveTextContent('Dritan Test');
      expect(row.getAttribute('style')).toContain('--bar-colour');
    });

    it('FR-CAL-05 a Sales User has no team filter, and a filter in the address is ignored', async () => {
      renderCalendar('?users=u-b');
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalled());
      expect(screen.queryByRole('group', { name: 'Salespeople' })).not.toBeInTheDocument();
      expect(lastFeedCall().userIds).toEqual([]);
    });

    it('FR-CAL-06 the CEO sees the calendar, with no create button and a notice that it is read-only', async () => {
      signIn({ 'calendar.view': 'ALL' });
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('a')]));
      renderCalendar('?view=agenda&date=2026-10-07');
      expect(await screen.findByText(/Meeting · Company a/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Plan an activity' })).not.toBeInTheDocument();
      expect(screen.getByText('You can see this calendar, but not change it.')).toBeInTheDocument();
    });

    it('FR-CAL-06 and nothing on the CEO\'s time grid can be dragged', async () => {
      signIn({ 'calendar.view': 'ALL' });
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('a')]));
      renderCalendar('?view=week');
      const chip = await screen.findByRole('button', { name: /Company a/ });
      expect(chip.parentElement).not.toHaveAttribute('draggable', 'true');
    });
  });

  describe('planning (FR-CAL-02)', () => {
    it('FR-CAL-02 the Plan button opens the planning dialog, and so does ?plan=1 from the dashboard', async () => {
      const { unmount } = renderCalendar();
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: 'Plan an activity' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      unmount();

      renderCalendar('?plan=1');
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('where').textContent).not.toContain('plan=1');
    });
  });

  describe('drag to reschedule (FR-CAL-07)', () => {
    // jsdom has no DragEvent, so the pointer position is put on the event by hand. The grid reads it
    // against the column's top, which jsdom reports as 0: clientY is the pixels down the grid (48 an hour).
    const dragEvent = (create: typeof createEvent.drop, target: HTMLElement, clientY: number, dataTransfer: object) => {
      const event = create(target, { dataTransfer });
      Object.defineProperty(event, 'clientY', { value: clientY });
      fireEvent(target, event);
    };
    const drop = (from: HTMLElement, column: HTMLElement, clientY: number) => {
      const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
      dragEvent(createEvent.dragStart, from, 0, dataTransfer);
      dragEvent(createEvent.dragOver, column, clientY, dataTransfer);
      dragEvent(createEvent.drop, column, clientY, dataTransfer);
    };

    it('FR-CAL-07 dropping a planned item on 14:00 reschedules it there, in the workspace zone', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('a')]));
      vi.mocked(appointmentService.rescheduleAppointment).mockResolvedValue({} as any);
      renderCalendar('?view=week');
      const chip = await screen.findByRole('button', { name: /Company a/ });
      expect(chip.parentElement).toHaveAttribute('draggable', 'true');
      const column = chip.closest('[data-day]') as HTMLElement;

      drop(chip.parentElement!, column, 14 * 48);

      await waitFor(() => expect(appointmentService.rescheduleAppointment).toHaveBeenCalled());
      // 14:00 in Tirane on Wednesday 7 October is 12:00 UTC.
      expect(appointmentService.rescheduleAppointment).toHaveBeenCalledWith('acme', 'a', { newDate: '2026-10-07T12:00:00.000Z' });
      // The view refetches to show where it is now.
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalledTimes(2));
    });

    it('FR-CAL-07 snaps to 15 minutes', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('a')]));
      vi.mocked(appointmentService.rescheduleAppointment).mockResolvedValue({} as any);
      renderCalendar('?view=week');
      const chip = await screen.findByRole('button', { name: /Company a/ });
      // 14:07 -> 14:00, and 14:08 -> 14:15 (one pixel is 1.25 minutes at 48 px an hour).
      drop(chip.parentElement!, chip.closest('[data-day]') as HTMLElement, (14 * 60 + 8) * 0.8);
      await waitFor(() => expect(appointmentService.rescheduleAppointment).toHaveBeenCalledWith('acme', 'a', { newDate: '2026-10-07T12:15:00.000Z' }));
    });

    it('FR-CAL-07 a follow-up moves through its own rules, with the day and the time', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('f', { kind: 'FOLLOW_UP', type: 'CALL', endAt: null })]));
      vi.mocked(followUpService.reschedule).mockResolvedValue({} as any);
      renderCalendar('?view=week');
      const chip = await screen.findByRole('button', { name: /Company f/ });
      const target = (chip.closest('.dayColumn') ?? chip.closest('[data-day]')!.parentElement!.querySelector('[data-day="2026-10-08"]')) as HTMLElement;
      drop(chip.parentElement!, target, 9 * 48);
      await waitFor(() => expect(followUpService.reschedule).toHaveBeenCalledWith('acme', 'f', { dueDate: '2026-10-08', time: '09:00', reason: null }));
      expect(appointmentService.rescheduleAppointment).not.toHaveBeenCalled();
    });

    it('FR-CAL-07 a completed item cannot be dragged', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('done', { status: 'COMPLETED' })]));
      renderCalendar('?view=week');
      const chip = await screen.findByRole('button', { name: /Company done/ });
      expect(chip.parentElement).not.toHaveAttribute('draggable', 'true');
    });

    it('FR-CAL-07 a Sales User can drag planned items but not follow-ups they may not manage', async () => {
      signIn({ 'calendar.view': 'OWN', 'activities.add': 'OWN' });
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('p'), item('f', { kind: 'FOLLOW_UP', type: 'CALL', scheduledAt: '2026-10-07T10:00:00.000Z', endAt: null })]));
      renderCalendar('?view=week');
      expect((await screen.findByRole('button', { name: /Company p/ })).parentElement).toHaveAttribute('draggable', 'true');
      expect(screen.getByRole('button', { name: /Company f/ }).parentElement).not.toHaveAttribute('draggable', 'true');
    });

    it('a failed move says so and the item stays where the server has it', async () => {
      vi.mocked(calendarService.feed).mockResolvedValue(feedOf([item('a')]));
      vi.mocked(appointmentService.rescheduleAppointment).mockRejectedValue({ response: { data: { error: 'Appointment is in terminal state: CANCELLED' } } });
      renderCalendar('?view=week');
      const chip = await screen.findByRole('button', { name: /Company a/ });
      drop(chip.parentElement!, chip.closest('[data-day]') as HTMLElement, 14 * 48);
      expect(await screen.findByText('Appointment is in terminal state: CANCELLED')).toBeInTheDocument();
      await waitFor(() => expect(calendarService.feed).toHaveBeenCalledTimes(2));
    });
  });

  it('shows what went wrong when the calendar cannot be loaded, and does not draw the old range\'s items on the new days', async () => {
    vi.mocked(calendarService.feed).mockResolvedValueOnce(feedOf([item('a')])).mockRejectedValueOnce({ response: { data: { error: 'Boom' } } });
    renderCalendar('?view=agenda&date=2026-10-07');
    expect(await screen.findByText(/Meeting · Company a/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    expect(screen.queryByText(/Meeting · Company a/)).not.toBeInTheDocument();
  });

  it('says it is loading while a new range is on its way', async () => {
    let finish: (feed: CalendarFeed) => void = () => undefined;
    vi.mocked(calendarService.feed).mockResolvedValueOnce(feedOf()).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    renderCalendar();
    await waitFor(() => expect(calendarService.feed).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Loading calendar...')).toBeInTheDocument();
    finish(feedOf());
    await waitFor(() => expect(screen.queryByText('Loading calendar...')).not.toBeInTheDocument());
  });

  it('says when a long range was cut', async () => {
    vi.mocked(calendarService.feed).mockResolvedValue({ ...feedOf([item('a')]), itemsTruncated: true });
    renderCalendar();
    expect(await screen.findByText(/Only the first items are shown/)).toBeInTheDocument();
  });
});
