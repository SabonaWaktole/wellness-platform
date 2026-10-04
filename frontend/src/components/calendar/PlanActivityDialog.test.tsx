import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlanActivityDialog } from './PlanActivityDialog';
import { appointmentService } from '../../services/appointmentService';
import { clientService } from '../../services/clientService';
import { dealService } from '../../services/dealService';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../ui/Toast';
import type { CalendarItem } from '../../types/calendar';

vi.mock('../../services/statusLabelService', () => ({ statusLabelService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/appointmentService', () => ({ appointmentService: { createAppointment: vi.fn(), updateAppointment: vi.fn() } }));
vi.mock('../../services/clientService', () => ({ clientService: { getClient: vi.fn(), searchClients: vi.fn() } }));
vi.mock('../../services/dealService', () => ({ dealService: { list: vi.fn() } }));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({
    staff: [
      { id: 'u-a', email: 'a@example.com', role: 'STAFF', firstName: 'Besa', lastName: 'Test', isActive: true },
      { id: 'u-b', email: 'b@example.com', role: 'STAFF', firstName: 'Dritan', lastName: 'Test', isActive: true },
      { id: 'u-c', email: 'c@example.com', role: 'STAFF', firstName: 'Gone', lastName: 'Test', isActive: false },
    ],
    fetchStaff: vi.fn(),
  }),
}));

const signIn = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', tenantLocale: 'en-US', tenantTimezone: 'Europe/Tirane', permissions },
    isAuthenticated: true,
  } as any);

const renderDialog = (props: Partial<React.ComponentProps<typeof PlanActivityDialog>> = {}) => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/appointments']}>
        <Routes>
          <Route
            path="/:tenantSlug/appointments"
            element={<PlanActivityDialog isOpen onClose={onClose} onSaved={onSaved} clientId="c1" clientName="Kafe Blloku" day="2026-10-09" {...props} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
  return { onSaved, onClose };
};

const existing: CalendarItem = {
  id: 'it-1',
  kind: 'PLANNED',
  type: 'VISIT',
  status: 'SCHEDULED',
  scheduledAt: '2026-10-09T07:00:00.000Z',
  endAt: '2026-10-09T08:30:00.000Z',
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
};

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

