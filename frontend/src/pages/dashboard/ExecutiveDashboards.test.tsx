import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdministratorDashboard } from './AdministratorDashboard';
import { CeoDashboard } from './CeoDashboard';
import { roleDashboardService } from '../../services/dashboardService';
import { useAuthStore } from '../../store/useAuthStore';
import i18n from '../../i18n';

vi.mock('../../services/dashboardService', async (original) => ({
  ...(await original<typeof import('../../services/dashboardService')>()),
  roleDashboardService: { home: vi.fn(), fetch: vi.fn() },
}));
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));
vi.mock('../membership/useTierLabels', () => ({ useTierLabels: () => (tier: string) => ({ label: tier === 'SILVER' ? 'Silver' : tier === 'GOLD' ? 'Gold' : 'Bronze', colour: null }) }));
vi.mock('../../hooks/useActiveLookups', () => ({ useActiveLookups: () => [] }));

const figure = (key: string, value: number | string | null, format: 'count' | 'money' | 'percent', basis: 'period' | 'asOfNow', link: unknown = null) => ({
  key,
  label: key,
  value,
  format,
  basis,
  link,
});

const adminData = (over: Record<string, unknown> = {}) => ({
  kind: 'ADMINISTRATOR',
  period: { preset: 'THIS_MONTH', from: '2026-10-01', to: '2026-10-31' },
  calculatedAt: '2026-10-14T09:05:00.000Z',
  figures: [figure('activeUsers', 7, 'count', 'asOfNow'), figure('inactiveUsers', 1, 'count', 'asOfNow'), figure('attentionItems', 2, 'count', 'asOfNow')],
  tables: {
    pricing: [
      { key: 'DISCOUNT_CAP', discountCapPercent: '15.00', lastChangedAt: '2026-10-12T10:00:00.000Z' },
      { key: 'EMPLOYEE_BANDS', count: 4, lastChangedAt: null },
      { key: 'RISK_SURCHARGES', count: 3, lastChangedAt: null },
      { key: 'VISIT_FREQUENCIES', count: 5, lastChangedAt: null },
      { key: 'PRICE_ZONES', count: 2, lastChangedAt: null },
    ],
    usersPerRole: [
      { roleId: 'r1', key: 'SALES_USER', nameSq: 'Përdorues Shitjesh', nameEn: 'Sales User', activeUsers: 2, inactiveUsers: 1 },
      { roleId: 'r2', key: 'custom', nameSq: 'Rezervë', nameEn: 'Spare', activeUsers: 0, inactiveUsers: 0 },
    ],
    attention: [
      { key: 'CITY_NO_ZONE', count: 12, examples: [{ id: 'c1', name: 'Kamëz' }, { id: 'c2', name: 'Vorë' }] },
      { key: 'ROLE_NO_USERS', count: 1, examples: [{ id: 'r2', name: 'Spare' }] },
    ],
    recentChanges: [
      { id: 'a1', at: '2026-10-12T10:00:00.000Z', userName: 'Ana Test', action: 'UPDATE', entityType: 'PricingSettings', entityLabel: null },
      { id: 'a2', at: '2026-10-11T10:00:00.000Z', userName: null, action: 'CREATE', entityType: 'City', entityLabel: 'Kamëz' },
    ],
  },
  charts: {},
  empty: false,
  ...over,
});

const months = [
  { key: '2026-08', label: '2026-08', count: 0, annualValue: '0.00' },
  { key: '2026-09', label: '2026-09', count: 3, annualValue: '2192.80' },
];
const companies = [
  { key: 'CLIENT', label: 'CLIENT', count: 4 },
  { key: 'FORMER_CLIENT', label: 'FORMER_CLIENT', count: 1 },
];

