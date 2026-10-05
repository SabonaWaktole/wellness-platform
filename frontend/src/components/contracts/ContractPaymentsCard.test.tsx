import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContractPaymentsCard } from './ContractPaymentsCard';
import { useContractActions } from '../../hooks/useContracts';
import { useStatusLabels } from '../../hooks/useStatusLabels';
import type { ContractPayment } from '../../types/contract';
import { paymentService } from '../../services/paymentService';
import { downloadBlob } from '../../utils/downloadBlob';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../hooks/useContracts', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useContracts')>('../../hooks/useContracts');
  return { ...actual, useContractActions: vi.fn() };
});
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({ staff: [{ id: 'u-fin', firstName: 'Fatjon', lastName: 'Test' }], fetchStaff: vi.fn() }),
}));
vi.mock('../../hooks/useStatusLabels', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useStatusLabels')>('../../hooks/useStatusLabels');
  return { ...actual, useStatusLabels: vi.fn() };
});

vi.mock('../../services/paymentService', () => ({ paymentService: { downloadCsv: vi.fn() } }));
vi.mock('../../utils/downloadBlob', () => ({ downloadBlob: vi.fn() }));

const payment = (over: Partial<ContractPayment> = {}): ContractPayment => ({
  id: 'p1', tenantId: 't', contractId: 'c1', periodIndex: 1, dueDate: '2027-03-01T00:00:00.000Z',
  amount: '49.40', status: 'PAYMENT_PENDING', paidAmount: '0.00', outstanding: '49.40', paidAt: null, method: null, note: null,
  invoiceNumber: 'INV-1', invoiceDate: '2027-02-20T00:00:00.000Z', dueNotInvoiced: false, createdAt: '', updatedAt: '', ...over,
});

const received = new Date().toISOString().slice(0, 10);
const summary = { total: '592.80', received: '148.20', outstanding: '444.60', nextDueDate: '2027-04-01', overdueCount: 0, overdueAmount: '0.00' };

