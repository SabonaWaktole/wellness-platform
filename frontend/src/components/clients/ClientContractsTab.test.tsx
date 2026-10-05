// @ts-nocheck
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ClientContractsTab } from './ClientContractsTab';
import * as useContractsModule from '../../hooks/useContracts';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../hooks/useContracts', () => ({ useContracts: vi.fn() }));

const RECEPTION = { 'companies.view': 'ALL', 'notes.view': 'ALL', 'contracts.validity.view': 'ALL' };
const ADMIN = { ...RECEPTION, 'contracts.manage': 'ALL', 'commercial.view': 'ALL', 'payments.view': 'ALL' };

/** What the API sends Reception (FR-RBAC-06): validity only, no money. */
const receptionResponse = {
  contracts: [
    {
      id: 'c1', clientId: 'client-1', planName: 'Gold', status: 'ACTIVE',
      startsAt: '2026-01-01', endsAt: '2026-12-31', daysUntilExpiry: 90,
    },
  ],
  summary: {
    hasActiveContract: true, activeContractId: 'c1', activePlanName: 'Gold', activeEndsAt: '2026-12-31',
    daysUntilExpiry: 90, totalContracts: 1,
  },
};

const signIn = (permissions: Record<string, string>) =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: 'u1', email: 'r@example.com', role: 'STAFF', tenantId: 't1', permissions },
  } as any);

const renderTab = async (response: unknown, waitFor: RegExp = /Gold/) => {
  vi.mocked(useContractsModule.useContracts).mockReturnValue({
    fetchClientContracts: vi.fn().mockResolvedValue(response),
    loading: false,
  } as any);
  render(
    <MemoryRouter initialEntries={['/t1/clients/client-1']}>
      <ClientContractsTab clientId="client-1" />
    </MemoryRouter>
  );
  await screen.findAllByText(waitFor);
};

describe('ClientContractsTab (FR-RBAC-06, 07)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows Reception the contract validity without any amount, balance or new-contract action', async () => {
    signIn(RECEPTION);
    await renderTab(receptionResponse);

    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
    expect(screen.queryByText(/€|ALL\s?\d|\d+[.,]\d{2}/)).toBeNull();
    // Not even "all settled": whether a client has paid is payment data.
    expect(screen.queryByText(/All payments settled|pagesat janë mbyllur|papaguar/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /new contract|kontratë e re/i })).toBeNull();
  });

  it('FR-CON-21: shows Reception the server\'s badge, with no plan name', async () => {
    signIn(RECEPTION);
    const { activePlanName: _plan, ...summary } = receptionResponse.summary;
    await renderTab({
      contracts: [{ id: 'c1', number: 'CTR-2026-0001', status: 'ACTIVE', startsAt: '2026-01-01', endsAt: '2026-12-31' }],
      summary: { ...summary, validity: { status: 'VALID', reason: null, startsOn: '2026-01-01', endsOn: '2026-12-31', daysLeft: 90 } },
    }, /CTR-2026-0001/);

    expect((await screen.findByTestId('validity-badge')).textContent).toMatch(/^Valid until/);
    expect(screen.queryByText(/Gold|undefined/)).toBeNull();
  });

  it('offers the Administrator the new-contract action', async () => {
    signIn(ADMIN);
    await renderTab({
      ...receptionResponse,
      contracts: [{ ...receptionResponse.contracts[0], amount: 100, billingPeriod: 'MONTHLY' }],
      summary: { ...receptionResponse.summary, outstanding: 0, overdueCount: 0 },
    });

    expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
  });
});
