import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FollowUpsContent } from './FollowUpsContent';
import { followUpService } from '../../services/followUpService';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../../components/ui/Toast';
import type { FollowUp } from '../../types/followUp';

vi.mock('../../services/followUpService', () => ({
  followUpService: { mine: vi.fn(), list: vi.fn(), reschedule: vi.fn(), cancel: vi.fn(), reassign: vi.fn(), complete: vi.fn() },
}));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({
    staff: [
      { id: 'u-a', email: 'a@example.com', role: 'STAFF', firstName: 'Besa', lastName: 'Test', isActive: true },
      { id: 'u-b', email: 'b@example.com', role: 'STAFF', firstName: 'Dritan', lastName: 'Test', isActive: true },
    ],
    fetchStaff: vi.fn(),
  }),
}));

const followUp = (id: string, overrides: Partial<FollowUp> = {}): FollowUp => ({
  id,
  clientId: 'c1',
  companyName: `Company ${id}`,
  dealId: null,
  dealTitle: null,
  dealType: null,
  contactPersonId: null,
  contactName: null,
  assignedUserId: 'u-a',
  assignedUserName: 'Besa Test',
  type: 'CALL',
  status: 'SCHEDULED',
  scheduledAt: '2026-10-08T07:00:00Z',
  notes: null,
  intervalDays: 3,
  completedInteractionId: null,
  cancelReason: null,
  isOverdue: false,
  history: [],
  createdAt: '2026-10-05T08:00:00Z',
  updatedAt: '2026-10-05T08:00:00Z',
  ...overrides,
});

const signIn = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions },
    isAuthenticated: true,
  } as any);

const renderPage = (path = '/acme/follow-ups') =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:tenantSlug/follow-ups" element={<FollowUpsContent />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const group = (name: RegExp) => screen.getByRole('region', { name });

describe('My follow-ups (FR-FUP-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ 'calendar.view': 'OWN', 'followups.manage': 'OWN' });
    vi.mocked(followUpService.mine).mockResolvedValue({
      overdue: [followUp('late', { isOverdue: true, scheduledAt: '2026-10-01T07:00:00Z', notes: 'Send the offer' })],
      today: [followUp('now')],
      upcoming: [followUp('later'), followUp('much-later')],
    });
  });

  it('FR-FUP-07 groups the open follow-ups as Overdue, Today and Upcoming', async () => {
    renderPage();
    expect(await screen.findByText('Company late')).toBeInTheDocument();
    expect(within(group(/^Overdue/)).getByText('Company late')).toBeInTheDocument();
    expect(within(group(/^Today/)).getByText('Company now')).toBeInTheDocument();
    expect(within(group(/^Upcoming/)).getAllByText(/^Company /)).toHaveLength(2);
  });

  it('FR-FUP-05 an overdue follow-up is marked overdue and shown in red', async () => {
    renderPage();
    const late = (await screen.findByText('Company late')).closest('li')!;
    expect(late).toHaveAttribute('data-overdue', 'true');
    expect(within(late).getByText('Overdue')).toBeInTheDocument();
    expect((await screen.findByText('Company now')).closest('li')).not.toHaveAttribute('data-overdue');
  });

  it('FR-FUP-06 cancelling needs a reason and sends it', async () => {
    vi.mocked(followUpService.cancel).mockResolvedValue(followUp('now', { status: 'CANCELLED' }));
    renderPage();
    const now = (await screen.findByText('Company now')).closest('li')!;
    fireEvent.click(within(now).getByRole('button', { name: 'Cancel follow-up' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel follow-up' }));
    expect(await within(dialog).findByText('Give a reason.')).toBeInTheDocument();
    expect(followUpService.cancel).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Closed for the season' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel follow-up' }));
    await waitFor(() => expect(followUpService.cancel).toHaveBeenCalledWith('acme', 'now', 'Closed for the season'));
  });

  it('FR-FUP-07 says so when there is nothing open', async () => {
    vi.mocked(followUpService.mine).mockResolvedValue({ overdue: [], today: [], upcoming: [] });
    renderPage();
    expect(await screen.findByText(/No open follow-ups/)).toBeInTheDocument();
  });
});

describe('The team\'s follow-ups (FR-FUP-08, 10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(followUpService.mine).mockResolvedValue({ overdue: [], today: [], upcoming: [] });
    vi.mocked(followUpService.list).mockResolvedValue([
      followUp('a1', { isOverdue: true }),
      followUp('b1', { assignedUserId: 'u-b', assignedUserName: 'Dritan Test', isOverdue: true }),
    ]);
  });

  it('FR-FUP-08 the Sales Manager sees each salesperson\'s follow-ups, filtered by salesperson and to the overdue ones', async () => {
    signIn({ 'calendar.view': 'TEAM', 'followups.manage': 'TEAM' });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Team/ }));
    expect(await screen.findByText('For Dritan Test')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Salesperson' }), { target: { value: 'u-b' } });
    await waitFor(() => expect(followUpService.list).toHaveBeenLastCalledWith('acme', { assignedUserId: 'u-b', overdueOnly: false }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Overdue only' }));
    await waitFor(() => expect(followUpService.list).toHaveBeenLastCalledWith('acme', { assignedUserId: 'u-b', overdueOnly: true }));
  });

  it('FR-FUP-10 the Sales Manager reassigns a follow-up to another salesperson', async () => {
    signIn({ 'calendar.view': 'TEAM', 'followups.manage': 'TEAM' });
    vi.mocked(followUpService.reassign).mockResolvedValue(followUp('a1', { assignedUserId: 'u-b', assignedUserName: 'Dritan Test' }));
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Team/ }));
    const item = (await screen.findByText('Company a1')).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Reassign' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Salesperson' }), { target: { value: 'u-b' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }));
    await waitFor(() => expect(followUpService.reassign).toHaveBeenCalledWith('acme', 'a1', 'u-b'));
  });

  it('FR-FUP-08 the CEO sees the same, read-only: no actions', async () => {
    signIn({ 'calendar.view': 'ALL' });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Team/ }));
    expect(await screen.findByText('Company b1')).toBeInTheDocument();
    expect(screen.getByText("You can see the team's follow-ups but not change them.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reassign' })).not.toBeInTheDocument();
  });

  it('FR-FUP-08 a Sales User has no team tab', async () => {
    signIn({ 'calendar.view': 'OWN', 'followups.manage': 'OWN' });
    renderPage();
    await waitFor(() => expect(followUpService.mine).toHaveBeenCalled());
    expect(screen.queryByRole('tab', { name: /Team/ })).not.toBeInTheDocument();
  });
});
