import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PerformanceContent } from './PerformanceContent';
import { performanceService } from '../../services/performanceService';
import { downloadBlob } from '../../utils/downloadBlob';
import { useAuthStore } from '../../store/useAuthStore';
import '../../i18n';

vi.mock('../../services/performanceService', () => ({
  performanceService: { fetch: vi.fn(), fetchRecords: vi.fn(), fetchSeries: vi.fn(), download: vi.fn() },
}));
vi.mock('../../utils/downloadBlob', () => ({ downloadBlob: vi.fn() }));

const figures = (over: Record<string, unknown> = {}) => ({
  calls: 4, emails: 1, visits: 2, meetings: 2, companiesContacted: 3, offersCreated: 3, offersSent: 2, dealsWon: 4, dealsLost: 6,
  totalValue: '2872.80', conversionRate: 40, followUpsCompleted: 3, followUpsOnTime: 2, onTimeShare: 66.7, followUpsOverdue: 2, averageTimeToClose: 10,
  ...over,
});

const besa = { id: 'u-a', name: 'Besa Test', isActive: true };
const dritan = { id: 'u-b', name: 'Dritan Test', isActive: true };

const result = (over: Record<string, unknown> = {}) => ({
  period: { from: '2026-09-01', to: '2026-09-30' },
  rows: [
    { salesperson: besa, figures: figures() },
    { salesperson: dritan, figures: figures({ calls: 1, dealsWon: 1, dealsLost: 1, conversionRate: 50, totalValue: '1000.00', onTimeShare: null, followUpsCompleted: 0, followUpsOverdue: 0 }) },
  ],
  salespeople: [besa, dritan],
  total: { figures: figures({ calls: 5, dealsWon: 5, dealsLost: 7, conversionRate: 41.7, totalValue: '3872.80', averageTimeToClose: 16 }) },
  ownOnly: false,
  ...over,
});

const signIn = (permissions: Record<string, unknown>) =>
  useAuthStore.setState({
    user: { userId: 'u1', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions } as any,
    isAuthenticated: true,
  });

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/acme/performance']}>
      <Routes>
        <Route path="/:tenantSlug/performance" element={<PerformanceContent />} />
        <Route path="/:tenantSlug/deals/:id" element={<div>deal page</div>} />
        <Route path="/:tenantSlug/clients/:id" element={<div>company page</div>} />
      </Routes>
    </MemoryRouter>
  );

/** The table with its rows loaded: the salesperson's name is also a filter chip, so the table is what to wait for. */
const ready = async () => {
  const table = await screen.findByRole('table');
  await within(table).findByText('Besa Test');
  return table;
};

