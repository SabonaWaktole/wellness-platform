import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ActivityDialog, type ActivityDialogProps } from './ActivityDialog';
import { clientService } from '../../services/clientService';
import { dealService } from '../../services/dealService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';
import type { ActivityView } from '../../types/client';
import type { FollowUp } from '../../types/followUp';
import { followUpService } from '../../services/followUpService';
import { ToastProvider } from '../ui/Toast';

vi.mock('../../services/clientService', () => ({ clientService: { addInteraction: vi.fn(), updateInteraction: vi.fn() } }));
vi.mock('../../services/dealService', () => ({ dealService: { list: vi.fn() } }));
vi.mock('../../services/lookupService', () => ({ lookupService: { list: vi.fn() } }));
vi.mock('../../services/followUpService', () => ({ followUpService: { schedule: vi.fn(), complete: vi.fn() } }));
vi.mock('../../hooks/useActiveLookups', () => ({
  useActiveLookups: () => [
    { id: 'i3', days: 3, nameSq: '3 ditë', nameEn: '3 days', order: 1, active: true },
    { id: 'i5', days: 5, nameSq: '5 ditë', nameEn: '5 days', order: 2, active: true },
    { id: 'i7', days: 7, nameSq: '7 ditë', nameEn: '7 days', order: 3, active: true },
  ],
}));

const SALES_USER = { 'activities.add': 'OWN', 'notes.add': 'OWN', 'deals.view': 'OWN' };
const RECEPTION = { 'notes.add': 'ALL' };

