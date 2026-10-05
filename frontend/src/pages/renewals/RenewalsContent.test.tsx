import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RenewalsContent } from './RenewalsContent';
import { renewalService } from '../../services/renewalService';
import { contractService } from '../../services/contractService';
import { lookupService } from '../../services/lookupService';
import { ToastProvider } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/useAuthStore';
import '../../i18n';

vi.mock('../../services/renewalService', () => ({
  renewalService: { fetchRenewals: vi.fn(), markNotRenewing: vi.fn(), clearNotRenewing: vi.fn() },
}));
vi.mock('../../services/contractService', () => ({ contractService: { startRenewal: vi.fn() } }));
vi.mock('../../services/lookupService', () => ({ lookupService: { list: vi.fn() } }));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({ staff: [{ id: 'u-a', firstName: 'Besa', lastName: 'Test' }], fetchStaff: vi.fn() }),
}));

const row = (over: Record<string, unknown> = {}) => ({
  contractId: 'c1', number: 'CTR-2027-0001', status: 'ACTIVE', company: { id: 'k1', name: 'Alfa Wellness' },
  startsAt: '2026-03-01', endsAt: '2027-02-28', daysRemaining: 20,
  salesperson: { id: 'u-a', name: 'Besa Test' }, state: 'NOT_STARTED', renewedInto: null,
  actions: ['START_RENEWAL', 'MARK_NOT_RENEWING'], planName: 'Gold', monthlyPrice: '49.40', openDealId: null, notRenewing: null,
  ...over,
});

const page = (rows: unknown[], count = rows.length, window = '30') => ({ data: rows, count, page: 1, limit: 25, window });

