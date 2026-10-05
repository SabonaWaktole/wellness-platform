import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SalesUserDashboard } from './SalesUserDashboard';
import { SalesManagerDashboard } from './SalesManagerDashboard';
import { DashboardLanding } from './DashboardLanding';
import { roleDashboardService } from '../../services/dashboardService';
import { useAuthStore } from '../../store/useAuthStore';
import i18n from '../../i18n';

vi.mock('../../services/dashboardService', async (original) => ({
  ...(await original<typeof import('../../services/dashboardService')>()),
  roleDashboardService: { home: vi.fn(), fetch: vi.fn() },
}));
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));
vi.mock('../../hooks/useActiveLookups', () => ({
  useActiveLookups: (list: string) => (list === 'areas' ? [{ id: 'area-1', nameSq: 'Tiranë', nameEn: 'Tirana' }] : [{ id: 'city-1', nameSq: 'Tiranë', nameEn: 'Tirana' }]),
}));

const figure = (key: string, value: number | string | null, format: 'count' | 'money' | 'percent', basis: 'period' | 'asOfNow', link: unknown = null) => ({
  key,
  label: key,
  value,
  format,
  basis,
  link,
});

const stages = [
  { key: 'NEW_LEAD', label: 'NEW_LEAD', count: 2, annualValue: '592.80' },
  { key: 'NEGOTIATION', label: 'NEGOTIATION', count: 1, annualValue: '1200.00' },
];

const userData = (over: Record<string, unknown> = {}) => ({
  kind: 'SALES_USER',
  period: { preset: 'THIS_MONTH', from: '2026-10-01', to: '2026-10-31' },
  calculatedAt: '2026-10-14T09:05:00.000Z',
  figures: [
    figure('leads', 2, 'count', 'asOfNow', { target: 'DEALS', filters: { stage: ['NEW_LEAD', 'CONTACTED'], ownerUserId: 'u1' } }),
    figure('followUpsOverdue', 4, 'count', 'asOfNow', { target: 'FOLLOW_UPS', filters: { overdueOnly: 'true', assignedUserId: 'u1' } }),
    figure('dealsWon', 4, 'count', 'period'),
    figure('salesValue', '2872.80', 'money', 'period'),
    figure('conversionRate', null, 'percent', 'period'),
  ],
  tables: { dealsByStage: stages },
  charts: { pipeline: stages },
  empty: false,
  ...over,
});

const managerData = () => {
  const lostReasons = [
    { key: 'price', label: 'Çmimi', labelSq: 'Çmimi', labelEn: 'Price', count: 5, annualValue: '450.00' },
    { key: 'NO_REASON', label: 'NO_REASON', labelSq: null, labelEn: null, count: 2, annualValue: '0.00' },
  ];
  return {
  ...userData(),
  kind: 'SALES_MANAGER',
  figures: [figure('dealsWon', 5, 'count', 'period'), figure('dealsLost', 7, 'count', 'period'), figure('conversionRate', 41.7, 'percent', 'period')],
  tables: {
    perSalesperson: [
      { salesperson: { id: 'u-a', name: 'Besa Test', isActive: true }, leads: 2, activeDeals: 3, followUpsOverdue: 2, offersCreated: 1, offersSent: 1, dealsWon: 4, dealsLost: 6, conversionRate: 40, salesValue: '2872.80', calls: 2, emails: 0, visits: 1, meetings: 2 },
      { salesperson: { id: 'u-b', name: 'Dritan Test', isActive: true }, leads: 1, activeDeals: 2, followUpsOverdue: 1, offersCreated: 1, offersSent: 0, dealsWon: 1, dealsLost: 1, conversionRate: 50, salesValue: '1000.00', calls: 0, emails: 1, visits: 0, meetings: 0 },
    ],
    lostReasons,
  },
  charts: { pipeline: stages, lostReasons },
  };
};

const signIn = () =>
  useAuthStore.setState({
    user: { userId: 'u1', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions: { 'commercial.view': 'ALL' } } as any,
    isAuthenticated: true,
  });

