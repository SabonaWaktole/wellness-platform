import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppointmentDetailPanel } from './AppointmentDetailPanel';
import { appointmentService } from '../../../services/appointmentService';
import { clientService } from '../../../services/clientService';
import { followUpService } from '../../../services/followUpService';
import { useAuthStore } from '../../../store/useAuthStore';
import { ToastProvider } from '../../ui/Toast';
import type { CalendarItem } from '../../../types/calendar';
import type { FollowUp } from '../../../types/followUp';

vi.mock('../../../services/statusLabelService', () => ({ statusLabelService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../../services/appointmentService', () => ({
  appointmentService: { updateAppointmentStatus: vi.fn(), cancelAppointment: vi.fn(), rescheduleAppointment: vi.fn() },
}));
vi.mock('../../../services/clientService', () => ({ clientService: { getClient: vi.fn() } }));
vi.mock('../../../services/followUpService', () => ({
  followUpService: { get: vi.fn(), complete: vi.fn(), reschedule: vi.fn(), cancel: vi.fn() },
}));
// The real dialog is the activity form (its own tests); here it is the seam where the activity gets saved.
vi.mock('../../activities/ActivityDialog', () => ({
  ActivityDialog: ({ isOpen, completing, contacts, onSaved }: any) =>
    isOpen ? (
      <div data-testid="activity-dialog">
        <span>{`completing ${completing?.id}`}</span>
        <span>{`contacts ${contacts.map((c: any) => c.name).join(',')}`}</span>
        <button onClick={() => onSaved({ id: 'activity-1' })}>{'Save the activity'}</button>
      </div>
    ) : null,
}));

const item = (overrides: Partial<CalendarItem> = {}): CalendarItem => ({
  id: 'it-1',
  kind: 'PLANNED',
  type: 'VISIT',
  status: 'SCHEDULED',
  scheduledAt: '2026-10-08T07:00:00.000Z',
  endAt: '2026-10-08T08:00:00.000Z',
  place: 'Rruga e Kavajës 12',
  notes: 'Bring the price sheet',
  clientId: 'c1',
  companyName: 'Kafe Blloku',
  dealId: 'd1',
  dealTitle: null,
  dealType: 'NEW_CONTRACT',
  contactPersonId: 'p1',
  contactName: 'Elira Hoxha',
  assignedUserId: 'u-a',
  assignedUserName: 'Besa Test',
  isOverdue: false,
  ...overrides,
});

const followUp = (overrides: Partial<FollowUp> = {}): FollowUp => ({
  id: 'fu-1',
  clientId: 'c1',
  companyName: 'Kafe Blloku',
  dealId: 'd1',
  dealTitle: null,
  dealType: 'NEW_CONTRACT',
  contactPersonId: 'p1',
  contactName: 'Elira Hoxha',
  assignedUserId: 'u-a',
  assignedUserName: 'Besa Test',
  type: 'CALL',
  status: 'SCHEDULED',
  scheduledAt: '2026-10-08T07:00:00.000Z',
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
    user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', tenantLocale: 'en-US', tenantTimezone: 'Europe/Tirane', permissions },
    isAuthenticated: true,
  } as any);

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;

