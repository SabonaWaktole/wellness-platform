import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContractDetailContent } from './ContractDetailContent';
import { useContractActions, useContracts } from '../../hooks/useContracts';
import { useStatusLabels } from '../../hooks/useStatusLabels';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../hooks/useContracts', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useContracts')>('../../hooks/useContracts');
  return { ...actual, useContracts: vi.fn(), useContractActions: vi.fn() };
});
vi.mock('../../hooks/useTeam', () => ({ useTeam: () => ({ staff: [], fetchStaff: vi.fn() }) }));
vi.mock('../../hooks/useStatusLabels', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useStatusLabels')>('../../hooks/useStatusLabels');
  return { ...actual, useStatusLabels: vi.fn() };
});

const contract = {
  id: 'c1', clientId: 'k', clientName: 'Acme', planName: 'Gold', status: 'ACTIVE', startsAt: '2026-01-01', endsAt: '2026-12-31',
  daysUntilExpiry: 90, number: 'CTR-2026-0001', legacy: false, amount: '49.40', billingPeriod: 'MONTHLY', createdByUserId: 'u1',
  lockedAt: '2026-01-01T00:00:00Z',
};

describe('FR-CON-11..19 ContractDetailContent lifecycle', () => {
  const changeStatus = vi.fn();
  const startRenewal = vi.fn();

  const renderWith = (detail: object) => {
    (useContracts as any).mockReturnValue({ fetchContractDetail: vi.fn().mockResolvedValue(detail), loading: false, error: null });
    (useContractActions as any).mockReturnValue({ changeStatus, startRenewal, uploadDocument: vi.fn(), downloadDocument: vi.fn(), loading: false, error: null });
    render(
      <MemoryRouter initialEntries={['/acme/contracts/c1']}>
        <Routes>
          <Route path="/:tenantSlug/contracts/:contractId" element={<ContractDetailContent />} />
          <Route path="/:tenantSlug/deals/:dealId" element={<p>the renewal deal</p>} />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    changeStatus.mockResolvedValue({});
    (useStatusLabels as any).mockReturnValue([]);
    useAuthStore.setState({
      user: { userId: 'u1', email: 'm@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions: { 'contracts.manage': true, 'commercial.view': true, 'payments.view': true } },
      isAuthenticated: true,
    });
  });

  it('offers only the buttons the server permits, and Suspend asks for a reason before it calls the server', async () => {
    renderWith({ contract, history: [], payments: [], documents: [], permittedActions: ['SUSPEND', 'CANCEL', 'ATTACH_DOCUMENT'] });

    expect(await screen.findByRole('button', { name: /^Suspend$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reinstate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Activate$/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Suspend$/ }));
    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    expect(changeStatus).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  Unpaid invoices ' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith('c1', 'SUSPENDED', 'Unpaid invoices'));
  });

  it('shows the server\'s refusal when activating without a document', async () => {
    changeStatus.mockRejectedValue({ response: { data: { error: 'Attach the signed contract before activating it.' } } });
    renderWith({ contract: { ...contract, status: 'DRAFT' }, history: [], payments: [], documents: [], permittedActions: ['ACTIVATE', 'MARK_PENDING_SIGNATURE'] });

    fireEvent.click(await screen.findByRole('button', { name: /^Activate$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Attach the signed contract before activating it.');
  });

  it('FR-CON-19 lists the current file and the previous version; without commercial.view there is no document card', async () => {
    renderWith({
      contract, history: [], payments: [], permittedActions: [],
      documents: [
        { id: 'd2', fileName: 'second.pdf', uploadedByUserId: 'u1', uploadedAt: '2026-02-01T10:00:00Z', isCurrent: true },
        { id: 'd1', fileName: 'first.pdf', uploadedByUserId: 'u1', uploadedAt: '2026-01-01T10:00:00Z', isCurrent: false },
      ],
    });
    expect(await screen.findByText('second.pdf')).toBeInTheDocument();
    expect(screen.getByText('first.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Previous version/)).toBeInTheDocument();
  });

  it('hides the document card when the server sends no documents (Reception)', async () => {
    renderWith({ contract, history: [], permittedActions: [] });
    await screen.findByText(/Contract CTR-2026-0001/);
    expect(screen.queryByText('Signed document')).not.toBeInTheDocument();
  });

  it('FR-REN-06 "Start renewal" starts the deal and opens it, only when the server permits it', async () => {
    startRenewal.mockResolvedValue({ dealId: 'd9' });
    renderWith({ contract: { ...contract, status: 'EXPIRED' }, history: [], payments: [], documents: [], permittedActions: ['START_RENEWAL'], renewal: { renewedFrom: null, renewedInto: null, openDealId: null } });

    fireEvent.click(await screen.findByRole('button', { name: 'Start renewal' }));
    await waitFor(() => expect(startRenewal).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('the renewal deal')).toBeInTheDocument();
  });

  it('FR-REN-06 offers no "Start renewal" when the server does not permit it', async () => {
    renderWith({ contract, history: [], payments: [], documents: [], permittedActions: ['SUSPEND'] });
    await screen.findByRole('button', { name: /^Suspend$/ });
    expect(screen.queryByRole('button', { name: 'Start renewal' })).not.toBeInTheDocument();
  });

  it('FR-REN-06 an already open renewal deal is opened instead of started twice', async () => {
    startRenewal.mockRejectedValue({ response: { data: { code: 'RENEWAL_OPEN', dealId: 'd7', error: 'A renewal deal is already open for this contract.' } } });
    renderWith({ contract, history: [], payments: [], documents: [], permittedActions: ['START_RENEWAL'] });

    fireEvent.click(await screen.findByRole('button', { name: 'Start renewal' }));
    expect(await screen.findByText('the renewal deal')).toBeInTheDocument();
  });

  it('FR-REN-07 shows In negotiation with a link to the open deal, Renewed by the next term, and Renews the previous one', async () => {
    renderWith({ contract, history: [], payments: [], documents: [], permittedActions: [], renewal: { renewedFrom: null, renewedInto: null, openDealId: 'd7' } });
    expect(await screen.findByText('In negotiation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the renewal deal' })).toBeInTheDocument();
  });

  it('FR-REN-07 a renewed contract names the term that renewed it, and a renewal names the one it renews', async () => {
    renderWith({
      contract: { ...contract, renewedFromContractId: 'c0' }, history: [], payments: [], documents: [], permittedActions: [],
      renewal: { renewedFrom: { id: 'c0', number: 'CTR-2025-0007' }, renewedInto: { id: 'c2', number: 'CTR-2027-0001' }, openDealId: null },
    });
    expect(await screen.findByRole('button', { name: 'Renews CTR-2025-0007' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renewed by CTR-2027-0001' })).toBeInTheDocument();
    expect(screen.queryByText('In negotiation')).not.toBeInTheDocument();
  });
});
