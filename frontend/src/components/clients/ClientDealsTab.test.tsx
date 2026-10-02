import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ClientDealsTab } from './ClientDealsTab';
import { dealService } from '../../services/dealService';
import { useAuthStore } from '../../store/useAuthStore';
import type { DealSummary } from '../../types/deal';

vi.mock('../../services/dealService', () => ({ dealService: { list: vi.fn() } }));
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));

const deal = (id: string, overrides: Partial<DealSummary>): DealSummary => ({
  id,
  clientId: 'c1',
  companyName: 'Kafe Blloku',
  type: 'NEW_CONTRACT',
  title: null,
  stage: 'NEW_LEAD',
  ownerUserId: 'u-a',
  ownerName: 'Besa Test',
  expectedCloseDate: null,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
  closedAt: null,
  nextFollowUpAt: null,
  ...overrides,
});

const renderTab = (permissions: Record<string, string>) => {
  useAuthStore.setState({
    user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions },
    isAuthenticated: true,
  } as any);
  return render(
    <MemoryRouter initialEntries={['/acme/clients/c1']}>
      <Routes>
        <Route path="/:tenantSlug/clients/:clientId" element={<ClientDealsTab clientId="c1" />} />
        <Route path="/:tenantSlug/deals/new" element={<p>new deal form</p>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Company page → Deals tab (FR-DEAL-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dealService.list).mockResolvedValue({
      items: [deal('won', { stage: 'WON', type: 'NEW_CONTRACT' }), deal('open', { type: 'EXTRA_SERVICES' })],
      total: 2,
      page: 1,
      pageSize: 100,
    });
  });

  it("FR-DEAL-01 lists the company's deals, open and closed, each with its stage", async () => {
    renderTab({ 'deals.view': 'OWN', 'deals.edit': 'OWN' });
    expect(await screen.findByText('Kafe Blloku – New contract')).toBeInTheDocument();
    expect(screen.getByText('Kafe Blloku – Extra services')).toBeInTheDocument();
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(dealService.list).toHaveBeenCalledWith('acme', { clientId: 'c1', pageSize: 100 });
  });

  it('FR-DEAL-01 "New deal" opens the form for this company, only for someone who may create deals', async () => {
    const { unmount } = renderTab({ 'deals.view': 'ALL' });
    await screen.findByText('Kafe Blloku – New contract');
    expect(screen.queryByRole('button', { name: 'New deal' })).toBeNull();
    unmount();

    renderTab({ 'deals.view': 'OWN', 'deals.edit': 'OWN' });
    fireEvent.click(await screen.findByRole('button', { name: 'New deal' }));
    await waitFor(() => expect(screen.getByText('new deal form')).toBeInTheDocument());
  });
});