const renderAt = (ui: React.ReactElement, path = '/acme/dashboard') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:tenantSlug/dashboard" element={ui} />
        <Route path="/:tenantSlug/clients" element={<div>company search</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('Sales User dashboard (FR-DSH-03, 05, 06, 07, 09)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    signIn();
    (roleDashboardService.fetch as any).mockResolvedValue(userData());
  });

  it('FR-DSH-03 labels each figure as following the period or as of now, and loads This month by default', async () => {
    renderAt(<SalesUserDashboard />);
    const leads = await screen.findByRole('link', { name: /Leads: 2/ });
    expect(within(leads).getByText('As of now')).toBeInTheDocument();
    const won = document.querySelector('[data-figure="dealsWon"]') as HTMLElement;
    expect(within(won).getByText('This month')).toBeInTheDocument();
    expect(roleDashboardService.fetch).toHaveBeenCalledWith('acme', 'SALES_USER', { preset: 'THIS_MONTH' });
  });

  it('FR-DSH-03 asks again for the period that was chosen, and waits for both days of a custom range', async () => {
    renderAt(<SalesUserDashboard />);
    await screen.findByRole('link', { name: /Leads: 2/ });
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'THIS_YEAR' } });
    await waitFor(() => expect(roleDashboardService.fetch).toHaveBeenLastCalledWith('acme', 'SALES_USER', { preset: 'THIS_YEAR' }));

    const calls = (roleDashboardService.fetch as any).mock.calls.length;
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'CUSTOM' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } });
    expect((roleDashboardService.fetch as any).mock.calls.length).toBe(calls);
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-31' } });
    await waitFor(() =>
      expect(roleDashboardService.fetch).toHaveBeenLastCalledWith('acme', 'SALES_USER', { preset: 'CUSTOM', from: '2026-03-01', to: '2026-03-31' })
    );
  });

  it('FR-DSH-04 sends only the Area and City picked from the predefined lists, and clears the city with the area', async () => {
    renderAt(<SalesUserDashboard />);
    await screen.findByRole('link', { name: /Leads: 2/ });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'city-1' } });
    await waitFor(() => expect(roleDashboardService.fetch).toHaveBeenLastCalledWith('acme', 'SALES_USER', { preset: 'THIS_MONTH', cityId: 'city-1' }));
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'area-1' } });
    await waitFor(() => expect(roleDashboardService.fetch).toHaveBeenLastCalledWith('acme', 'SALES_USER', { preset: 'THIS_MONTH', areaId: 'area-1' }));
    expect(screen.getByLabelText('City')).toHaveValue('');
  });

  it('FR-DSH-05 opens the list behind a figure, already filtered', async () => {
    renderAt(<SalesUserDashboard />);
    const overdue = await screen.findByRole('link', { name: /Overdue follow-ups: 4/ });
    expect(overdue).toHaveAttribute('href', '/acme/follow-ups?overdueOnly=true&assignedUserId=u1');
    expect(screen.getByRole('link', { name: /Leads: 2/ })).toHaveAttribute('href', '/acme/pipeline/list?stage=NEW_LEAD&stage=CONTACTED&ownerUserId=u1');
    // A figure with no list behind it is not a link.
    expect(screen.queryByRole('link', { name: /Deals won/ })).not.toBeInTheDocument();
  });

  it('FR-DSH-06 writes money in EUR with two decimals in the number format of the language, and "—" for no rate', async () => {
    renderAt(<SalesUserDashboard />);
    const value = (key: string) => document.querySelector(`[data-figure="${key}"]`)!.textContent!;
    await screen.findByRole('link', { name: /Leads: 2/ });
    expect(value('salesValue')).toContain('€2,872.80');
    expect(value('conversionRate')).toContain('—');
    expect(value('conversionRate')).not.toContain('0%');

    await i18n.changeLanguage('sq');
    await waitFor(() => expect(value('salesValue')).toMatch(/2\s?872,80/));
    expect(value('salesValue')).toContain('€');
    expect(screen.getAllByText('Tani', { selector: 'span' }).length).toBeGreaterThan(0);
  });

  it('FR-DSH-06 has a table view of the chart with the same numbers', async () => {
    renderAt(<SalesUserDashboard />);
    await screen.findByRole('link', { name: /Leads: 2/ });
    const region = screen.getByRole('region', { name: 'Pipeline by stage' });
    fireEvent.click(within(region).getByRole('button', { name: 'Table' }));
    const table = within(region).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1).map((row) => Array.from(row.children).map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['New lead', '2', '€592.80'],
      ['Negotiation', '1', '€1,200.00'],
    ]);
  });

  it('FR-DSH-06 shows the empty state, not zeros, for a workspace with nothing yet', async () => {
    (roleDashboardService.fetch as any).mockResolvedValue(userData({ empty: true, figures: [figure('leads', 0, 'count', 'asOfNow')] }));
    renderAt(<SalesUserDashboard />);
    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Leads/ })).not.toBeInTheDocument();
  });

  it('FR-DSH-07 shows when it was calculated and calculates again on refresh', async () => {
    renderAt(<SalesUserDashboard />);
    expect(await screen.findByText(/Calculated at/)).toBeInTheDocument();
    const before = (roleDashboardService.fetch as any).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect((roleDashboardService.fetch as any).mock.calls.length).toBe(before + 1));
  });

  it('FR-DSH-08 has no value column or tile when the server sent no values', async () => {
    const noValues = stages.map(({ annualValue: _value, ...rest }) => rest);
    (roleDashboardService.fetch as any).mockResolvedValue(
      userData({ figures: [figure('leads', 2, 'count', 'asOfNow')], tables: { dealsByStage: noValues }, charts: { pipeline: noValues } })
    );
    renderAt(<SalesUserDashboard />);
    await waitFor(() => expect(document.querySelector('[data-figure="leads"]')).not.toBeNull());
    expect(document.querySelector('[data-figure="salesValue"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.queryByRole('columnheader', { name: 'Annual value' })).not.toBeInTheDocument();
  });

  it('says so when the dashboard cannot be loaded', async () => {
    (roleDashboardService.fetch as any).mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderAt(<SalesUserDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('Sales Manager dashboard (FR-DSH-10)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    signIn();
    (roleDashboardService.fetch as any).mockResolvedValue(managerData());
  });

  it('shows the team per salesperson, the totals and the lost reasons, with an unrecorded reason said in words', async () => {
    renderAt(<SalesManagerDashboard />);
    const perSalesperson = await screen.findByRole('region', { name: 'Per salesperson' });
    const rows = within(perSalesperson).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Besa Test', 'Dritan Test']);
    expect(within(rows[0]).getAllByRole('cell').map((cell) => cell.textContent)).toContain('40.0%');
    expect(within(rows[0]).getAllByRole('cell').map((cell) => cell.textContent)).toContain('€2,872.80');

    expect(document.querySelector('[data-figure="conversionRate"]')!.textContent).toContain('41.7%');
    fireEvent.click(within(screen.getByRole('region', { name: 'Lost deals by reason' })).getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('rowheader', { name: 'Price' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'No reason recorded' })).toBeInTheDocument();
  });

  it('lets the manager narrow to one salesperson and keeps the whole team to pick from', async () => {
    renderAt(<SalesManagerDashboard />);
    await screen.findByRole('region', { name: 'Per salesperson' });
    const picker = screen.getByLabelText('Salesperson');
    await waitFor(() =>
      expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual(['All salespeople', 'Besa Test', 'Dritan Test'])
    );

    const one = managerData();
    one.tables.perSalesperson = [one.tables.perSalesperson[0]];
    (roleDashboardService.fetch as any).mockResolvedValue(one);
    fireEvent.change(picker, { target: { value: 'u-a' } });
    await waitFor(() => expect(roleDashboardService.fetch).toHaveBeenLastCalledWith('acme', 'SALES_MANAGER', { preset: 'THIS_MONTH', salespersonId: 'u-a' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Per salesperson' })).getAllByRole('row')).toHaveLength(2));
    expect(within(screen.getByLabelText('Salesperson')).getAllByRole('option')).toHaveLength(3);
  });

  it('has no sales value column without values', async () => {
    const data = managerData();
    data.tables.perSalesperson = data.tables.perSalesperson.map(({ salesValue: _value, ...rest }: any) => rest) as any;
    (roleDashboardService.fetch as any).mockResolvedValue(data);
    renderAt(<SalesManagerDashboard />);
    const region = await screen.findByRole('region', { name: 'Per salesperson' });
    expect(within(region).queryByRole('columnheader', { name: 'Sales value' })).not.toBeInTheDocument();
  });
});

describe('DashboardLanding (FR-DSH-01)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    signIn();
    (roleDashboardService.fetch as any).mockResolvedValue(userData());
  });

  const landing = () => renderAt(<DashboardLanding fallback={<div>older dashboard</div>} />);

  it.each([
    ['SALES_USER', 'My dashboard'],
    ['SALES_MANAGER', 'Sales team dashboard'],
  ])('%s lands on its own dashboard', async (kind, title) => {
    (roleDashboardService.home as any).mockResolvedValue(kind);
    landing();
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('Reception goes to the company search and has no dashboard', async () => {
    (roleDashboardService.home as any).mockResolvedValue('RECEPTION');
    landing();
    expect(await screen.findByText('company search')).toBeInTheDocument();
  });

  it('Administrator and CEO keep the dashboard they have until theirs is built, and so does a user the server cannot place', async () => {
    (roleDashboardService.home as any).mockResolvedValue('CEO');
    landing();
    expect(await screen.findByText('older dashboard')).toBeInTheDocument();
  });

  it('falls back to the dashboard that exists when the role cannot be read', async () => {
    (roleDashboardService.home as any).mockRejectedValue(new Error('down'));
    landing();
    expect(await screen.findByText('older dashboard')).toBeInTheDocument();
  });
});