const signIn = (permissions: Record<string, string>) =>
  useAuthStore.setState({ user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', permissions }, isAuthenticated: true } as any);

const RESULTS = [
  { id: 'r1', nameSq: 'U kontaktua – i interesuar', nameEn: 'Reached – interested', order: 1, active: true },
  { id: 'r2', nameSq: 'Nuk u kontaktua', nameEn: 'Not reached', order: 2, active: true },
];
const DEALS = [
  { id: 'd1', clientId: 'c1', companyName: 'Kafe Blloku', type: 'NEW_CONTRACT', title: null, stage: 'NEW_LEAD' },
  { id: 'd2', clientId: 'c1', companyName: 'Kafe Blloku', type: 'RENEWAL', title: null, stage: 'WON' },
];

const renderDialog = (props: Partial<ActivityDialogProps> = {}) => {
  const handlers = { onClose: vi.fn(), onSaved: vi.fn() };
  render(
    <MemoryRouter initialEntries={['/acme/clients/c1']}>
      <Routes>
        <Route
          path="/:tenantSlug/clients/:clientId"
          element={<ActivityDialog isOpen clientId="c1" contacts={[{ id: 'p1', name: 'Elira Hoxha' }, { id: 'p2', name: 'Arben Leka' }]} {...handlers} {...props} />}
        />
      </Routes>
    </MemoryRouter>
  );
  return handlers;
};

describe('ActivityDialog (FR-ACT-01, 02, 06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn(SALES_USER);
    vi.mocked(lookupService.list).mockResolvedValue(RESULTS as any);
    vi.mocked(dealService.list).mockResolvedValue({ items: DEALS, total: 2, page: 1, pageSize: 100 } as any);
    vi.mocked(clientService.addInteraction).mockResolvedValue({ id: 'i1' } as any);
    vi.mocked(clientService.updateInteraction).mockResolvedValue({ id: 'i1' } as any);
  });

  it('FR-ACT-01 offers all six types to a Sales User', () => {
    renderDialog();
    expect(screen.getAllByRole('radio').map((button) => button.textContent)).toEqual(['Call', 'Email', 'Visit', 'Meeting', 'Online meeting', 'Note']);
    expect(screen.getByRole('radio', { name: 'Call' })).toHaveAttribute('aria-checked', 'true');
  });

  it('D3 offers Reception the note only', () => {
    signIn(RECEPTION);
    renderDialog({ initialChannel: 'NOTE' });
    expect(screen.getAllByRole('radio').map((button) => button.textContent)).toEqual(['Note']);
    expect(screen.queryByLabelText(/Contact person/)).not.toBeInTheDocument();
  });

  it('FR-ACT-02 a call saved without a contact person or result shows a validation message and is not sent', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));

    expect(await screen.findByText('Choose the contact person.')).toBeInTheDocument();
    expect(screen.getByText('Choose a result.')).toBeInTheDocument();
    expect(clientService.addInteraction).not.toHaveBeenCalled();
  });

  it('FR-ACT-02 saves a call with its contact, result, feedback and next action', async () => {
    const { onSaved, onClose } = renderDialog();
    await screen.findByRole('option', { name: 'Reached – interested' });

    fireEvent.change(screen.getByLabelText(/Contact person/), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText(/Result/), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText('Client feedback'), { target: { value: 'Wants a price' } });
    fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Send the offer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));

    await waitFor(() =>
      expect(clientService.addInteraction).toHaveBeenCalledWith(
        'acme',
        'c1',
        expect.objectContaining({ channel: 'CALL', contactPersonId: 'p1', resultId: 'r1', clientFeedback: 'Wants a price', nextAction: 'Send the offer', dealId: null })
      )
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("FR-ACT-02 shows the server's refusal next to the field it names", async () => {
    vi.mocked(clientService.addInteraction).mockRejectedValue({ response: { status: 400, data: { code: 'INVALID_ACTIVITY', field: 'occurredAt' } } });
    renderDialog({ initialChannel: 'NOTE' });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Prefers mornings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));

    expect(await screen.findByText('An activity cannot be in the future.')).toBeInTheDocument();
  });

  it('FR-ACT-01 opened from a deal, the deal is preselected and only open deals are offered', async () => {
    renderDialog({ dealId: 'd1' });
    const deal = (await screen.findByLabelText('Deal')) as HTMLSelectElement;
    await screen.findByRole('option', { name: 'Kafe Blloku – New contract' });

    expect(deal.value).toBe('d1');
    expect(screen.queryByRole('option', { name: 'Kafe Blloku – Renewal' })).not.toBeInTheDocument();
  });

  it('FR-ACT-06 an edit is prefilled, keeps a note a note, and is sent as an edit', async () => {
    const activity: ActivityView = {
      id: 'i9', clientId: 'c1', dealId: null, channel: 'VISIT', content: 'Visited the office',
      occurredAt: '2026-10-01T09:00:00.000Z', recordedAt: '2026-10-01T09:05:00.000Z', updatedAt: null,
      author: { id: 'u-a', name: 'Besa Test' }, contact: { id: 'p2', name: 'Arben Leka' },
      result: { id: 'r2', nameSq: 'Nuk u kontaktua', nameEn: 'Not reached' }, clientFeedback: null, nextAction: 'Call back',
    };
    renderDialog({ activity });
    await screen.findByRole('option', { name: 'Not reached' });

    expect(screen.getByRole('heading', { name: 'Edit activity' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Note' })).not.toBeInTheDocument();
    expect((screen.getByLabelText(/Contact person/) as HTMLSelectElement).value).toBe('p2');
    expect((screen.getByLabelText('Next action') as HTMLTextAreaElement).value).toBe('Call back');

    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));
    await waitFor(() =>
      expect(clientService.updateInteraction).toHaveBeenCalledWith('acme', 'c1', 'i9', expect.objectContaining({ channel: 'VISIT', resultId: 'r2' }))
    );
  });
});