describe('PerformanceContent (FR-PRF-01 to 10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ 'performance.view': 'TEAM', 'commercial.view': 'ALL' });
    (performanceService.fetch as any).mockResolvedValue(result());
    (performanceService.download as any).mockResolvedValue(new Blob(['x']));
  });

  it('FR-PRF-03 shows the fourteen indicators for each salesperson and for the total row, as the server worked them out', async () => {
    renderPage();
    const table = await ready();
    const headings = within(table).getAllByRole('columnheader').map((header) => header.textContent);
    expect(headings).toEqual([
      'Salesperson', 'Calls', 'Emails', 'Visits', 'Meetings', 'Companies contacted', 'Offers created', 'Offers sent', 'Deals won', 'Deals lost',
      'Total value', 'Conversion rate', 'Follow-ups completed', 'Overdue follow-ups', 'Average time to close',
    ]);
    const rows = within(table).getAllByRole('row');
    // Header, two salespeople and the total.
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByText('Besa Test')).toBeInTheDocument();
    expect(within(rows[1]).getByText('$2,872.80')).toBeInTheDocument();
    expect(within(rows[1]).getByText('40%')).toBeInTheDocument();
    expect(within(rows[1]).getByText('10 days')).toBeInTheDocument();
    expect(within(rows[1]).getByText('66.7% on time')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Total')).toBeInTheDocument();
    expect(within(rows[3]).getByText('41.7%')).toBeInTheDocument();
    expect(within(rows[3]).getByText('16 days')).toBeInTheDocument();
  });

  it('FR-PRF-04 shows "—", not 0%, for a rate with nothing to divide', async () => {
    (performanceService.fetch as any).mockResolvedValue(
      result({ rows: [{ salesperson: besa, figures: figures({ conversionRate: null, averageTimeToClose: null, dealsWon: 0, dealsLost: 0 }) }], total: null })
    );
    renderPage();
    const row = within(await ready()).getAllByRole('row')[1];
    expect(within(row).getAllByText('—')).toHaveLength(2);
  });

  it('FR-PRF-01 a Sales User sees their own row and no total, and no salesperson filter', async () => {
    signIn({ 'performance.view': 'OWN', 'commercial.view': 'ALL' });
    (performanceService.fetch as any).mockResolvedValue(
      result({ rows: [{ salesperson: besa, figures: figures() }], salespeople: [besa], total: null, ownOnly: true })
    );
    renderPage();
    await ready();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Salespeople' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dritan Test')).not.toBeInTheDocument();
  });

  it('FR-PRF-02 sends the preset, a custom range and the chosen salespeople to the server, and waits for both days', async () => {
    renderPage();
    await ready();
    expect(performanceService.fetch).toHaveBeenLastCalledWith('acme', { preset: 'THIS_MONTH', compare: false });

    fireEvent.click(within(screen.getByRole('group', { name: 'Salespeople' })).getByRole('button', { name: 'Dritan Test' }));
    await waitFor(() => expect(performanceService.fetch).toHaveBeenLastCalledWith('acme', { preset: 'THIS_MONTH', salespersonIds: ['u-b'], compare: false }));

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'LAST_MONTH' } });
    await waitFor(() => expect(performanceService.fetch).toHaveBeenLastCalledWith('acme', { preset: 'LAST_MONTH', salespersonIds: ['u-b'], compare: false }));

    const calls = (performanceService.fetch as any).mock.calls.length;
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'CUSTOM' } });
    expect(await screen.findByText('Choose the first and last day')).toBeInTheDocument();
    expect((performanceService.fetch as any).mock.calls.length).toBe(calls);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-02' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-09' } });
    await waitFor(() =>
      expect(performanceService.fetch).toHaveBeenLastCalledWith('acme', { preset: 'CUSTOM', from: '2026-03-02', to: '2026-03-09', salespersonIds: ['u-b'], compare: false })
    );

    fireEvent.click(screen.getByRole('button', { name: 'All salespeople' }));
    await waitFor(() => expect(performanceService.fetch).toHaveBeenLastCalledWith('acme', { preset: 'CUSTOM', from: '2026-03-02', to: '2026-03-09', compare: false }));
  });

  it('FR-PRF-06 compares with the previous period and shows each change with its direction in words', async () => {
    (performanceService.fetch as any).mockResolvedValue(
      result({
        period: { from: '2026-09-01', to: '2026-09-30', previous: { from: '2026-08-01', to: '2026-08-31' } },
        rows: [
          {
            salesperson: besa,
            figures: figures(),
            change: { calls: { delta: 3, direction: 'UP' }, dealsLost: { delta: -2, direction: 'DOWN' }, totalValue: { delta: '2872.80', direction: 'UP' }, conversionRate: { delta: 1.7, direction: 'UP' }, emails: { delta: 0, direction: 'SAME' } },
          },
        ],
        total: null,
      })
    );
    renderPage();
    fireEvent.click(await screen.findByLabelText('Compare with the previous period'));
    await waitFor(() => expect(performanceService.fetch).toHaveBeenLastCalledWith('acme', expect.objectContaining({ compare: true })));
    const row = within(await ready()).getAllByRole('row')[1];
    expect(within(row).getByText('+3')).toBeInTheDocument();
    expect(within(row).getByText('-2')).toBeInTheDocument();
    expect(within(row).getByText('+$2,872.80')).toBeInTheDocument();
    expect(within(row).getByText('+1.7 pp')).toBeInTheDocument();
    expect(within(row).getAllByText('Up').length).toBeGreaterThan(0);
    expect(screen.getByText(/compared with/)).toBeInTheDocument();
  });

  it('FR-PRF-07 clicking "Visits: 2" lists the records behind it with the same filters, and a deal opens the deal', async () => {
    (performanceService.fetchRecords as any).mockResolvedValue({
      period: { from: '2026-09-01', to: '2026-09-30' },
      indicator: 'DEALS_WON',
      rows: [{ kind: 'DEAL', id: 'd1', at: '2026-09-10T00:00:00.000Z', clientId: 'k1', companyName: 'Alfa Wellness', salesperson: { id: 'u-a', name: 'Besa Test' }, label: 'Annual', detail: 'WON', dealId: 'd1', annualValue: '592.80' }],
      count: 1, page: 1, limit: 20,
    });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Deals won, Besa Test: 4. Show the records.' }));

    expect(await screen.findByText('Alfa Wellness')).toBeInTheDocument();
    expect(performanceService.fetchRecords).toHaveBeenCalledWith('acme', { preset: 'THIS_MONTH', salespersonIds: ['u-a'], compare: false }, 'DEALS_WON', 1, 20);
    expect(screen.getByText('$592.80')).toBeInTheDocument();
    expect(screen.getByText('Won')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Alfa Wellness'));
    expect(await screen.findByText('deal page')).toBeInTheDocument();
  });

  it('FR-PRF-07 the total row lists the records of everyone selected', async () => {
    (performanceService.fetchRecords as any).mockResolvedValue({ period: { from: '2026-09-01', to: '2026-09-30' }, indicator: 'CALLS', rows: [], count: 0, page: 1, limit: 20 });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Calls, Total: 5. Show the records.' }));
    await waitFor(() => expect(performanceService.fetchRecords).toHaveBeenCalledWith('acme', { preset: 'THIS_MONTH', compare: false }, 'CALLS', 1, 20));
    expect(await screen.findByText('No records.')).toBeInTheDocument();
  });

  it('FR-PRF-08 the detail view shows the chart and the table with the same numbers the server sent', async () => {
    (performanceService.fetchSeries as any).mockResolvedValue({
      salesperson: besa, grain: 'MONTH', period: { from: '2026-08-01', to: '2026-09-30' },
      points: [
        { from: '2026-08-01', to: '2026-08-31', figures: { calls: 7, emails: 0, visits: 0, meetings: 0, companiesContacted: 2, offersCreated: 0, offersSent: 0, dealsWon: 1, dealsLost: 0, totalValue: '100.00', conversionRate: 100, followUpsCompleted: 0, followUpsOnTime: 0, onTimeShare: null, averageTimeToClose: 5 } },
        { from: '2026-09-01', to: '2026-09-30', figures: { calls: 4, emails: 1, visits: 2, meetings: 2, companiesContacted: 3, offersCreated: 3, offersSent: 2, dealsWon: 4, dealsLost: 6, totalValue: '2872.80', conversionRate: 40, followUpsCompleted: 3, followUpsOnTime: 2, onTimeShare: 66.7, averageTimeToClose: 10 } },
      ],
    });
    renderPage();
    fireEvent.click(within(await ready()).getByRole('button', { name: 'Besa Test' }));
    expect(await screen.findByRole('img', { name: 'Calls over time' })).toBeInTheDocument();
    expect(performanceService.fetchSeries).toHaveBeenCalledWith('acme', 'u-a', { preset: 'THIS_MONTH', from: undefined, to: undefined }, 'MONTH');

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    const detail = screen.getByRole('region', { name: 'Besa Test: indicators over time' });
    const rows = within(detail).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('7')).toBeInTheDocument();
    expect(within(rows[2]).getByText('$2,872.80')).toBeInTheDocument();
    expect(within(detail).queryByText('Overdue follow-ups')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'WEEK' } });
    await waitFor(() => expect(performanceService.fetchSeries).toHaveBeenLastCalledWith('acme', 'u-a', expect.any(Object), 'WEEK'));
  });

  it('FR-PRF-09 exports the filtered table as CSV and as PDF', async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(performanceService.download).toHaveBeenCalledWith('acme', { preset: 'THIS_MONTH', compare: false }, 'csv', 'en'));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^performance-\d{4}-\d{2}-\d{2}\.csv$/));
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(performanceService.download).toHaveBeenLastCalledWith('acme', { preset: 'THIS_MONTH', compare: false }, 'pdf', 'en'));
  });

  it('FR-PRF-10 without commercial.view there is no value column, and the detail view has none either', async () => {
    signIn({ 'performance.view': 'TEAM' });
    const noMoney = figures();
    delete (noMoney as any).totalValue;
    (performanceService.fetch as any).mockResolvedValue(result({ rows: [{ salesperson: besa, figures: noMoney }], total: null }));
    renderPage();
    const headings = within(await ready()).getAllByRole('columnheader').map((header) => header.textContent);
    expect(headings).not.toContain('Total value');
    expect(headings).toHaveLength(14);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('marks a deactivated salesperson who keeps their row', async () => {
    (performanceService.fetch as any).mockResolvedValue(
      result({ rows: [{ salesperson: { ...besa, isActive: false }, figures: figures() }], total: null })
    );
    renderPage();
    await ready();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });

  it('says so when the figures cannot be loaded, and when there is no one to show', async () => {
    (performanceService.fetch as any).mockRejectedValueOnce(new Error('boom'));
    const { unmount } = renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('The performance figures could not be loaded.');
    unmount();

    (performanceService.fetch as any).mockResolvedValue(result({ rows: [], total: null, salespeople: [] }));
    renderPage();
    expect(await screen.findByText('No salespeople to show')).toBeInTheDocument();
  });
});