const ceoData = (over: Record<string, unknown> = {}) => ({
  kind: 'CEO',
  period: { preset: 'THIS_MONTH', from: '2026-10-01', to: '2026-10-31' },
  calculatedAt: '2026-10-14T09:05:00.000Z',
  figures: [
    figure('activeDeals', 4, 'count', 'asOfNow', { target: 'DEALS', filters: { stage: ['NEW_LEAD', 'NEGOTIATION'] } }),
    figure('pipelineValue', '11499.00', 'money', 'asOfNow'),
    figure('salesValue', '2192.80', 'money', 'period'),
    figure('revenue', '300.00', 'money', 'period'),
    figure('monthlyRecurringValue', '350.00', 'money', 'asOfNow'),
    figure('contractsExpiringSoon', 1, 'count', 'asOfNow', { target: 'RENEWALS', filters: { window: '30' } }),
    figure('paymentsOverdue', 1, 'count', 'asOfNow', { target: 'PAYMENTS', filters: { status: 'OVERDUE' } }),
    figure('followUpsOverdue', 2, 'count', 'asOfNow', { target: 'FOLLOW_UPS', filters: { overdueOnly: 'true' } }),
    figure('offersWaiting', 1, 'count', 'asOfNow', { target: 'OFFERS', filters: { status: 'SENT' } }),
  ],
  tables: {
    team: [
      {
        salesperson: { id: 'u-a', name: 'Besa Test', isActive: true },
        figures: { dealsWon: 2, dealsLost: 1, conversionRate: 66.7, offersCreated: 1, offersSent: 1, calls: 2, emails: 0, visits: 1, meetings: 2, followUpsOverdue: 2, totalValue: '1192.80' },
      },
    ],
    contracts: [
      { key: 'active', count: 2, annualValue: '4200.00' },
      { key: 'expired', count: 1, annualValue: '960.00' },
      { key: 'expiringSoon', count: 1, annualValue: '1200.00' },
    ],
    payments: [
      { status: 'OVERDUE', count: 1, amount: '100.00', paidAmount: '0.00', outstanding: '100.00' },
      { status: 'PAID', count: 1, amount: '200.00', paidAmount: '200.00', outstanding: '0.00' },
    ],
    companiesPerStatus: companies,
  },
  charts: { pipeline: [{ key: 'NEW_LEAD', label: 'NEW_LEAD', count: 2, annualValue: '0.00' }], salesPerMonth: months, companiesPerStatus: companies },
  empty: false,
  ...over,
});

