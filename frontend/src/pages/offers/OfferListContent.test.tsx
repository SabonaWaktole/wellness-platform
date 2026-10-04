import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OfferListContent } from './OfferListContent';
import { offerService } from '../../services/offerService';
import { useAuthStore } from '../../store/useAuthStore';
import type { OfferView } from '../../types/offer';

vi.mock('../../services/offerService', () => ({ offerService: { list: vi.fn() } }));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({
    staff: [
      { id: 'u-a', email: 'a@example.com', role: 'STAFF', firstName: 'Besa', lastName: 'Test' },
      { id: 'u-b', email: 'b@example.com', role: 'STAFF', firstName: 'Dritan', lastName: 'Test' },
    ],
    fetchStaff: vi.fn(),
  }),
}));

const offer = (id: string, overrides: Partial<OfferView> = {}): OfferView =>
  ({
    id,
    dealId: `d-${id}`,
    clientId: 'c1',
    status: 'SENT',
    number: `OF-2026-000${id}`,
    version: 1,
    reference: `OF-2026-000${id}`,
    previousVersionId: null,
    superseded: false,
    readyAt: null,
    sentAt: '2026-10-05T12:00:00.000Z',
    validUntil: '2026-11-04',
    respondedAt: null,
    statusNote: null,
    contactPersonId: null,
    companyName: 'Kafe Blloku',
    dealTitle: null,
    dealOwnerUserId: 'u-a',
    dealOwnerName: 'Besa Test',
    dealOpen: true,
    permittedActions: [],
    language: 'sq',
    note: null,
    createdByUserId: 'u-a',
    createdByName: 'Besa Test',
    createdAt: '2026-10-03T08:00:00Z',
    updatedAt: '2026-10-05T12:00:00Z',
    employeesPriced: 2,
    packageId: 'p',
    frequencyId: 'f',
    zoneId: 'z',
    pricingInputs: null,
    priceOnRequest: null,
    services: [],
    netMonthlyPrice: '49.40',
    ...overrides,
  }) as OfferView;

const signIn = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: { userId: 'u-m', email: 'm@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', tenantCurrency: 'EUR', tenantLocale: 'en-US', permissions },
    isAuthenticated: true,
  } as any);

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/acme/offers']}>
      <Routes>
        <Route path="/:tenantSlug/offers" element={<OfferListContent />} />
        <Route path="/:tenantSlug/deals/:dealId" element={<p>deal page</p>} />
      </Routes>
    </MemoryRouter>
  );

const lastParams = () => vi.mocked(offerService.list).mock.calls.at(-1)?.[1];

describe('Offers list (FR-OFR-14, M2 Slice 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ 'commercial.view': 'TEAM' });
    vi.mocked(offerService.list).mockResolvedValue({
      data: [offer('1'), offer('2', { dealOwnerUserId: 'u-b', dealOwnerName: 'Dritan Test', status: 'DRAFT', reference: 'OF-2026-0002 v2' })],
      total: 2,
      page: 1,
      pageSize: 25,
    });
  });

  it('FR-OFR-14 lists offers by reference, with company, status, salesperson and price', async () => {
    renderList();
    expect((await screen.findAllByText('OF-2026-0001')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('OF-2026-0002 v2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dritan Test').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€49.40 / month').length).toBeGreaterThan(0);
  });

  it('FR-OFR-14 filters by status, salesperson, company and date', async () => {
    renderList();
    await screen.findAllByText('OF-2026-0001');
    fireEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Sent' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ status: ['SENT'], page: 1 }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Salesperson' }), { target: { value: 'u-b' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ ownerUserId: 'u-b' }));
    fireEvent.change(screen.getByLabelText('Search offers'), { target: { value: 'blloku' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'blloku' }));
    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ createdFrom: '2026-10-01' }));
  });

  it("FR-OFR-14 a Sales User, who sees only their own deals' offers, gets no salesperson filter", async () => {
    signIn({ 'commercial.view': 'OWN' });
    renderList();
    await screen.findAllByText('OF-2026-0001');
    expect(screen.queryByRole('combobox', { name: 'Salesperson' })).not.toBeInTheDocument();
  });

  it("a row opens the offer's deal", async () => {
    renderList();
    fireEvent.click((await screen.findAllByText('OF-2026-0001'))[0]);
    expect(await screen.findByText('deal page')).toBeInTheDocument();
  });
});
