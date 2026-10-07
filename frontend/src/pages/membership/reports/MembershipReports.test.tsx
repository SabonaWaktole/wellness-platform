import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MembershipReportsContent } from './MembershipReportsContent';
import { membershipReportService, type MembershipReport } from '../../../services/membershipReportService';
import { membershipSettingsService } from '../../../services/membershipSettingsService';
import { lookupService } from '../../../services/lookupService';
import { useAuthStore } from '../../../store/useAuthStore';
import { downloadBlob } from '../../../utils/downloadBlob';

vi.mock('../../../services/membershipReportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/membershipReportService')>();
  return { ...actual, membershipReportService: { get: vi.fn(), downloadCsv: vi.fn() } };
});
vi.mock('../../../services/membershipSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/membershipSettingsService')>();
  return { ...actual, membershipSettingsService: { getBenefits: vi.fn() } };
});
vi.mock('../../../services/lookupService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/lookupService')>();
  return { ...actual, lookupService: { ...actual.lookupService, list: vi.fn() } };
});
vi.mock('../../../utils/downloadBlob', () => ({ downloadBlob: vi.fn() }));

const reports = vi.mocked(membershipReportService);
const settings = vi.mocked(membershipSettingsService);
const lookups = vi.mocked(lookupService);

/** The worked example of SRS 9.3 as the server sends it. */
const report = (extra: Partial<MembershipReport> = {}): MembershipReport => ({
  period: { preset: 'THIS_MONTH', from: '2027-03-01', to: '2027-03-31' },
  asOf: '2027-03-31',
  active: {
    total: 100,
    perTier: [
      { tier: 'BRONZE', count: 60, share: '60.00' },
      { tier: 'SILVER', count: 25, share: '25.00' },
      { tier: 'GOLD', count: 10, share: '10.00' },
      { tier: 'VIP', count: 5, share: '5.00' },
    ],
    monthly: [{ month: '2027-03', total: 100, perTier: [{ tier: 'BRONZE', count: 60 }, { tier: 'SILVER', count: 25 }, { tier: 'GOLD', count: 10 }, { tier: 'VIP', count: 5 }] }],
  },
  segments: { corporate: { count: 40, share: '40.00' }, individual: { count: 60, share: '60.00' } },
  newMembers: { total: 9, corporate: 4, individual: 5, newPaidMemberships: 5 },
  renewals: {
    due: 15,
    renewed: 10,
    notRenewed: 5,
    rate: '66.67',
    perTier: [
      { tier: 'SILVER', due: 10, renewed: 7, notRenewed: 3, rate: '70.00' },
      { tier: 'GOLD', due: 5, renewed: 3, notRenewed: 2, rate: '60.00' },
    ],
  },
  upgrades: { count: 2, amount: '80.00', perPath: [{ path: 'SILVER>GOLD', count: 2, amount: '80.00' }] },
  downgrades: { total: 5, perPath: [{ path: 'GOLD>SILVER', count: 2 }, { path: 'SILVER>BRONZE', count: 3 }], perReason: [{ reason: 'NOT_RENEWED', count: 5 }] },
  employers: { rows: [{ companyId: 'c1', name: 'Alpha Co', members: 40, sponsoredSilver: 30, upgradedToPaid: 4, formerEmployees: 1 }], totals: { members: 40, sponsoredSilver: 30, upgradedToPaid: 4, formerEmployees: 1 } },
  revenue: {
    count: 17,
    total: '1140.00',
    rows: [
      { kind: 'NEW', tier: 'SILVER', count: 4, total: '240.00' },
      { kind: 'RENEWAL', tier: 'GOLD', count: 3, total: '300.00' },
    ],
  },
  lists: {
    expiring: [{ memberId: 'm1', memberNumber: 'WP-000001', firstName: 'Ana', lastName: 'Hoxha', tier: 'GOLD', date: '2027-04-10', employer: null }],
    vipReviews: [],
    formerEmployees: [{ memberId: 'm2', memberNumber: 'WP-000002', firstName: 'Besa', lastName: 'Krasniqi', tier: 'BRONZE', date: '2027-02-20', employer: { id: 'c1', name: 'Alpha Co' } }],
  },
  ...extra,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/acme/members/reports']}>
      <Routes>
        <Route path="/:tenantSlug/members/reports" element={<MembershipReportsContent />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { tenantCurrency: 'EUR', tenantLocale: 'en-GB', permissions: { 'members.reports.view': true } } as never });
  settings.getBenefits.mockResolvedValue({
    tiers: [
      { tier: 'BRONZE', labelSq: 'Bronz', labelEn: 'Bronze', colour: '#B26A2B' },
      { tier: 'SILVER', labelSq: 'Argjend', labelEn: 'Silver', colour: '#8A939B' },
      { tier: 'GOLD', labelSq: 'Ar', labelEn: 'Gold', colour: '#C9A227' },
      { tier: 'VIP', labelSq: 'VIP', labelEn: 'VIP', colour: '#5B3FA6' },
    ],
    services: [],
  } as never);
  lookups.list.mockResolvedValue([] as never);
  reports.get.mockResolvedValue(report());
  reports.downloadCsv.mockResolvedValue(new Blob(['x']));
});
afterEach(() => useAuthStore.setState({ user: null }));

