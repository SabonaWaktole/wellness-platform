import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PricingContent } from './PricingContent';
import { pricingService } from '../../services/pricingService';
import { dealService } from '../../services/dealService';
import { clientService } from '../../services/clientService';
import { useActiveLookups } from '../../hooks/useActiveLookups';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../../components/ui/Toast';
import type { OfferView, PricingScreenView } from '../../types/offer';

vi.mock('../../services/pricingService', () => ({ pricingService: { calculate: vi.fn() } }));
vi.mock('../../services/dealService', () => ({ dealService: { offers: vi.fn(), list: vi.fn(), saveOffer: vi.fn() } }));
vi.mock('../../services/clientService', () => ({ clientService: { getClient: vi.fn() } }));
vi.mock('../../hooks/useActiveLookups');
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));

const label = (id: string, nameEn: string) => ({ id, nameSq: nameEn, nameEn });

const view = (overrides: Partial<PricingScreenView> = {}): PricingScreenView => ({
  subject: {
    clientId: 'c1',
    companyName: 'Restorant Tirana',
    dealId: 'd1',
    dealOpen: true,
    employeeCount: 2,
    businessTypeId: 'bt-r',
    city: label('city-t', 'Tirana'),
    area: label('area-t', 'Tirana'),
  },
  inputs: {
    employees: 2,
    businessTypeId: 'bt-r',
    riskLevel: { ...label('r2', 'Level 2'), level: 2 },
    zoneId: 'z1',
    frequencyId: 'f2',
    packageId: 'pkg',
    discountPercent: '0.00',
  },
  options: {
    zones: [
      { ...label('z1', 'Tirana centre'), surchargePercent: '0.00' },
      { ...label('z2', 'Tirana suburbs'), surchargePercent: '15.00' },
    ],
    frequencies: [label('f2', 'Twice a year'), label('f12', 'Monthly')],
    packages: [
      {
        ...label('pkg', 'Standard'),
        descriptionSq: null,
        descriptionEn: null,
        isDefault: true,
        services: [{ ...label('s1', 'Risk assessment'), descriptionSq: null, descriptionEn: null }],
      },
    ],
    discountCapPercent: '10.00',
  },
  result: {
    kind: 'PRICED',
    baseFee: '38.00',
    riskFee: '3.80',
    visitFee: '7.60',
    locationFee: '0.00',
    listPrice: '49.40',
    discountPercent: '0.00',
    discountAmount: '0.00',
    netMonthlyPrice: '49.40',
    pricePerEmployee: '24.70',
    annualValue: '592.80',
  },
  discountAboveCap: false,
  ...overrides,
});

const signIn = (permissions: Record<string, string | boolean> = { 'offers.edit': 'OWN', 'commercial.view': 'OWN', 'companies.edit': 'OWN', 'script.view': true }) =>
  useAuthStore.setState({
    user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', tenantCurrency: 'EUR', tenantLocale: 'en-US', permissions },
    isAuthenticated: true,
  } as any);