const signIn = () =>
  useAuthStore.setState({
    user: { userId: 'u1', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions: { 'contracts.validity.view': 'ALL' } } as any,
    isAuthenticated: true,
  });

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/renewals']}>
        <Routes>
          <Route path="/:tenantSlug/renewals" element={<RenewalsContent />} />
          <Route path="/:tenantSlug/contracts/:id" element={<div>contract page</div>} />
          <Route path="/:tenantSlug/deals/:id" element={<div>deal page</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('RenewalsContent (FR-REN-05, FR-REN-08, FR-REN-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn();
    (renewalService.fetchRenewals as any).mockResolvedValue(page([row()]));
    (lookupService.list as any).mockResolvedValue([{ id: 'r1', nameSq: 'Çmimi', nameEn: 'Price' }]);
  });

  it('FR-REN-05 lists the contracts with end date, days remaining, salesperson, monthly price and renewal state', async () => {
    renderPage();

    expect(await screen.findByText('Alfa Wellness')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('CTR-2027-0001')).toBeInTheDocument();
    expect(within(table).getByText('Besa Test')).toBeInTheDocument();
    expect(within(table).getByText('20 days left')).toBeInTheDocument();
    expect(within(table).getByText('$49.40')).toBeInTheDocument();
    expect(within(table).getByText('Not started')).toBeInTheDocument();
    expect(renewalService.fetchRenewals).toHaveBeenCalledWith('acme', expect.objectContaining({ window: '30' }), 1, 25);
  });

  it('FR-REN-05, FR-REN-09 the tabs ask the server for 60, 90 days and Recently expired, from the first page', async () => {
    renderPage();
    await screen.findByText('Alfa Wellness');

    for (const [name, window] of [['Next 60 days', '60'], ['Next 90 days', '90'], ['Recently expired', 'RECENTLY_EXPIRED']] as const) {
      fireEvent.click(screen.getByRole('tab', { name }));
      await waitFor(() => expect(renewalService.fetchRenewals).toHaveBeenLastCalledWith('acme', expect.objectContaining({ window }), 1, 25));
    }
  });

  it('FR-REN-05 shows In negotiation with the deal link, Renewed with the new contract, and Not renewing with its reason and note', async () => {
    (renewalService.fetchRenewals as any).mockResolvedValue(
      page([
        row({ contractId: 'c-neg', company: { id: 'k2', name: 'Beta' }, state: 'IN_NEGOTIATION', openDealId: 'd1', actions: [] }),
        row({ contractId: 'c-ren', company: { id: 'k3', name: 'Gama' }, state: 'RENEWED', renewedInto: { id: 'c-new', number: 'CTR-2028-0007' }, actions: [] }),
        row({
          contractId: 'c-not', company: { id: 'k4', name: 'Delta' }, state: 'NOT_RENEWING', actions: ['UNDO_NOT_RENEWING'],
          notRenewing: { reasonId: 'r1', reasonSq: 'Çmimi', reasonEn: 'Price', note: 'Too expensive' },
        }),
      ])
    );
    renderPage();
    await screen.findByText('Beta');

    expect(screen.getByText('In negotiation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the deal' }));
    expect(await screen.findByText('deal page')).toBeInTheDocument();
  });

  it('FR-REN-05 shows the Renewed link and the Not renewing reason', async () => {
    (renewalService.fetchRenewals as any).mockResolvedValue(
      page([
        row({ contractId: 'c-ren', state: 'RENEWED', renewedInto: { id: 'c-new', number: 'CTR-2028-0007' }, actions: [] }),
        row({
          contractId: 'c-not', company: { id: 'k4', name: 'Delta' }, state: 'NOT_RENEWING', actions: ['UNDO_NOT_RENEWING'],
          notRenewing: { reasonId: 'r1', reasonSq: 'Çmimi', reasonEn: 'Price', note: 'Too expensive' },
        }),
      ])
    );
    renderPage();
    await screen.findByText('Delta');

    expect(screen.getByRole('button', { name: 'Renewed by CTR-2028-0007' })).toBeInTheDocument();
    expect(screen.getByText('Not renewing', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Price — Too expensive')).toBeInTheDocument();
  });

  it('FR-REN-06 "Start renewal" starts the deal and opens it; an open one is opened instead of a second', async () => {
    (contractService.startRenewal as any).mockResolvedValueOnce({ dealId: 'd9' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start renewal' }));
    await waitFor(() => expect(contractService.startRenewal).toHaveBeenCalledWith('acme', 'c1'));
    expect(await screen.findByText('deal page')).toBeInTheDocument();
  });

  it('FR-REN-06 a renewal that is already open opens that deal', async () => {
    (contractService.startRenewal as any).mockRejectedValueOnce({ response: { data: { code: 'RENEWAL_OPEN', dealId: 'd5', error: 'open' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start renewal' }));
    expect(await screen.findByText('deal page')).toBeInTheDocument();
  });

  it('FR-REN-08 "Not renewing" asks for a reason from the lost-deal reasons and a note, and sends them', async () => {
    (renewalService.markNotRenewing as any).mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Not renewing' }));

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Mark as not renewing' });
    // No reason, no confirmation.
    expect(confirm).toBeDisabled();
    await within(dialog).findByRole('option', { name: 'Price' });
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'r1' } });
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'Closing down' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as not renewing' }));

    await waitFor(() => expect(renewalService.markNotRenewing).toHaveBeenCalledWith('acme', 'c1', { reasonId: 'r1', note: 'Closing down' }));
    // The list is read again so the screen shows what the server now says.
    await waitFor(() => expect(renewalService.fetchRenewals).toHaveBeenCalledTimes(2));
  });

  it('FR-REN-08 a Not renewing contract offers Undo, which takes the mark back and reloads', async () => {
    (renewalService.fetchRenewals as any).mockResolvedValue(
      page([row({ state: 'NOT_RENEWING', actions: ['UNDO_NOT_RENEWING'], notRenewing: { reasonId: 'r1', reasonSq: 'Çmimi', reasonEn: 'Price', note: null } })])
    );
    (renewalService.clearNotRenewing as any).mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(renewalService.clearNotRenewing).toHaveBeenCalledWith('acme', 'c1'));
    await waitFor(() => expect(renewalService.fetchRenewals).toHaveBeenCalledTimes(2));
  });

  it('offers only the actions the server sent: a row without any has no buttons', async () => {
    (renewalService.fetchRenewals as any).mockResolvedValue(page([row({ actions: [] })]));
    renderPage();
    await screen.findByText('Alfa Wellness');
    expect(screen.queryByRole('button', { name: 'Start renewal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not renewing' })).not.toBeInTheDocument();
  });

  it('NFR-SEC-06 Reception gets the validity facts only: no salesperson, price or state columns', async () => {
    (renewalService.fetchRenewals as any).mockResolvedValue(
      page([{ contractId: 'c1', number: 'CTR-2027-0001', status: 'ACTIVE', company: { id: 'k1', name: 'Alfa Wellness' }, startsAt: '2026-03-01', endsAt: '2027-02-28', daysRemaining: 20 }])
    );
    renderPage();

    expect(await screen.findByText('Alfa Wellness')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Salesperson' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Monthly price' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Renewal' })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start renewal' })).not.toBeInTheDocument();
  });

  it('says how long ago a contract ended on the Recently expired tab', async () => {
    (renewalService.fetchRenewals as any).mockResolvedValue(page([row({ status: 'EXPIRED', daysRemaining: -12, endsAt: '2026-09-23' })], 1, 'RECENTLY_EXPIRED'));
    renderPage();
    expect(await screen.findByText('Ended 12 days ago')).toBeInTheDocument();
  });

  it('shows an empty state, and an error when the list cannot be loaded', async () => {
    (renewalService.fetchRenewals as any).mockResolvedValueOnce(page([]));
    const { unmount } = renderPage();
    expect(await screen.findByText('Nothing ends in the next 30 days')).toBeInTheDocument();
    unmount();

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (renewalService.fetchRenewals as any).mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('The renewals could not be loaded.');
  });

  it('pages through the server\'s count, not the rows it holds', async () => {
    (renewalService.fetchRenewals as any).mockResolvedValue(page([row()], 60));
    renderPage();
    await screen.findByText('Alfa Wellness');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(renewalService.fetchRenewals).toHaveBeenLastCalledWith('acme', expect.any(Object), 2, 25));
  });
});