describe('Wellness+ reports page (M4 Slice 14)', () => {
  it('FR-RPT-01 asks for this month by default and shows the figures as the server sent them, with their basis', async () => {
    renderPage();
    const rate = await screen.findByText('Renewal rate');
    expect(reports.get).toHaveBeenCalledWith('acme', expect.objectContaining({ preset: 'THIS_MONTH' }));
    const tile = rate.closest('li')!;
    expect(within(tile).getByText('66.67%')).toBeInTheDocument();
    expect(within(tile).getByText('This month')).toBeInTheDocument();
    expect(within(screen.getByText('Active members').closest('li')!).getByText('As of now')).toBeInTheDocument();
    expect(within(screen.getByText('Membership revenue', { selector: 'span' }).closest('li')!).getByText('€1,140.00')).toBeInTheDocument();
  });

  it('FR-RPT-01 sends the filters to the server and clears them', async () => {
    renderPage();
    await screen.findByText('Renewal rate');
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'GOLD' } });
    fireEvent.change(screen.getByLabelText('Segment'), { target: { value: 'CORPORATE' } });
    fireEvent.change(screen.getByLabelText('Employer company'), { target: { value: 'c1' } });
    await waitFor(() => expect(reports.get).toHaveBeenLastCalledWith('acme', expect.objectContaining({ tier: 'GOLD', segment: 'CORPORATE', employerClientId: 'c1' })));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(reports.get).toHaveBeenLastCalledWith('acme', expect.objectContaining({ tier: '', segment: '', employerClientId: '' })));
  });

  it('FR-RPT-04 shows the worked example and a dash when no renewal is due', async () => {
    renderPage();
    const renewals = (await screen.findByRole('region', { name: 'Renewals' }));
    fireEvent.click(within(renewals).getByRole('button', { name: 'Table' }));
    const total = within(renewals).getByText('Total').closest('tr')!;
    expect(within(total).getAllByRole('cell').map((c) => c.textContent)).toEqual(['15', '10', '5', '66.67%']);

    reports.get.mockResolvedValue(report({ renewals: { due: 0, renewed: 0, notRenewed: 0, rate: null, perTier: [] } }));
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'SILVER' } });
    await waitFor(() => expect(within(document.querySelector('li[data-figure="rate"]') as HTMLElement).getByText('—')).toBeInTheDocument());
  });

  it('FR-RPT-05, FR-RPT-06 shows upgrades with count and amount, and downgrades per path and reason', async () => {
    renderPage();
    const upgrades = await screen.findByRole('region', { name: 'Upgrades' });
    fireEvent.click(within(upgrades).getByRole('button', { name: 'Table' }));
    expect(within(upgrades).getByText('Silver → Gold').closest('tr')).toHaveTextContent('2€80.00');
    const downgrades = screen.getByRole('region', { name: 'Downgrades' });
    fireEvent.click(within(downgrades).getByRole('button', { name: 'Table' }));
    expect(within(downgrades).getByText('Not renewed').closest('tr')).toHaveTextContent('5');
    expect(within(downgrades).getByText('Total').closest('tr')).toHaveTextContent('5');
  });

  it('FR-RPT-08 shows no revenue tile, table or amount column when the server sent none', async () => {
    reports.get.mockResolvedValue(report({ revenue: undefined, upgrades: { count: 2, perPath: [{ path: 'SILVER>GOLD', count: 2 }] } }));
    renderPage();
    await screen.findByText('Renewal rate');
    expect(screen.queryByText('Membership revenue', { selector: 'span' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Membership revenue' })).not.toBeInTheDocument();
    const upgrades = screen.getByRole('region', { name: 'Upgrades' });
    fireEvent.click(within(upgrades).getByRole('button', { name: 'Table' }));
    expect(within(upgrades).queryByRole('columnheader', { name: 'Amount' })).not.toBeInTheDocument();
  });

  it('FR-RPT-09 lists the expiring memberships and the former employees with a link to the member', async () => {
    renderPage();
    const expiring = await screen.findByRole('region', { name: 'Expiring memberships' });
    expect(within(expiring).getByRole('link', { name: /Ana Hoxha/ })).toHaveAttribute('href', '/acme/members/m1');
    expect(within(expiring).getByText('WP-000001')).toBeInTheDocument();
    const former = screen.getByRole('region', { name: 'Former employees to contact' });
    expect(within(former).getByRole('link', { name: /Besa Krasniqi/ })).toHaveAttribute('href', '/acme/members/m2');
    expect(within(former).getByText('Alpha Co')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'VIP reviews due' })).getByText('Nobody on this list.')).toBeInTheDocument();
  });

  it('FR-RPT-10 exports one report as a CSV with the same filters', async () => {
    renderPage();
    const renewals = await screen.findByRole('region', { name: 'Renewals' });
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'GOLD' } });
    await waitFor(() => expect(reports.get).toHaveBeenLastCalledWith('acme', expect.objectContaining({ tier: 'GOLD' })));
    fireEvent.click(within(renewals).getByRole('button', { name: 'Export Renewals as CSV' }));
    await waitFor(() => expect(reports.downloadCsv).toHaveBeenCalledWith('acme', 'renewals', expect.objectContaining({ preset: 'THIS_MONTH', tier: 'GOLD' })));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'wellness-plus-renewals.csv');
  });

  it('FR-RPT-01 shows a message and no figure when the reports cannot be loaded', async () => {
    reports.get.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('The reports could not be loaded.');
    expect(screen.queryByText('Renewal rate')).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
