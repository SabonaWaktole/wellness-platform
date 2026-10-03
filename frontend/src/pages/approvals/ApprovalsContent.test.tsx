import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApprovalsContent } from './ApprovalsContent';
import { offerService } from '../../services/offerService';
import { ToastProvider } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../services/offerService', () => ({ offerService: { pendingApprovals: vi.fn() } }));

const row = (overrides: object = {}) => ({
  id: 'ap1',
  offerId: 'o1',
  dealId: 'd1',
  companyName: 'Kafe Blloku',
  dealTitle: null,
  reference: 'OF-2026-0007',
  dealOwnerUserId: 'u-a',
  dealOwnerName: 'Besa Test',
  requestedByUserId: 'u-a',
  requestedByName: 'Besa Test',
  requestedPercent: '15.00',
  listPriceAtRequest: '49.40',
  reason: 'Loyal customer',
  createdAt: '2026-10-03T10:00:00Z',
  ...overrides,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/approvals']}>
        <Routes>
          <Route path="/:tenantSlug/approvals" element={<ApprovalsContent />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('Discount approvals list (FR-DSC-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { userId: 'u-m', email: 'm@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions: { 'discounts.approve': 'TEAM' } },
      isAuthenticated: true,
    } as any);
  });

  it('FR-DSC-06 lists pending requests with company, salesperson, list price, requested percent and reason source', async () => {
    vi.mocked(offerService.pendingApprovals).mockResolvedValue({ data: [row()], total: 1, page: 1, pageSize: 25 });
    renderPage();
    expect(await screen.findByText('OF-2026-0007')).toBeInTheDocument();
    expect(screen.getByText(/Kafe Blloku/)).toBeInTheDocument();
    expect(screen.getByText('Besa Test')).toBeInTheDocument();
    expect(screen.getByText(/15\.00%/)).toBeInTheDocument();
    expect(offerService.pendingApprovals).toHaveBeenCalledWith('acme', 1, 25);
  });

  it('FR-DSC-06 an empty queue explains itself', async () => {
    vi.mocked(offerService.pendingApprovals).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25 });
    renderPage();
    expect(await screen.findByText('No pending requests')).toBeInTheDocument();
  });
});
