import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PricingSettingsContent } from './PricingSettingsContent';
import { usePricingConfig } from '../../../hooks/usePricingConfig';
import { useActiveLookups } from '../../../hooks/useActiveLookups';
import { useAuthStore } from '../../../store/useAuthStore';
import type { PricingConfiguration } from '../../../services/pricingService';
import '../../../i18n';

vi.mock('../../../hooks/usePricingConfig');
vi.mock('../../../hooks/useActiveLookups');

const CONFIG: PricingConfiguration = {
  currency: 'EUR',
  discountCapPercent: '10.00',
  bands: [{ id: 'b1', minEmployees: 1, maxEmployees: 10, baseFee: '30.00', perEmployeeFee: '8.00', order: 1, active: true }],
  riskSurcharges: [
    { riskLevelId: 'rl1', level: 1, nameSq: 'Niveli 1', nameEn: 'Level 1', active: true, riskSurchargePercent: '0.00' },
    { riskLevelId: 'rl2', level: 2, nameSq: 'Niveli 2', nameEn: 'Level 2', active: true, riskSurchargePercent: '10.00' },
    { riskLevelId: 'rl9', level: 9, nameSq: 'Niveli 9', nameEn: 'Level 9', active: true, riskSurchargePercent: null },
  ],
  frequencies: [
    { id: 'f2', nameSq: '2 herë në vit', nameEn: 'Twice a year', visitsPerYear: 2, pricingType: 'PERCENT', frequencyValue: '20.00', order: 1, active: true },
    { id: 'fa', nameSq: 'Sipas nevojës', nameEn: 'Ad hoc', visitsPerYear: null, pricingType: 'FIXED', frequencyValue: '15.00', order: 2, active: true },
  ],
  zones: [
    { id: 'zc', nameSq: 'Tirana qendër', nameEn: 'Tirana centre', surchargePercent: '0.00', cityIds: ['c-tirane'], order: 1, active: true },
    { id: 'zk', nameSq: 'Kamëz dhe Vorë', nameEn: 'Kamëz and Vorë', surchargePercent: '30.00', cityIds: ['c-kamez'], order: 2, active: true },
  ],
};

const AREAS = [
  { id: 'a-tirane', nameSq: 'Tiranë', nameEn: 'Tirana', order: 1, active: true },
  { id: 'a-shkoder', nameSq: 'Shkodër', nameEn: 'Shkodër', order: 2, active: true },
];
const CITIES = [
  { id: 'c-tirane', nameSq: 'Tiranë', nameEn: 'Tirana', areaId: 'a-tirane', order: 1, active: true },
  { id: 'c-kamez', nameSq: 'Kamëz', nameEn: 'Kamëz', areaId: 'a-tirane', order: 2, active: true },
  { id: 'c-shkoder', nameSq: 'Shkodër', nameEn: 'Shkodër', areaId: 'a-shkoder', order: 1, active: true },
];

const pricing = {
  config: CONFIG as PricingConfiguration | null,
  citiesWithoutZone: [
    { id: 'c-shkoder', nameSq: 'Shkodër', nameEn: 'Shkodër', areaId: 'a-shkoder', areaNameSq: 'Shkodër', areaNameEn: 'Shkodër' },
  ],
  loading: false,
  loadFailed: false,
  fetchConfig: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reorder: vi.fn(),
  setActive: vi.fn(),
  remove: vi.fn(),
  setZoneCities: vi.fn(),
  setRiskSurcharge: vi.fn(),
  setDiscountCap: vi.fn(),
  testCalculation: vi.fn(),
};