describe('ContractPaymentsCard (FR-PAY-03, 05, 06, 08, 10, 12)', () => {
  const paymentAction = vi.fn();
  const fetchPaymentHistory = vi.fn();
  const onChanged = vi.fn();

  const renderCard = (props: Partial<React.ComponentProps<typeof ContractPaymentsCard>> = {}) =>
    render(<ContractPaymentsCard contractId="c1" contractStatus="ACTIVE" payments={[payment()]} summary={summary} canUpdate onChanged={onChanged} {...props} />);

  beforeEach(() => {
    vi.clearAllMocks();
    paymentAction.mockResolvedValue({});
    fetchPaymentHistory.mockResolvedValue([]);
    (useStatusLabels as any).mockReturnValue([]);
    (useContractActions as any).mockReturnValue({ paymentAction, fetchPaymentHistory, addPayment: vi.fn(), updatePayment: vi.fn(), deletePayment: vi.fn(), loading: false, error: null });
  });

  it('FR-PAY-10 shows the summary the server worked out', () => {
    renderCard();
    expect(screen.getByText('$592.80')).toBeInTheDocument();
    expect(screen.getByText('$148.20')).toBeInTheDocument();
    expect(screen.getByText('$444.60')).toBeInTheDocument();
  });

  it('FR-PAY-09 flags an instalment that is due and not invoiced', () => {
    renderCard({ payments: [payment({ status: 'NOT_INVOICED', invoiceNumber: null, dueNotInvoiced: true })] });
    expect(screen.getByText('Due, not invoiced')).toBeInTheDocument();
  });

  it('FR-PAY-05 shows no edit control without payments.update, only the details and history', async () => {
    renderCard({ canUpdate: false });
    expect(screen.queryByRole('button', { name: /Add instalment/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('History')).toBeInTheDocument();
    for (const name of [/Record invoice/, /Record receipt/, /Reverse receipt/, /Correct status/, /^Change$/, /^Remove$/, /Mark payment pending/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('FR-PAY-12 leaves out the amount columns when the server sent no amounts', () => {
    renderCard({
      payments: [payment({ amount: undefined, paidAmount: undefined, outstanding: undefined })],
      summary: { nextDueDate: '2027-04-01', overdueCount: 0 },
      canUpdate: false,
    });
    expect(screen.queryByText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByText('Outstanding')).not.toBeInTheDocument();
    expect(screen.getByText('INV-1')).toBeInTheDocument();
  });

  it('FR-PAY-06 never offers Paid or Partially Paid when correcting a status', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Correct status' }));
    const select = await screen.findByLabelText('Back to');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Not invoiced', 'Invoice issued']);
    expect(options.join()).not.toMatch(/Paid|Overdue/);
  });

  it('FR-PAY-07 records a receipt with the amount, date and method, and reads the contract again', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record receipt' }));
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '20.00' } });
    fireEvent.change(screen.getByLabelText(/Date received/), { target: { value: received } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(paymentAction).toHaveBeenCalledWith('c1', 'p1', 'receipts', { amount: '20.00', receivedOn: received, method: 'BANK_TRANSFER', comment: null })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('FR-PAY-07 shows the server\'s refusal as it is when a receipt is too large', async () => {
    paymentAction.mockRejectedValue({ response: { data: { error: 'A receipt cannot exceed the amount still outstanding' } } });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record receipt' }));
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '100.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A receipt cannot exceed the amount still outstanding');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('FR-PAY-06 asks for the invoice number and date before recording an invoice', async () => {
    renderCard({ payments: [payment({ status: 'NOT_INVOICED', invoiceNumber: null, invoiceDate: null })] });
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record invoice' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Invoice number/), { target: { value: 'INV-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(paymentAction).toHaveBeenCalledWith('c1', 'p1', 'invoice', expect.objectContaining({ invoiceNumber: 'INV-9' })));
  });

  it('FR-PAY-08 lists the history with who and when', async () => {
    fetchPaymentHistory.mockResolvedValue([
      { id: 'h1', paymentId: 'p1', fromStatus: 'NOT_INVOICED', toStatus: 'INVOICE_ISSUED', amountReceived: '0.00', receivedOn: null, method: null, changedByUserId: 'u-fin', comment: null, changedAt: '2027-02-20T10:00:00Z' },
      { id: 'h2', paymentId: 'p1', fromStatus: 'INVOICE_ISSUED', toStatus: 'PARTIALLY_PAID', amountReceived: '20.00', receivedOn: '2027-03-10', method: 'CASH', changedByUserId: null, comment: null, changedAt: '2027-03-10T10:00:00Z' },
    ]);
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText(/Invoice issued$/)).toBeInTheDocument();
    expect(screen.getByText('Receipt $20.00')).toBeInTheDocument();
    expect(screen.getByText(/Fatjon/)).toBeInTheDocument();
    expect(screen.getByText(/System/)).toBeInTheDocument();
  });
  it('FR-PAY-14 a user who can view payments exports this contract\'s instalments; one who cannot sees no button', async () => {
    (paymentService.downloadCsv as any).mockResolvedValue(new Blob(['x']));
    useAuthStore.setState({ user: { userId: 'u', role: 'STAFF', permissions: { 'payments.view': 'ALL' } } as any, isAuthenticated: true });
    const { unmount } = render(
      <MemoryRouter initialEntries={['/acme/contracts/c1']}>
        <Routes>
          <Route path="/:tenantSlug/contracts/:id" element={<ContractPaymentsCard contractId="c1" contractStatus="ACTIVE" payments={[payment()]} summary={summary} canUpdate={false} onChanged={onChanged} />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(paymentService.downloadCsv).toHaveBeenCalledWith('acme', { contractId: 'c1' }));
    expect(downloadBlob).toHaveBeenCalled();
    unmount();

    useAuthStore.setState({ user: { userId: 'u', role: 'STAFF', permissions: {} } as any, isAuthenticated: true });
    renderCard({ canUpdate: false });
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
  });
});