describe('ActivityDialog and follow-ups (M2 Slice 11)', () => {
  const SALES_WITH_FOLLOW_UPS = { ...SALES_USER, 'followups.manage': 'OWN' };
  const followUp = (overrides: Partial<FollowUp> = {}): FollowUp => ({
    id: 'f1', clientId: 'c1', companyName: 'Kafe Blloku', dealId: 'd1', dealTitle: null, dealType: 'NEW_CONTRACT',
    contactPersonId: 'p2', contactName: 'Arben Leka', assignedUserId: 'u-a', assignedUserName: 'Besa Test', type: 'VISIT',
    status: 'SCHEDULED', scheduledAt: '2026-10-08T07:00:00Z', notes: null, intervalDays: 3, completedInteractionId: null,
    cancelReason: null, isOverdue: false, history: [], createdAt: '2026-10-05T08:00:00Z', updatedAt: '2026-10-05T08:00:00Z',
    ...overrides,
  });
  const renderWithToasts = (props: Partial<ActivityDialogProps> = {}) => {
    const handlers = { onClose: vi.fn(), onSaved: vi.fn() };
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/acme/clients/c1']}>
          <Routes>
            <Route
              path="/:tenantSlug/clients/:clientId"
              element={<ActivityDialog isOpen clientId="c1" contacts={[{ id: 'p1', name: 'Elira Hoxha' }, { id: 'p2', name: 'Arben Leka' }]} {...handlers} {...props} />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );
    return handlers;
  };
  const fillCall = async () => {
    fireEvent.change(screen.getByLabelText(/Contact person/), { target: { value: 'p1' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Reached – interested' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Result/), { target: { value: 'r1' } });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    signIn(SALES_WITH_FOLLOW_UPS);
    vi.mocked(lookupService.list).mockResolvedValue(RESULTS as any);
    vi.mocked(dealService.list).mockResolvedValue({ items: DEALS, total: 2, page: 1, pageSize: 100 } as any);
    vi.mocked(clientService.addInteraction).mockResolvedValue({ id: 'i9', channel: 'CALL', dealId: null, nextAction: 'Send the offer' } as any);
    vi.mocked(followUpService.schedule).mockResolvedValue(followUp({ id: 'f9' }));
  });

  it('FR-ACT-04 saving a call and clicking "+5 days" creates both the activity and the follow-up', async () => {
    const { onSaved, onClose } = renderWithToasts();
    await fillCall();
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));

    // The dialog stays open on the follow-up buttons (FR-FUP-01).
    expect(await screen.findByText('Schedule a follow-up?')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'i9' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /Follow up in \d days/ }).map((button) => button.textContent)).toEqual(['+3 days', '+5 days', '+7 days']);

    fireEvent.click(screen.getByRole('button', { name: 'Follow up in 5 days' }));
    await waitFor(() => expect(followUpService.schedule).toHaveBeenCalledWith('acme', expect.objectContaining({ clientId: 'c1', fromActivityId: 'i9', intervalDays: 5 })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('FR-ACT-04 "Done" closes the dialog without scheduling a follow-up', async () => {
    const { onClose } = renderWithToasts();
    await fillCall();
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
    expect(followUpService.schedule).not.toHaveBeenCalled();
  });

  it('FR-ACT-04 without followups.manage the dialog closes on save, with no follow-up buttons', async () => {
    signIn(SALES_USER);
    const { onClose } = renderWithToasts();
    await fillCall();
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText('Schedule a follow-up?')).not.toBeInTheDocument();
  });

  it('FR-FUP-06 completing a follow-up opens the activity form pre-filled with its type and contact, and saves through the follow-up', async () => {
    vi.mocked(followUpService.complete).mockResolvedValue({
      followUp: followUp({ status: 'COMPLETED' }),
      activity: { id: 'i10', channel: 'VISIT', dealId: 'd1', nextAction: null } as any,
    });
    const { onSaved } = renderWithToasts({ completing: followUp() });

    expect(screen.getByRole('heading', { name: 'Complete follow-up' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Visit' })).toHaveAttribute('aria-checked', 'true');
    // A follow-up is completed by contact with the client, not a note.
    expect(screen.queryByRole('radio', { name: 'Note' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Contact person/)).toHaveValue('p2');

    await waitFor(() => expect(screen.getByRole('option', { name: 'Reached – interested' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Result/), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));

    await waitFor(() =>
      expect(followUpService.complete).toHaveBeenCalledWith('acme', 'f1', expect.objectContaining({ channel: 'VISIT', contactPersonId: 'p2', resultId: 'r1', dealId: 'd1' }))
    );
    expect(clientService.addInteraction).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'i10' }));
  });
});