const signIn = (permissions: Record<string, string | boolean> = {}) =>
  useAuthStore.setState({
    user: { userId: 'u1', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', tenantTimezone: 'Europe/Tirane', tenantLocale: 'en-GB', permissions } as any,
    isAuthenticated: true,
  });

const renderAt = (ui: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={['/acme/dashboard']}>
      <Routes>
        <Route path="/:tenantSlug/dashboard" element={ui} />
      </Routes>
    </MemoryRouter>
  );

describe('Administrator dashboard (FR-DSH-11)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    signIn({ 'audit.view': true });
    (roleDashboardService.fetch as any).mockResolvedValue(adminData());
  });

  it('FR-DSH-11 asks for the Administrator dashboard and has no period, Area or City to narrow it by', async () => {
    renderAt(<AdministratorDashboard />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Administrator dashboard' })).toBeInTheDocument();
    expect(roleDashboardService.fetch).toHaveBeenCalledWith('acme', 'ADMINISTRATOR', { preset: 'THIS_MONTH' });
    expect(screen.queryByLabelText('Period')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Area')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('City')).not.toBeInTheDocument();
  });

  it('FR-DSH-11 shows the discount cap and each part with its last change, and says when a part never changed', async () => {
    renderAt(<AdministratorDashboard />);
    const region = await screen.findByRole('region', { name: 'Pricing configuration' });
    const cap = region.querySelector('[data-setting="DISCOUNT_CAP"]') as HTMLElement;
    expect(within(cap).getByText('15.00%')).toBeInTheDocument();
    // Dated in the workspace's format, not the UI language's.
    expect(cap.textContent).toMatch(/12/);
    expect(cap.textContent).not.toContain('Not changed');
    const bands = region.querySelector('[data-setting="EMPLOYEE_BANDS"]') as HTMLElement;
    expect(within(bands).getByText('4')).toBeInTheDocument();
    expect(within(bands).getByText('Not changed since the audit log began')).toBeInTheDocument();
  });

  it('FR-DSH-11 lists the users per role, the roles with nobody in them, and what needs attention', async () => {
    renderAt(<AdministratorDashboard />);
    const roles = await screen.findByRole('region', { name: 'Users per role' });
    const rows = within(roles).getAllByRole('row').slice(1).map((row) => Array.from(row.children).map((cell) => cell.textContent));
    expect(rows).toEqual([['Sales User', '2', '1'], ['Spare', '0', '0']]);

    const attention = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(attention).getByText('12 active cities are in no price zone')).toBeInTheDocument();
    expect(within(attention).getByText('Kamëz, Vorë +10')).toBeInTheDocument();
    expect(within(attention).getByText('1 roles have no users')).toBeInTheDocument();
  });

  it('FR-DSH-11 shows the recent changes with a link to the full audit log, for someone who may read it', async () => {
    renderAt(<AdministratorDashboard />);
    const recent = await screen.findByRole('region', { name: 'Recent changes' });
    expect(within(recent).getByText(/Updated · Pricing settings/)).toBeInTheDocument();
    expect(within(recent).getByText(/Created · City · Kamëz/)).toBeInTheDocument();
    expect(within(recent).getByText(/Ana Test/)).toBeInTheDocument();
    expect(within(recent).getByText(/System/)).toBeInTheDocument();
    expect(within(recent).getByRole('link', { name: 'Open the full audit log' })).toHaveAttribute('href', '/acme/settings/audit');
  });

  it('FR-DSH-11 has no recent changes for someone who may not read the audit log', async () => {
    signIn({});
    renderAt(<AdministratorDashboard />);
    await screen.findByRole('region', { name: 'Pricing configuration' });
    expect(screen.queryByRole('region', { name: 'Recent changes' })).not.toBeInTheDocument();
  });

  it('FR-DSH-11 shows no sales figure', async () => {
    renderAt(<AdministratorDashboard />);
    await screen.findByRole('region', { name: 'Pricing configuration' });
    for (const label of [/Sales value/, /Pipeline value/, /Revenue/, /Deals won/, /Overdue instalments/]) expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(document.querySelector('[data-figure="inactiveUsers"]')!.textContent).toContain('1');
  });

  it('FR-DSH-06 shows the Albanian text, and the empty state when there is nothing at all', async () => {
    (roleDashboardService.fetch as any).mockResolvedValue(adminData({ empty: true }));
    renderAt(<AdministratorDashboard />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    await i18n.changeLanguage('sq');
    expect(await screen.findByRole('heading', { level: 1, name: 'Paneli i administratorit' })).toBeInTheDocument();
  });
});