const renderAt = (path: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:tenantSlug/deals/:dealId/pricing" element={<PricingContent />} />
          <Route path="/:tenantSlug/clients/:clientId/pricing" element={<PricingContent />} />
          <Route path="/:tenantSlug/deals/:dealId" element={<p>deal page</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const amount = (key: string) => screen.getByTestId(`amount-${key}`).textContent;

describe('Pricing screen (M2 Slice 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn();
    vi.mocked(clientService.getClient).mockResolvedValue({ contacts: [] } as any);
    vi.mocked(useActiveLookups).mockReturnValue([
      { id: 'bt-r', nameSq: 'Restorant', nameEn: 'Restaurant', order: 1, active: true, riskLevelId: 'r2' },
      { id: 'bt-c', nameSq: 'Ndërtim', nameEn: 'Construction', order: 2, active: true, riskLevelId: 'r3' },
    ] as any);
    vi.mocked(dealService.offers).mockResolvedValue([]);
    vi.mocked(pricingService.calculate).mockResolvedValue(view());
  });

  it('FR-PRC-01 the breakdown shows only the numbers the server returns, verbatim', async () => {
    vi.mocked(pricingService.calculate).mockResolvedValue(
      view({
        result: {
          kind: 'PRICED',
          baseFee: '12.34',
          riskFee: '0.01',
          visitFee: '5.55',
          locationFee: '1.11',
          listPrice: '99.99',
          discountPercent: '3.00',
          discountAmount: '7.77',
          netMonthlyPrice: '77.77',
          pricePerEmployee: '33.33',
          annualValue: '111.11',
        },
      })
    );
    renderAt('/acme/deals/d1/pricing');
    await screen.findByTestId('amount-listPrice');
    expect(amount('baseFee')).toBe('€12.34');
    expect(amount('riskFee')).toBe('€0.01');
    expect(amount('visitFee')).toBe('€5.55');
    expect(amount('locationFee')).toBe('€1.11');
    expect(amount('listPrice')).toBe('€99.99');
    expect(amount('discountAmount')).toBe('−€7.77');
    expect(amount('netMonthlyPrice')).toBe('€77.77');
    expect(amount('pricePerEmployee')).toBe('€33.33');
    expect(amount('annualValue')).toBe('€111.11');
    expect(pricingService.calculate).toHaveBeenCalledWith('acme', { dealId: 'd1' }, {});
  });

  it('FR-PRC-01 changing an input recalculates on the server', async () => {
    renderAt('/acme/deals/d1/pricing');
    fireEvent.change(await screen.findByLabelText('Visit frequency'), { target: { value: 'f12' } });
    await waitFor(() =>
      expect(pricingService.calculate).toHaveBeenLastCalledWith('acme', { dealId: 'd1' }, expect.objectContaining({ frequencyId: 'f12', employees: 2 }))
    );
  });

  it('FR-PRC-02 FR-PRC-03 the inputs come from the company: its city, read-only, and the risk of its business type', async () => {
    renderAt('/acme/deals/d1/pricing');
    expect(await screen.findByText('Tirana, Tirana')).toBeInTheDocument();
    expect(screen.queryByLabelText('City')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit the company' })).toHaveAttribute('href', '/acme/clients/c1/edit');
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Business type')).toHaveValue('bt-r');
  });

  it('FR-PRC-06 the zone is chosen only when the city has two or more', async () => {
    const { unmount } = renderAt('/acme/deals/d1/pricing');
    const select = await screen.findByLabelText('Price zone');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['Tirana centre (+0%)', 'Tirana suburbs (+15%)'])
    );
    unmount();

    vi.mocked(pricingService.calculate).mockResolvedValue(
      view({ options: { ...view().options, zones: [{ ...label('z3', 'Kamëz and Vorë'), surchargePercent: '30.00' }] } })
    );
    renderAt('/acme/deals/d1/pricing');
    expect(await screen.findByText('Kamëz and Vorë (+30%)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Price zone')).not.toBeInTheDocument();
  });

  it('FR-PRC-02 a company without a city asks to complete the company, with a link to it', async () => {
    vi.mocked(pricingService.calculate).mockResolvedValue(view({ result: { kind: 'COMPANY_INCOMPLETE', missing: ['cityId'] } }));
    renderAt('/acme/deals/d1/pricing');
    expect(await screen.findByText('Complete the company first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Complete the company' })).toHaveAttribute('href', '/acme/clients/c1/edit');
    expect(screen.getByRole('button', { name: 'Save the offer' })).toBeDisabled();
  });

  it('FR-PRC-07 "Price on request" is shown with its reason, and the draft can still be saved', async () => {
    vi.mocked(pricingService.calculate).mockResolvedValue(view({ result: { kind: 'PRICE_ON_REQUEST', reason: 'NO_BAND' } }));
    renderAt('/acme/deals/d1/pricing');
    expect(await screen.findByText('Price on request')).toBeInTheDocument();
    expect(screen.getByText('No employee band covers this number of employees.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save the offer' })).toBeEnabled();
  });

  it('FR-DSC-03 above the cap, Save becomes Request approval once a reason is given', async () => {
    renderAt('/acme/deals/d1/pricing');
    expect(await screen.findByText('Up to 10% without approval.')).toBeInTheDocument();
    vi.mocked(pricingService.calculate).mockResolvedValue(view({ discountAboveCap: true }));
    fireEvent.change(screen.getByLabelText('Discount %'), { target: { value: '20' } });
    expect(await screen.findByText('A discount above 10% needs approval. Give a reason to request it.')).toBeInTheDocument();
    // No reason yet: the request cannot go out.
    expect(screen.getByRole('button', { name: 'Request approval' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason for the higher discount'), { target: { value: 'Loyal customer' } });
    const button = await screen.findByRole('button', { name: 'Request approval' });
    expect(button).toBeEnabled();
    vi.mocked(dealService.saveOffer).mockResolvedValue({ status: 'PENDING_APPROVAL' } as OfferView);
    fireEvent.click(button);
    await waitFor(() =>
      expect(dealService.saveOffer).toHaveBeenCalledWith(
        'acme',
        'd1',
        expect.objectContaining({ discountPercent: '20', reason: 'Loyal customer' })
      )
    );
    expect(await screen.findByText('deal page')).toBeInTheDocument();
  });

  it('FR-DSC-08 a lower discount than the approved one on the same list price asks for no new approval', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([
      {
        id: 'o1',
        status: 'READY',
        superseded: false,
        pendingApproval: null,
        approvedDiscount: { listPriceAtRequest: '49.40', approvedPercent: '15.00' },
        discountPercent: '15.00',
        note: null,
        contactPersonId: null,
      } as unknown as OfferView,
    ]);
    vi.mocked(pricingService.calculate).mockResolvedValue(
      view({ discountAboveCap: true, inputs: { ...view().inputs, discountPercent: '13.00' } })
    );
    vi.mocked(dealService.saveOffer).mockResolvedValue({ status: 'DRAFT' } as OfferView);
    renderAt('/acme/deals/d1/pricing');
    expect(await screen.findByText('Covered by the approved 15% discount. Lowering the discount keeps the approval.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Reason for the higher discount')).not.toBeInTheDocument();
    const button = await screen.findByRole('button', { name: 'Save the offer' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() =>
      expect(dealService.saveOffer).toHaveBeenCalledWith('acme', 'd1', expect.objectContaining({ discountPercent: '13.00', reason: null }))
    );
  });

  it('FR-PRC-09 on "Price on request" a Sales User proposes a manual price with a reason for approval', async () => {
    vi.mocked(pricingService.calculate).mockResolvedValue(view({ result: { kind: 'PRICE_ON_REQUEST', reason: 'NO_BAND' } }));
    vi.mocked(dealService.saveOffer).mockResolvedValue({ status: 'PENDING_APPROVAL' } as OfferView);
    renderAt('/acme/deals/d1/pricing');
    fireEvent.change(await screen.findByLabelText('Manual monthly price'), { target: { value: '300' } });
    expect(await screen.findByText('Optional. Your price is sent to the Sales Manager for approval.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request approval' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason for the manual price'), { target: { value: 'Large site' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Request approval' }));
    await waitFor(() =>
      expect(dealService.saveOffer).toHaveBeenCalledWith(
        'acme',
        'd1',
        expect.objectContaining({ manualMonthlyPrice: '300', reason: 'Large site' })
      )
    );
  });

  it('FR-PRC-09 whoever holds discounts.approve saves a manual price directly', async () => {
    signIn({ 'offers.edit': 'TEAM', 'commercial.view': 'TEAM', 'discounts.approve': 'TEAM' });
    vi.mocked(pricingService.calculate).mockResolvedValue(view({ result: { kind: 'PRICE_ON_REQUEST', reason: 'NO_BAND' } }));
    renderAt('/acme/deals/d1/pricing');
    fireEvent.change(await screen.findByLabelText('Manual monthly price'), { target: { value: '300' } });
    fireEvent.change(await screen.findByLabelText('Reason for the manual price'), { target: { value: 'Agreed' } });
    expect(await screen.findByRole('button', { name: 'Save the offer' })).toBeEnabled();
    // A manual price takes no discount.
    fireEvent.change(screen.getByLabelText('Discount %'), { target: { value: '5' } });
    expect(await screen.findByText('A manual price takes no discount. Set the discount to 0.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save the offer' })).toBeDisabled();
  });

  it('FR-PRC-04 a different employee count offers to update the company too, and sends the choice', async () => {
    vi.mocked(dealService.saveOffer).mockResolvedValue({} as OfferView);
    renderAt('/acme/deals/d1/pricing');
    await screen.findByTestId('amount-listPrice');
    expect(screen.queryByLabelText(/Also update the company/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Employees'), { target: { value: '12' } });
    fireEvent.click(await screen.findByLabelText('Also update the company (now 2)'));
    await waitFor(() => expect(pricingService.calculate).toHaveBeenLastCalledWith('acme', { dealId: 'd1' }, expect.objectContaining({ employees: 12 })));
    fireEvent.click(screen.getByRole('button', { name: 'Save the offer' }));
    await waitFor(() =>
      expect(dealService.saveOffer).toHaveBeenCalledWith('acme', 'd1', expect.objectContaining({ employees: 12, alsoUpdateCompany: true }))
    );
  });

  it('FR-PRC-12 saving creates the deal\'s draft offer and returns to the deal', async () => {
    vi.mocked(dealService.saveOffer).mockResolvedValue({} as OfferView);
    renderAt('/acme/deals/d1/pricing');
    await screen.findByTestId('amount-listPrice');
    fireEvent.change(screen.getByLabelText('Note on the offer'), { target: { value: 'Pagesa çdo tremujor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the offer' }));
    await waitFor(() =>
      expect(dealService.saveOffer).toHaveBeenCalledWith('acme', 'd1', {
        employees: 2,
        businessTypeId: 'bt-r',
        zoneId: 'z1',
        frequencyId: 'f2',
        packageId: 'pkg',
        discountPercent: '0.00',
        note: 'Pagesa çdo tremujor',
        alsoUpdateCompany: false,
        contactPersonId: null,
        reason: null,
        manualMonthlyPrice: null,
      })
    );
    expect(await screen.findByText('deal page')).toBeInTheDocument();
  });

  it('FR-OFR-02 the offer is addressed to the primary contact unless another is chosen', async () => {
    vi.mocked(clientService.getClient).mockResolvedValue({
      contacts: [
        { id: 'cp-1', name: 'Elira Hoxha', position: 'Administratore', isPrimary: true },
        { id: 'cp-2', name: 'Gëzim Çela', position: 'Menaxher', isPrimary: false },
      ],
    } as any);
    vi.mocked(dealService.saveOffer).mockResolvedValue({} as OfferView);
    renderAt('/acme/deals/d1/pricing');
    await screen.findByTestId('amount-listPrice');
    const contact = await screen.findByLabelText('Addressed to');
    expect(within(contact).getByRole('option', { name: 'Elira Hoxha (primary contact)' })).toBeInTheDocument();
    fireEvent.change(contact, { target: { value: 'cp-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the offer' }));
    await waitFor(() => expect(dealService.saveOffer).toHaveBeenCalledWith('acme', 'd1', expect.objectContaining({ contactPersonId: 'cp-2' })));
  });

  it('FR-OFR-04 opened on a deal with a draft, the screen starts from the draft\'s inputs', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([
      {
        id: 'o1',
        status: 'DRAFT',
        employeesPriced: 3,
        zoneId: 'z2',
        frequencyId: 'f12',
        packageId: 'pkg',
        note: 'Ruaj',
        discountPercent: '5.00',
        pricingInputs: { businessType: label('bt-c', 'Construction') },
      } as OfferView,
    ]);
    renderAt('/acme/deals/d1/pricing');
    await waitFor(() =>
      expect(pricingService.calculate).toHaveBeenCalledWith('acme', { dealId: 'd1' }, {
        employees: 3,
        businessTypeId: 'bt-c',
        zoneId: 'z2',
        frequencyId: 'f12',
        packageId: 'pkg',
        discountPercent: '5.00',
      })
    );
    expect(await screen.findByLabelText('Note on the offer')).toHaveValue('Ruaj');
  });

  it('FR-PRC-12 from a company with no open deal the price is calculated but cannot be saved', async () => {
    vi.mocked(dealService.list).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    vi.mocked(pricingService.calculate).mockResolvedValue(view({ subject: { ...view().subject, dealId: null, dealOpen: null } }));
    renderAt('/acme/clients/c1/pricing');
    expect(await screen.findByText('This company has no open deal. Create one to save an offer; you can still calculate.')).toBeInTheDocument();
    expect(pricingService.calculate).toHaveBeenCalledWith('acme', { clientId: 'c1' }, {});
    expect(screen.queryByRole('button', { name: 'Save the offer' })).not.toBeInTheDocument();
  });

  it('FR-PRC-12 from a company, the offer is saved on the open deal chosen', async () => {
    vi.mocked(dealService.list).mockResolvedValue({
      items: [{ id: 'd7', title: 'Renewal 2027', companyName: 'Restorant Tirana', type: 'RENEWAL' } as any],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    vi.mocked(dealService.saveOffer).mockResolvedValue({} as OfferView);
    renderAt('/acme/clients/c1/pricing');
    fireEvent.change(await screen.findByLabelText('Deal'), { target: { value: 'd7' } });
    await waitFor(() => expect(pricingService.calculate).toHaveBeenLastCalledWith('acme', { dealId: 'd7' }, expect.anything()));
    fireEvent.click(await screen.findByRole('button', { name: 'Save the offer' }));
    await waitFor(() => expect(dealService.saveOffer).toHaveBeenCalledWith('acme', 'd7', expect.anything()));
  });
});