describe('planning an activity (M2 Slice 12, FR-CAL-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ 'calendar.view': 'OWN', 'activities.add': 'OWN' });
    vi.mocked(clientService.getClient).mockResolvedValue({ id: 'c1', name: 'Kafe Blloku', contacts: [{ id: 'p1', name: 'Elira Hoxha' }] } as any);
    vi.mocked(dealService.list).mockResolvedValue({
      items: [
        { id: 'd1', clientId: 'c1', companyName: 'Kafe Blloku', type: 'NEW_CONTRACT', title: 'Kafe Blloku, 2027', stage: 'NEGOTIATION' },
        { id: 'd2', clientId: 'c1', companyName: 'Kafe Blloku', type: 'RENEWAL', title: null, stage: 'WON' },
      ],
    } as any);
    vi.mocked(appointmentService.createAppointment).mockResolvedValue({} as any);
    vi.mocked(appointmentService.updateAppointment).mockResolvedValue({} as any);
  });

  it('FR-CAL-02 opens on the company and the day it was given, with a meeting at 09:00 for an hour', async () => {
    renderDialog();
    expect(await screen.findByText('Kafe Blloku')).toBeInTheDocument();
    expect(field(/^Date/).value).toBe('2026-10-09');
    expect(field(/^Start/).value).toBe('09:00');
    expect(field(/^End/).value).toBe('10:00');
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('MEETING');
  });

  it('FR-CAL-02 offers the company\'s open deals and contacts, and no closed deal', async () => {
    renderDialog();
    expect(await screen.findByRole('option', { name: 'Kafe Blloku, 2027' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Elira Hoxha' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Renewal/ })).not.toBeInTheDocument();
  });

  it('FR-CAL-02 plans a visit with the deal, contact, place and note, at the workspace\'s wall time', async () => {
    const { onSaved } = renderDialog();
    await screen.findByRole('option', { name: 'Elira Hoxha' });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'VISIT' } });
    fireEvent.change(screen.getByLabelText('Deal'), { target: { value: 'd1' } });
    fireEvent.change(screen.getByLabelText('Contact person'), { target: { value: 'p1' } });
    fireEvent.change(field(/^Start/), { target: { value: '10:00' } });
    fireEvent.change(field(/^End/), { target: { value: '11:00' } });
    fireEvent.change(field(/^Place/), { target: { value: 'Rruga e Kavajës 12' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Bring the price sheet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }));

    // 10:00 in Tirane on 9 October (UTC+2) is 08:00 UTC, whatever the browser's zone is.
    await waitFor(() =>
      expect(appointmentService.createAppointment).toHaveBeenCalledWith('acme', {
        clientId: 'c1',
        assignedUserId: 'u-a',
        type: 'VISIT',
        scheduledAt: '2026-10-09T08:00:00.000Z',
        endAt: '2026-10-09T09:00:00.000Z',
        dealId: 'd1',
        contactPersonId: 'p1',
        place: 'Rruga e Kavajës 12',
        notes: 'Bring the price sheet',
      })
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('FR-CAL-02 a place belongs to a visit: other types have none and send none', async () => {
    renderDialog();
    await screen.findByText('Kafe Blloku');
    expect(screen.queryByLabelText(/^Place/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'VISIT' } });
    fireEvent.change(field(/^Place/), { target: { value: 'Somewhere' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'CALL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }));
    await waitFor(() => expect(appointmentService.createAppointment).toHaveBeenCalled());
    expect(vi.mocked(appointmentService.createAppointment).mock.calls[0][1]).toMatchObject({ type: 'CALL', place: null });
  });

  it('FR-CAL-02 an end before the start is refused before anything is sent', async () => {
    renderDialog();
    await screen.findByText('Kafe Blloku');
    fireEvent.change(field(/^End/), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }));
    expect(await screen.findByText('The end must be after the start.')).toBeInTheDocument();
    expect(appointmentService.createAppointment).not.toHaveBeenCalled();
  });

  it('FR-CAL-02 the end follows the start, an hour later, until it is set by hand', async () => {
    renderDialog();
    await screen.findByText('Kafe Blloku');
    fireEvent.change(field(/^Start/), { target: { value: '15:30' } });
    expect(field(/^End/).value).toBe('16:30');
    fireEvent.change(field(/^End/), { target: { value: '18:00' } });
    fireEvent.change(field(/^Start/), { target: { value: '14:00' } });
    expect(field(/^End/).value).toBe('18:00');
  });

  it('FR-CAL-02 an end is optional', async () => {
    renderDialog();
    await screen.findByText('Kafe Blloku');
    fireEvent.change(field(/^End/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }));
    await waitFor(() => expect(appointmentService.createAppointment).toHaveBeenCalled());
    expect(vi.mocked(appointmentService.createAppointment).mock.calls[0][1]).toMatchObject({ endAt: null });
  });

  it('FR-CAL-02 from the calendar, the company is searched for and chosen first', async () => {
    vi.mocked(clientService.searchClients).mockResolvedValue({ items: [{ id: 'c2', name: 'Furra Dritan' }] } as any);
    renderDialog({ clientId: undefined, clientName: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }));
    expect(await screen.findByText('Choose a company.')).toBeInTheDocument();
    expect(appointmentService.createAppointment).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Search for a company'), { target: { value: 'Furra' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Furra Dritan' }, { timeout: 2000 }));
    expect(await screen.findByText('Furra Dritan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }));
    await waitFor(() => expect(appointmentService.createAppointment).toHaveBeenCalledWith('acme', expect.objectContaining({ clientId: 'c2' })));
  });

  it('says what the server refused, and keeps the form open', async () => {
    vi.mocked(appointmentService.createAppointment).mockRejectedValue({ response: { data: { error: 'Scheduled date must be in the future' } } });
    const { onSaved } = renderDialog();
    await screen.findByText('Kafe Blloku');
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scheduled date must be in the future');
    expect(onSaved).not.toHaveBeenCalled();
  });

  describe('who it is planned for', () => {
    it('FR-CAL-02 a Sales User plans for themselves: there is no salesperson to pick', async () => {
      renderDialog();
      await screen.findByText('Kafe Blloku');
      expect(screen.queryByLabelText('Salesperson')).not.toBeInTheDocument();
    });

    it('FR-CAL-02 a Sales Manager can plan for a salesperson, never for someone deactivated', async () => {
      signIn({ 'calendar.view': 'TEAM', 'activities.add': 'TEAM' });
      renderDialog();
      const select = (await screen.findByLabelText('Salesperson')) as HTMLSelectElement;
      expect(screen.getByRole('option', { name: 'Dritan Test' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Gone Test' })).not.toBeInTheDocument();
      fireEvent.change(select, { target: { value: 'u-b' } });
      fireEvent.click(screen.getByRole('button', { name: 'Plan it' }));
      await waitFor(() => expect(appointmentService.createAppointment).toHaveBeenCalledWith('acme', expect.objectContaining({ assignedUserId: 'u-b' })));
    });
  });

  describe('changing a planned item', () => {
    it('FR-CAL-02 opens on the item, in the workspace zone, with its company fixed', async () => {
      renderDialog({ item: existing, clientId: undefined });
      expect(await screen.findByText('Kafe Blloku')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
      expect(field(/^Date/).value).toBe('2026-10-09');
      expect(field(/^Start/).value).toBe('09:00');
      expect(field(/^End/).value).toBe('10:30');
      expect(field(/^Place/).value).toBe('Rruga e Kavajës 12');
      expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Bring the price sheet');
      await waitFor(() => expect((screen.getByLabelText('Deal') as HTMLSelectElement).value).toBe('d1'));
    });

    it('FR-CAL-02 saves the changes, and clears what was emptied', async () => {
      const { onSaved } = renderDialog({ item: existing, clientId: undefined });
      await screen.findByRole('option', { name: 'Elira Hoxha' });
      fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'ONLINE_MEETING' } });
      fireEvent.change(screen.getByLabelText('Contact person'), { target: { value: '' } });
      fireEvent.change(field(/^End/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() =>
        expect(appointmentService.updateAppointment).toHaveBeenCalledWith('acme', 'it-1', {
          type: 'ONLINE_MEETING',
          scheduledAt: '2026-10-09T07:00:00.000Z',
          endAt: null,
          dealId: 'd1',
          contactPersonId: null,
          place: null,
          notes: 'Bring the price sheet',
          assignedUserId: 'u-a',
        })
      );
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });
  });

  it('is closed until it is opened', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