describe('CEO dashboard (FR-DSH-12, FR-DSH-13)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    signIn({ 'commercial.view': 'ALL', 'payments.view': 'ALL' });
    (roleDashboardService.fetch as any).mockResolvedValue(ceoData());
  });

  it('FR-DSH-12, FR-DSH-03 asks for the CEO dashboard with a period, and no Area or City', async () => {
    renderAt(<CeoDashboard />);
    expect(await screen.findByRole('heading', { level: 1, name: 'CEO dashboard' })).toBeInTheDocument();
    expect(roleDashboardService.fetch).toHaveBeenCalledWith('acme', 'CEO', { preset: 'THIS_MONTH' });
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'THIS_YEAR' } });
    await waitFor(() => expect(roleDashboardService.fetch).toHaveBeenLastCalledWith('acme', 'CEO', { preset: 'THIS_YEAR' }));
    expect(screen.queryByLabelText('Area')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Salesperson')).not.toBeInTheDocument();
  });

  it('FR-DSH-12 labels revenue and sales value as period figures, and money in EUR with two decimals', async () => {
    renderAt(<CeoDashboard />);
    await screen.findByRole('heading', { level: 1, name: 'CEO dashboard' });
    const value = (key: string) => document.querySelector(`[data-figure="${key}"]`)!.textContent!;
    expect(value('revenue')).toContain('€300.00');
    expect(value('revenue')).toContain('This month');
    expect(value('salesValue')).toContain('€2,192.80');
    expect(value('monthlyRecurringValue')).toContain('€350.00');
    expect(value('monthlyRecurringValue')).toContain('As of now');
    await i18n.changeLanguage('sq');
    await waitFor(() => expect(value('salesValue')).toMatch(/2\s?192,80/));
  });

  it('FR-DSH-12, FR-DSH-05 opens the lists behind the figures, already filtered', async () => {
    renderAt(<CeoDashboard />);
    expect(await screen.findByRole('link', { name: /Overdue follow-ups: 2/ })).toHaveAttribute('href', '/acme/follow-ups?overdueOnly=true');
    expect(screen.getByRole('link', { name: /Offers waiting for an answer: 1/ })).toHaveAttribute('href', '/acme/offers?status=SENT');
    expect(screen.getByRole('link', { name: /Overdue instalments: 1/ })).toHaveAttribute('href', '/acme/payments?status=OVERDUE');
    expect(screen.getByRole('link', { name: /Contracts expiring soon: 1/ })).toHaveAttribute('href', '/acme/renewals?window=30');
    expect(screen.getByRole('link', { name: /Active deals: 4/ })).toHaveAttribute('href', '/acme/pipeline/list?stage=NEW_LEAD&stage=NEGOTIATION');
  });

  it('FR-DSH-12, FR-DSH-06 shows sales per month as a chart and a table of the same numbers', async () => {
    renderAt(<CeoDashboard />);
    const region = await screen.findByRole('region', { name: 'Sales per month (deals won)' });
    expect(within(region).getByText('September 2026')).toBeInTheDocument();
    fireEvent.click(within(region).getByRole('button', { name: 'Table' }));
    const rows = within(within(region).getByRole('table')).getAllByRole('row').slice(1).map((row) => Array.from(row.children).map((cell) => cell.textContent));
    expect(rows).toEqual([['August 2026', '0', '€0.00'], ['September 2026', '3', '€2,192.80']]);
  });

  it('FR-DSH-12 shows the team table, the contracts and the payments by status', async () => {
    renderAt(<CeoDashboard />);
    const team = await screen.findByRole('region', { name: 'Team performance' });
    expect(within(team).getByText('Besa Test')).toBeInTheDocument();
    expect(within(team).getByText('66.7%')).toBeInTheDocument();
    expect(within(team).getByText('€1,192.80')).toBeInTheDocument();

    const contracts = screen.getByRole('region', { name: 'Contracts' });
    const contractRows = within(contracts).getAllByRole('row').slice(1).map((row) => Array.from(row.children).map((cell) => cell.textContent));
    expect(contractRows).toEqual([['Active', '2', '€4,200.00'], ['Expired', '1', '€960.00'], ['Expiring soon', '1', '€1,200.00']]);

    const payments = screen.getByRole('region', { name: 'Payments by status' });
    const paymentRows = within(payments).getAllByRole('row').slice(1).map((row) => Array.from(row.children).map((cell) => cell.textContent));
    expect(paymentRows).toEqual([['Overdue', '1', '€100.00', '€100.00'], ['Paid', '1', '€200.00', '€0.00']]);
  });

  it('FR-DSH-12 shows the companies per status by name', async () => {
    renderAt(<CeoDashboard />);
    const region = await screen.findByRole('region', { name: 'Companies by status' });
    expect(within(region).getByText('Client')).toBeInTheDocument();
    expect(within(region).getByText('Former client')).toBeInTheDocument();
  });

  it('FR-DSH-12 prepares a place for Wellness+ and does not draw it', async () => {
    renderAt(<CeoDashboard />);
    await screen.findByRole('heading', { level: 1, name: 'CEO dashboard' });
    expect(screen.queryByText(/Wellness\+/)).not.toBeInTheDocument();
  });

  it('FR-DSH-13 has no control that edits anything: only the refresh button and the chart and table views', async () => {
    renderAt(<CeoDashboard />);
    await screen.findByRole('heading', { level: 1, name: 'CEO dashboard' });
    const buttons = screen.getAllByRole('button').map((button) => button.textContent?.trim());
    expect(buttons.filter((name) => !['Refresh', 'Chart', 'Table'].includes(name ?? ''))).toEqual([]);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    // Every figure only opens a list.
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).toMatch(/^\/acme\//);
  });

  it('FR-DSH-08 draws no column the server left out, and no money without the figures', async () => {
    (roleDashboardService.fetch as any).mockResolvedValue(
      ceoData({
        figures: [figure('activeDeals', 4, 'count', 'asOfNow'), figure('paymentsOverdue', 1, 'count', 'asOfNow')],
        tables: {
          team: [{ salesperson: { id: 'u-a', name: 'Besa Test', isActive: true }, figures: { dealsWon: 2, dealsLost: 1, conversionRate: 66.7, offersCreated: 1, offersSent: 1, calls: 0, emails: 0, visits: 0, meetings: 0, followUpsOverdue: 0 } }],
          contracts: [{ key: 'active', count: 2 }],
          payments: [{ status: 'OVERDUE', count: 1 }],
          companiesPerStatus: companies,
        },
        charts: { salesPerMonth: [{ key: '2026-09', label: '2026-09', count: 3 }], companiesPerStatus: companies },
      })
    );
    renderAt(<CeoDashboard />);
    await screen.findByRole('region', { name: 'Team performance' });
    expect(screen.queryByRole('columnheader', { name: 'Sales value' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Amount' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Outstanding' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Annual value' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('€');
  });

  it('FR-DSH-06 shows the empty state instead of zeros', async () => {
    (roleDashboardService.fetch as any).mockResolvedValue(ceoData({ empty: true }));
    renderAt(<CeoDashboard />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Team performance' })).not.toBeInTheDocument();
  });

  const wellnessBlock = (revenue = true) => ({
    figures: [
      figure('membersActive', 12, 'count', 'asOfNow', { target: 'MEMBERSHIP_REPORTS', filters: { section: 'active' } }),
      figure('membershipUpgrades', 2, 'count', 'period', { target: 'MEMBERSHIP_REPORTS', filters: { section: 'upgrades', preset: 'THIS_MONTH' } }),
      figure('membershipRenewalRate', 66.67, 'percent', 'period'),
      ...(revenue ? [figure('membershipRevenue', '1140.00', 'money', 'period')] : []),
    ],
    charts: { activePerTier: [{ key: 'BRONZE', label: 'BRONZE', count: 4 }, { key: 'SILVER', label: 'SILVER', count: 6 }, { key: 'GOLD', label: 'GOLD', count: 2 }] },
    tables: { renewalsPerTier: [{ tier: 'SILVER', due: 10, renewed: 7, notRenewed: 3, rate: '70.00' }, { tier: 'GOLD', due: 5, renewed: 3, notRenewed: 2, rate: '60.00' }] },
  });

  it('FR-DSH-14 draws the Wellness+ block with its tiles, period labels and links to the filtered report', async () => {
    (roleDashboardService.fetch as any).mockResolvedValue(ceoData({ wellnessPlus: wellnessBlock() }));
    renderAt(<CeoDashboard />);
    const block = await screen.findByRole('region', { name: 'Wellness+ members' });
    const tile = (key: string) => block.querySelector(`[data-figure="${key}"]`) as HTMLElement;
    expect(tile('membersActive').textContent).toContain('As of now');
    expect(tile('membershipUpgrades').textContent).toContain('This month');
    expect(tile('membershipRevenue').textContent).toContain('1,140.00');
    expect(tile('membershipUpgrades').querySelector('a')!.getAttribute('href')).toBe('/acme/members/reports?section=upgrades&preset=THIS_MONTH');
    expect(screen.getByRole('region', { name: 'Active members per tier' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Renewals per tier' })).getByRole('row', { name: /Silver 10 7 3/ })).toBeInTheDocument();
  });

  it('FR-DSH-15 draws no revenue tile when the server left the revenue out', async () => {
    (roleDashboardService.fetch as any).mockResolvedValue(ceoData({ wellnessPlus: wellnessBlock(false) }));
    renderAt(<CeoDashboard />);
    const block = await screen.findByRole('region', { name: 'Wellness+ members' });
    expect(block.querySelector('[data-figure="membershipRevenue"]')).toBeNull();
    expect(block.textContent).not.toContain('1,140');
  });

  it('FR-DSH-16 draws nothing about Wellness+ when the key is absent', async () => {
    renderAt(<CeoDashboard />);
    await screen.findByRole('region', { name: 'Team performance' });
    expect(screen.queryByRole('region', { name: 'Wellness+ members' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Wellness+');
  });
});
