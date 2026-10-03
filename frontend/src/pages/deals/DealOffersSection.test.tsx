import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DealOffersSection } from './DealOffersSection';
import { dealService } from '../../services/dealService';
import { useAuthStore } from '../../store/useAuthStore';
import type { DealDetail } from '../../types/deal';
import type { OfferView } from '../../types/offer';

vi.mock('../../services/dealService', () => ({ dealService: { offers: vi.fn() } }));

const deal = { id: 'd1', clientId: 'c1', stage: 'OFFER_PREPARED' } as DealDetail;

const offer = (overrides: Partial<OfferView> = {}): OfferView => ({
  id: 'o1',
  dealId: 'd1',
  clientId: 'c1',
  status: 'DRAFT',
  language: 'sq',
  note: 'Pagesa çdo tremujor',
  createdByUserId: 'u-a',
  createdByName: 'Besa Test',
  createdAt: '2026-10-03T08:00:00Z',
  updatedAt: '2026-10-03T09:00:00Z',
  employeesPriced: 2,
  packageId: 'pkg',
  frequencyId: 'f2',
  zoneId: 'z1',
  pricingInputs: { employees: 2, package: { id: 'pkg', nameSq: 'Standart', nameEn: 'Standard' } },
  priceOnRequest: null,
  services: [],
  listPrice: '49.40',
  discountPercent: '10.00',
  discountAmount: '4.94',
  netMonthlyPrice: '44.46',
  annualValue: '533.52',
  ...overrides,
});

const signIn = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', tenantCurrency: 'EUR', tenantLocale: 'en-US', permissions },
    isAuthenticated: true,
  } as any);

const renderSection = (d: DealDetail = deal) =>
  render(
    <MemoryRouter initialEntries={['/acme/deals/d1']}>
      <Routes>
        <Route path="/:tenantSlug/deals/:dealId" element={<DealOffersSection deal={d} />} />
        <Route path="/:tenantSlug/deals/:dealId/pricing" element={<p>pricing screen</p>} />
      </Routes>
    </MemoryRouter>
  );

describe('Deal offers section (FR-DEAL-03, M2 Slice 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ 'deals.view': 'OWN', 'commercial.view': 'OWN', 'offers.edit': 'OWN' });
  });

  it('FR-DEAL-03 lists the deal\'s draft offer with its net monthly price, discount and package', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer()]);
    renderSection();
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('€44.46 / month')).toBeInTheDocument();
    expect(screen.getByText(/€49\.40.*10\.00%/)).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Pagesa çdo tremujor')).toBeInTheDocument();
    expect(dealService.offers).toHaveBeenCalledWith('acme', 'd1');
  });

  it('FR-PRC-07 a draft without a price shows "Price on request"', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer({ priceOnRequest: 'NO_BAND', listPrice: null, netMonthlyPrice: null })]);
    renderSection();
    expect(await screen.findByText('Price on request')).toBeInTheDocument();
  });

  it('FR-PRC-01 the offer is edited on the pricing screen, opened from the deal', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer()]);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit offer' }));
    expect(await screen.findByText('pricing screen')).toBeInTheDocument();
  });

  it('FR-PRC-01 with no offer yet, "Calculate price" opens the pricing screen', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([]);
    renderSection();
    expect(await screen.findByText('No offer yet. Calculate a price to prepare one.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate price' }));
    expect(await screen.findByText('pricing screen')).toBeInTheDocument();
  });

  it('a closed deal offers no pricing action', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer()]);
    renderSection({ ...deal, stage: 'LOST' });
    await screen.findByText('Draft');
    expect(screen.queryByRole('button', { name: 'Edit offer' })).not.toBeInTheDocument();
  });

  it('FR-RBAC-17 without commercial.view the offers are not requested', () => {
    signIn({ 'deals.view': 'OWN' });
    renderSection();
    expect(screen.getByText('Offer figures are not shown for your role.')).toBeInTheDocument();
    expect(dealService.offers).not.toHaveBeenCalled();
  });
});