const renderPanel = (props: Partial<React.ComponentProps<typeof AppointmentDetailPanel>> = {}) => {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const onEdit = vi.fn();
  const view = render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/appointments']}>
        <Routes>
          <Route
            path="/:tenantSlug/appointments"
            element={
              <>
                <AppointmentDetailPanel isOpen onClose={onClose} item={item()} onChanged={onChanged} onEdit={onEdit} {...props} />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
  return { onClose, onChanged, onEdit, unmount: view.unmount };
};

/** The panel is a dialog too; the modal a button opens is the one on top. */
const openedModal = async () => {
  await waitFor(() => expect(screen.getAllByRole('dialog').length).toBeGreaterThan(1));
  return screen.getAllByRole('dialog').at(-1)!;
};

describe('the calendar item panel (M2 Slice 12, FR-CAL-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ 'calendar.view': 'OWN', 'activities.add': 'OWN', 'followups.manage': 'OWN' });
    vi.mocked(followUpService.get).mockResolvedValue(followUp());
    vi.mocked(clientService.getClient).mockResolvedValue({ id: 'c1', contacts: [{ id: 'p1', name: 'Elira Hoxha' }] } as any);
  });

  it('FR-CAL-03 shows the item\'s details: type, company, deal, contact, salesperson, date, time range, place and note', () => {
    renderPanel();
    expect(screen.getByText('Visit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kafe Blloku' })).toHaveAttribute('href', '/acme/clients/c1');
    expect(screen.getByRole('link', { name: /Kafe Blloku – / })).toHaveAttribute('href', '/acme/deals/d1');
    expect(screen.getByText('Elira Hoxha')).toBeInTheDocument();
    expect(screen.getByText('Besa Test')).toBeInTheDocument();
    expect(screen.getByText('09:00 AM – 10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Rruga e Kavajës 12')).toBeInTheDocument();
    expect(screen.getByText('Bring the price sheet')).toBeInTheDocument();
  });

  it('FR-CAL-03 completing a follow-up records the activity in the panel, without leaving the page', async () => {
    const { onChanged, onClose } = renderPanel({ item: item({ id: 'fu-1', kind: 'FOLLOW_UP', type: 'CALL', place: null, endAt: null }) });

    const complete = await screen.findByRole('button', { name: 'Complete' });
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);

    // The activity form opens on the follow-up and the company's contacts.
    const dialog = await screen.findByTestId('activity-dialog');
    expect(dialog).toHaveTextContent('completing fu-1');
    expect(dialog).toHaveTextContent('contacts Elira Hoxha');
    expect(clientService.getClient).toHaveBeenCalledWith('acme', 'c1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save the activity' }));

    // Done: the calendar reloads, the panel closes, and the browser never moved.
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/acme/appointments');
    expect(screen.queryByTestId('activity-dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Follow-up completed and the activity recorded.')).toBeInTheDocument();
  });

  it('FR-CAL-03 a follow-up can be rescheduled and cancelled from the panel', async () => {
    vi.mocked(followUpService.reschedule).mockResolvedValue(followUp());
    vi.mocked(followUpService.cancel).mockResolvedValue(followUp({ status: 'CANCELLED' }));
    const { onChanged } = renderPanel({ item: item({ id: 'fu-1', kind: 'FOLLOW_UP', type: 'CALL', endAt: null }) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reschedule' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    const dialog = await openedModal();
    fireEvent.click(within(dialog).getByRole('button', { name: /Reschedule/ }));
    await waitFor(() => expect(followUpService.reschedule).toHaveBeenCalledWith('acme', 'fu-1', expect.objectContaining({ dueDate: expect.any(String) })));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('FR-CAL-03 a planned item is confirmed, then completed', async () => {
    vi.mocked(appointmentService.updateAppointmentStatus).mockResolvedValue({} as any);
    const { onChanged, onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Confirmed' }));
    await waitFor(() => expect(appointmentService.updateAppointmentStatus).toHaveBeenCalledWith('acme', 'it-1', { status: 'CONFIRMED' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The panel stays, so the next step (complete) is one click away.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('FR-CAL-03 a confirmed planned item can be marked completed', async () => {
    vi.mocked(appointmentService.updateAppointmentStatus).mockResolvedValue({} as any);
    renderPanel({ item: item({ status: 'CONFIRMED' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Completed' }));
    await waitFor(() => expect(appointmentService.updateAppointmentStatus).toHaveBeenCalledWith('acme', 'it-1', { status: 'COMPLETED' }));
  });

  it('FR-CAL-03 a planned item is cancelled with a reason, and the reason is required', async () => {
    vi.mocked(appointmentService.cancelAppointment).mockResolvedValue({} as any);
    const { onChanged } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const confirm = screen.getByRole('button', { name: 'Confirm Cancel' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Reason for cancellation...'), { target: { value: 'Client is away' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(appointmentService.cancelAppointment).toHaveBeenCalledWith('acme', 'it-1', { reason: 'Client is away' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('FR-CAL-03 a planned item can be rescheduled to another day and time', async () => {
    vi.mocked(appointmentService.rescheduleAppointment).mockResolvedValue({} as any);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    const dialog = await openedModal();
    fireEvent.change(within(dialog).getByLabelText(/Date/), { target: { value: '2026-10-09' } });
    fireEvent.change(within(dialog).getByLabelText(/Start/), { target: { value: '14:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));
    // 14:00 in Tirane on 9 October is 12:00 UTC: the workspace's wall time, not the browser's.
    await waitFor(() => expect(appointmentService.rescheduleAppointment).toHaveBeenCalledWith('acme', 'it-1', { newDate: '2026-10-09T12:00:00.000Z', reason: '' }));
  });

  it('FR-CAL-03 Edit hands the item to the planning dialog', () => {
    const { onEdit } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'it-1' }));
  });

  it('FR-CAL-06 hides every action from a viewer who cannot change things, but keeps the links', () => {
    signIn({ 'calendar.view': 'ALL' });
    renderPanel();
    for (const name of ['Complete', 'Mark as Confirmed', 'Edit', 'Reschedule', 'Cancel']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Kafe Blloku' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kafe Blloku – / })).toBeInTheDocument();
  });

  it('FR-CAL-06 hides them when the calendar is read-only whatever the permissions', () => {
    renderPanel({ readOnly: true });
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as Confirmed' })).not.toBeInTheDocument();
  });

  it('actions follow the permission that governs the kind: a follow-up needs followups.manage, a planned item activities.add', () => {
    signIn({ 'calendar.view': 'OWN', 'activities.add': 'OWN' });
    const { unmount } = renderPanel({ item: item({ kind: 'FOLLOW_UP', type: 'CALL' }) });
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    unmount();
    renderPanel();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('a closed item has no actions, only its details', () => {
    renderPanel({ item: item({ status: 'COMPLETED' }) });
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as Completed' })).not.toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('an overdue item says so', () => {
    renderPanel({ item: item({ isOverdue: true }) });
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('says why an action failed and does not close', async () => {
    vi.mocked(appointmentService.updateAppointmentStatus).mockRejectedValue({ response: { data: { error: 'Cannot complete an unconfirmed appointment' } } });
    const { onClose } = renderPanel({ item: item({ status: 'CONFIRMED' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Completed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot complete an unconfirmed appointment');
    expect(onClose).not.toHaveBeenCalled();
  });
});
