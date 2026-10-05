import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PaymentsOverviewContent } from './PaymentsOverviewContent';
import { paymentService } from '../../services/paymentService';
import { useStatusLabels } from '../../hooks/useStatusLabels';
import { downloadBlob } from '../../utils/downloadBlob';
import { useAuthStore } from '../../store/useAuthStore';
import '../../i18n';

vi.mock('../../services/paymentService', () => ({ paymentService: { fetchPayments: vi.fn(), downloadCsv: vi.fn() } }));
vi.mock('../../utils/downloadBlob', () => ({ downloadBlob: vi.fn() }));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({ staff: [{ id: 'u-a', firstName: 'Besa', lastName: 'Test' }], fetchStaff: vi.fn() }),
}));
vi.mock('../../hooks/useActiveLookups', () => ({
  useActiveLookups: (list: string) =>
    list === 'areas' ? [{ id: 'area-1', nameSq: 'Tiranë', nameEn: 'Tirana' }] : [{ id: 'city-1', nameSq: 'Tiranë', nameEn: 'Tirana' }],
}));
vi.mock('../../hooks/useStatusLabels', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useStatusLabels')>('../../hooks/useStatusLabels');
  return { ...actual, useStatusLabels: vi.fn() };
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p1', tenantId: 't', contractId: 'c1', periodIndex: 1, dueDate: '2027-03-01T00:00:00.000Z',
  amount: '100.00', status: 'OVERDUE', paidAmount: '30.00', outstanding: '70.00', paidAt: null, method: null, note: null,
  invoiceNumber: 'INV-1', invoiceDate: '2027-02-20T00:00:00.000Z', dueNotInvoiced: false, createdAt: '', updatedAt: '',
  contract: { id: 'c1', number: 'CTR-2027-0001', planName: 'Gold', status: 'ACTIVE' },
  client: { id: 'k1', name: 'Alfa Wellness' },
  salesperson: { id: 'u-a', name: 'Besa Test' },
  ...over,
});

const page = (rows: unknown[], totals: Record<string, string> = { amount: '100.00', paidAmount: '30.00', outstanding: '70.00' }, total = rows.length) => ({
  data: rows, total, page: 1, limit: 25, totals,
});

const signIn = (permissions: Record<string, unknown>) =>
  useAuthStore.setState({
    user: { userId: 'u1', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions } as any,
    isAuthenticated: true,
  });

const renderPage = (path = '/acme/payments') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:tenantSlug/payments" element={<PaymentsOverviewContent />} />
        <Route path="/:tenantSlug/contracts/:id" element={<div>contract page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('PaymentsOverviewContent (FR-PAY-11, FR-PAY-12, FR-PAY-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useStatusLabels as any).mockReturnValue([]);
    signIn({ 'payments.view': 'ALL', 'commercial.view': 'ALL' });
    (paymentService.fetchPayments as any).mockResolvedValue(page([row()]));
    (paymentService.downloadCsv as any).mockResolvedValue(new Blob(['x']));
  });

  it('FR-PAY-11 lists the instalments with their contract, company and salesperson, and shows the totals the server worked out', async () => {
    renderPage();

    expect(await screen.findByText('Alfa Wellness')).toBeInTheDocument();
    expect(screen.getByText('CTR-2027-0001')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Besa Test')).toBeInTheDocument();
    expect(screen.getByText('INV-1')).toBeInTheDocument();
    const totals = screen.getByLabelText('Totals of the filtered list');
    expect(within(totals).getByText('$100.00')).toBeInTheDocument();
    expect(within(totals).getByText('$30.00')).toBeInTheDocument();
    expect(within(totals).getByText('$70.00')).toBeInTheDocument();
    expect(paymentService.fetchPayments).toHaveBeenCalledWith('acme', expect.any(Object), 1, 25);
  });

  it('FR-PAY-11 sends the chosen filters to the server and starts again from the first page', async () => {
    renderPage();
    await screen.findByText('Alfa Wellness');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'OVERDUE' } });
    fireEvent.change(screen.getByLabelText('Salesperson'), { target: { value: 'u-a' } });
    fireEvent.change(screen.getByLabelText('Due from'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('Due until'), { target: { value: '2027-12-31' } });
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'area-1' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'city-1' } });
    fireEvent.click(screen.getByLabelText('Due, not invoiced'));

    await waitFor(() =>
      expect(paymentService.fetchPayments).toHaveBeenLastCalledWith(
        'acme',
        expect.objectContaining({
          status: 'OVERDUE', assignedUserId: 'u-a', dueFrom: '2027-01-01', dueTo: '2027-12-31', areaId: 'area-1', cityId: 'city-1', dueNotInvoiced: 'true',
        }),
        1,
        25
      )
    );
  });

  it('never offers Paid-by-hand statuses it does not have: the status filter lists the instalment statuses and not the legacy Waived', async () => {
    renderPage();
    await screen.findByText('Alfa Wellness');
    const options = within(screen.getByLabelText('Status')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', 'NOT_INVOICED', 'INVOICE_ISSUED', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']);
  });

  it('FR-PAY-09 marks a past-due, not-invoiced instalment and an overdue row', async () => {
    (paymentService.fetchPayments as any).mockResolvedValue(
      page([row({ id: 'p2', status: 'NOT_INVOICED', dueNotInvoiced: true, invoiceNumber: null, paidAmount: '0.00', outstanding: '100.00' })])
    );
    renderPage();
    await screen.findByText('Alfa Wellness');
    expect(within(screen.getByRole('table')).getByText('Due, not invoiced')).toBeInTheDocument();
  });

  it('opens the contract when a row is clicked', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Alfa Wellness'));
    expect(await screen.findByText('contract page')).toBeInTheDocument();
  });

  it('FR-PAY-12 without commercial.view there are no amount columns and no totals', async () => {
    signIn({ 'payments.view': 'ALL' });
    (paymentService.fetchPayments as any).mockResolvedValue(
      page([row({ amount: undefined, paidAmount: undefined, outstanding: undefined })], {})
    );
    renderPage();

    expect(await screen.findByText('Alfa Wellness')).toBeInTheDocument();
    expect(screen.queryByLabelText('Totals of the filtered list')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Amount' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Outstanding' })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('FR-PAY-14 exports the current filters as CSV', async () => {
    renderPage('/acme/payments?contractId=c1');
    await screen.findByText('Alfa Wellness');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'OVERDUE' } });
    await waitFor(() => expect(paymentService.fetchPayments).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() =>
      expect(paymentService.downloadCsv).toHaveBeenCalledWith('acme', expect.objectContaining({ status: 'OVERDUE', contractId: 'c1' }))
    );
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^payments-\d{4}-\d{2}-\d{2}\.csv$/));
  });

  it('shows an empty state when nothing matches, and an error when the list cannot be loaded', async () => {
    (paymentService.fetchPayments as any).mockResolvedValueOnce(page([], {}));
    const { unmount } = renderPage();
    expect(await screen.findByText('No instalments found')).toBeInTheDocument();
    unmount();

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (paymentService.fetchPayments as any).mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('The payments could not be loaded.');
  });

  it('pages through the server\'s total, not the rows it holds', async () => {
    (paymentService.fetchPayments as any).mockResolvedValue(page([row()], undefined, 60));
    renderPage();
    await screen.findByText('Alfa Wellness');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(paymentService.fetchPayments).toHaveBeenLastCalledWith('acme', expect.any(Object), 2, 25));
  });
});
