import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ActivityDialog, type ActivityDialogProps } from './ActivityDialog';
import { clientService } from '../../services/clientService';
import { dealService } from '../../services/dealService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';
import type { ActivityView } from '../../types/client';

vi.mock('../../services/clientService', () => ({ clientService: { addInteraction: vi.fn(), updateInteraction: vi.fn() } }));
vi.mock('../../services/dealService', () => ({ dealService: { list: vi.fn() } }));
vi.mock('../../services/lookupService', () => ({ lookupService: { list: vi.fn() } }));

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