const Location = () => <p data-testid="location">{useLocation().pathname}</p>;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/:tenantSlug/settings/pricing/:tab?"
          element={
            <>
              <PricingSettingsContent />
              <Location />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

const apiError = (status: number, data: object) => Object.assign(new Error('refused'), { response: { status, data } });

describe('PricingSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pricing.config = CONFIG;
    pricing.loadFailed = false;
    (usePricingConfig as any).mockImplementation(() => pricing);
    (useActiveLookups as any).mockImplementation((list: string) => (list === 'areas' ? AREAS : CITIES));
    for (const write of ['create', 'update', 'setZoneCities', 'setRiskSurcharge', 'setDiscountCap'] as const) {
      pricing[write].mockResolvedValue(undefined);
    }
    useAuthStore.setState({ user: { tenantCurrency: 'EUR', tenantLocale: 'en-US' } as any });
  });

  it('FR-PCF-01 opens on the employee bands and loads the configuration', () => {
    renderAt('/acme/settings/pricing');

    expect(screen.getByRole('tab', { name: 'Employee bands', selected: true })).toBeDefined();
    const row = screen.getByTestId('band-row-b1');
    expect(within(row).getByText('€30.00')).toBeDefined();
    expect(within(row).getByText('€8.00')).toBeDefined();
    expect(pricing.fetchConfig).toHaveBeenCalled();
  });

  it('switches tabs through the URL', () => {
    renderAt('/acme/settings/pricing');

    fireEvent.click(screen.getByRole('tab', { name: 'Test calculator' }));

    expect(screen.getByTestId('location').textContent).toBe('/acme/settings/pricing/calculator');
  });

  it('shows the loading failure instead of a panel', () => {
    pricing.config = null;
    pricing.loadFailed = true;
    renderAt('/acme/settings/pricing');

    expect(screen.getByRole('alert').textContent).toBe('The pricing configuration could not be loaded.');
  });

  it('FR-PCF-01 adds a band, sending the amounts as typed', async () => {
    renderAt('/acme/settings/pricing/bands');

    fireEvent.click(screen.getByRole('button', { name: 'Add band' }));
    expect((screen.getByLabelText('From (employees)') as HTMLInputElement).value).toBe('11');
    fireEvent.change(screen.getByLabelText('To (employees)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Base fee'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Per extra employee'), { target: { value: '6.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(pricing.create).toHaveBeenCalledWith('bands', { minEmployees: 11, maxEmployees: 50, baseFee: '100', perEmployeeFee: '6.50' })
    );
  });

  it('FR-PCF-01 explains an overlapping band with the band it overlaps', async () => {
    pricing.create.mockRejectedValue(apiError(400, { code: 'BANDS_OVERLAP', overlapsWith: { minEmployees: 1, maxEmployees: 10 } }));
    renderAt('/acme/settings/pricing/bands');

    fireEvent.click(screen.getByRole('button', { name: 'Add band' }));
    fireEvent.change(screen.getByLabelText('From (employees)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe('This band overlaps the band 1–10 employees.');
  });

  it('FR-PCF-02 saves a risk level\'s surcharge, and warns where none is set', async () => {
    renderAt('/acme/settings/pricing/risk');

    expect(screen.getByText(/Without a surcharge, companies of this risk level get "Price on request"/)).toBeDefined();
    fireEvent.change(screen.getByLabelText('Level 2'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save: Level 2' }));

    await waitFor(() => expect(pricing.setRiskSurcharge).toHaveBeenCalledWith('rl2', '12'));
    expect((await screen.findByRole('status')).textContent).toBe('Saved.');
  });

  it('FR-PCF-03 shows a refused percentage in words', async () => {
    pricing.setRiskSurcharge.mockRejectedValue(apiError(400, { code: 'INVALID_PERCENT', field: 'riskSurchargePercent' }));
    renderAt('/acme/settings/pricing/risk');

    fireEvent.change(screen.getByLabelText('Level 2'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save: Level 2' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Enter a percentage from 0 to 1000/);
  });

  it('FR-PCF-04 lists each frequency with its pricing, and adds "3 per year, 28%"', async () => {
    renderAt('/acme/settings/pricing/frequencies');

    expect(within(screen.getByTestId('lookup-row-f2')).getByText('20.00%')).toBeDefined();
    expect(within(screen.getByTestId('lookup-row-fa')).getByText('€15.00')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    fireEvent.change(screen.getByLabelText('Albanian name'), { target: { value: '3 herë në vit' } });
    fireEvent.change(screen.getByLabelText('English name'), { target: { value: '3 per year' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText('Visits per year'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(pricing.create).toHaveBeenCalledWith('frequencies', {
        nameSq: '3 herë në vit',
        nameEn: '3 per year',
        pricingType: 'PERCENT',
        frequencyValue: '28',
        visitsPerYear: 3,
      })
    );
  });

  it('FR-PCF-05 warns about active cities in no zone', () => {
    renderAt('/acme/settings/pricing/zones');

    const warning = screen.getByRole('region', { name: '1 active city is in no zone' });
    expect(within(warning).getByText('Shkodër (Shkodër)')).toBeDefined();
  });

  it('FR-PCF-05 adds a city to a zone from the picker, keeping the ones it has', async () => {
    renderAt('/acme/settings/pricing/zones');

    fireEvent.click(screen.getByRole('button', { name: 'Cities of Tirana centre' }));
    const picker = screen.getByRole('region', { name: 'Cities of Tirana centre' });
    expect((within(picker).getByLabelText('Tirana') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(picker).getByLabelText('Shkodër'));
    fireEvent.click(within(picker).getByRole('button', { name: 'Save cities' }));

    await waitFor(() => expect(pricing.setZoneCities).toHaveBeenCalledWith('zc', ['c-tirane', 'c-shkoder']));
  });

  it('FR-PCF-07 changes the discount cap', async () => {
    renderAt('/acme/settings/pricing/cap');

    fireEvent.change(screen.getByLabelText('Discount cap (%)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(pricing.setDiscountCap).toHaveBeenCalledWith('15'));
  });

  it('FR-PCF-09 the test calculator shows the server\'s breakdown for Example A: €49.40', async () => {
    pricing.testCalculation.mockResolvedValue({
      kind: 'PRICED',
      baseFee: '38.00',
      riskFee: '3.80',
      visitFee: '7.60',
      locationFee: '0.00',
      listPrice: '49.40',
      pricePerEmployee: '24.70',
      annualValue: '592.80',
    });
    renderAt('/acme/settings/pricing/calculator');

    fireEvent.change(screen.getByLabelText('Employees'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Risk level'), { target: { value: 'rl2' } });
    fireEvent.change(screen.getByLabelText('Visit frequency'), { target: { value: 'f2' } });
    fireEvent.change(screen.getByLabelText('Price zone'), { target: { value: 'zc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));

    expect((await screen.findByTestId('list-price')).textContent).toBe('€49.40');
    expect(pricing.testCalculation).toHaveBeenCalledWith({ employees: 2, riskLevelId: 'rl2', frequencyId: 'f2', zoneId: 'zc' });
    expect(screen.getByText('€592.80')).toBeDefined();
  });

  it('FR-PCF-09 says why a price is on request', async () => {
    pricing.testCalculation.mockResolvedValue({ kind: 'PRICE_ON_REQUEST', reason: 'NO_BAND' });
    renderAt('/acme/settings/pricing/calculator');

    fireEvent.change(screen.getByLabelText('Employees'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Risk level'), { target: { value: 'rl2' } });
    fireEvent.change(screen.getByLabelText('Visit frequency'), { target: { value: 'f2' } });
    fireEvent.change(screen.getByLabelText('Price zone'), { target: { value: 'zc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));

    expect(await screen.findByText('Price on request')).toBeDefined();
    expect(screen.getByText('No active employee band covers this number of employees.')).toBeDefined();
  });
});
