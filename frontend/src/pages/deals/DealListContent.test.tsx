import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DealListContent } from './DealListContent';
import { dealService } from '../../services/dealService';
import { useAuthStore } from '../../store/useAuthStore';
import type { DealSummary } from '../../types/deal';

vi.mock('../../services/dealService', () => ({ dealService: { list: vi.fn() } }));
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));
vi.mock('../../hooks/useActiveLookups', () => ({
  useActiveLookups: (list: string) =>
    list === 'business-types' ? [{ id: 'bt-1', nameSq: 'Kafene', nameEn: 'Café', order: 1, active: true }] : [],
}));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({
    staff: [
      { id: 'u-a', email: 'a@example.com', role: 'STAFF', firstName: 'Besa', lastName: 'Test' },
      { id: 'u-b', email: 'b@example.com', role: 'STAFF', firstName: 'Dritan', lastName: 'Test' },
    ],
    fetchStaff: vi.fn(),
  }),
}));

const deal = (id: string, overrides: Partial<DealSummary> = {}): DealSummary => ({
  id,
  clientId: 'c1',
  companyName: 'Kafe Blloku',
  type: 'NEW_CONTRACT',
  title: `Deal ${id}`,
  stage: 'NEGOTIATION',
  ownerUserId: 'u-a',
  ownerName: 'Besa Test',
  expectedCloseDate: '2027-01-10',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
  closedAt: null,
  netMonthlyPrice: null,
  annualValue: null,
  nextFollowUpAt: null,
  ...overrides,
});

const setPermissions = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: { userId: 'u-m', email: 'manager@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions },
    isAuthenticated: true,
  } as any);

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/acme/pipeline/list']}>
      <Routes>
        <Route path="/:tenantSlug/pipeline/list" element={<DealListContent />} />
      </Routes>
    </MemoryRouter>
  );

const lastParams = () => vi.mocked(dealService.list).mock.calls.at(-1)?.[1];

describe('Deal list (FR-DEAL-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPermissions({ 'deals.view': 'TEAM', 'deals.edit': 'TEAM', 'commercial.view': 'TEAM' });
    vi.mocked(dealService.list).mockResolvedValue({ items: [deal('1'), deal('2', { ownerUserId: 'u-b', ownerName: 'Dritan Test' })], total: 2, page: 1, pageSize: 25 });
  });

  it('FR-DEAL-11 lists deals with their stage, salesperson and expected close date', async () => {
    renderList();
    expect((await screen.findAllByText('Deal 1')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Negotiation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dritan Test').length).toBeGreaterThan(0);
  });

  it("FR-DEAL-11 filtering the Sales Manager's list by one salesperson asks for that salesperson's deals", async () => {
    renderList();
    await screen.findAllByText('Deal 1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Salesperson' }), { target: { value: 'u-b' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ ownerUserId: 'u-b', page: 1 }));
  });

  it('FR-DEAL-11 filters by stage, type and business type, and sorts by expected close date', async () => {
    renderList();
    await screen.findAllByText('Deal 1');
    fireEvent.click(within(screen.getByRole('group', { name: 'Stage' })).getByRole('button', { name: 'Interested' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ stage: ['INTERESTED'] }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Type' })).getByRole('button', { name: 'Renewal' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ stage: ['INTERESTED'], type: ['RENEWAL'] }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Business type' }), { target: { value: 'bt-1' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ businessTypeId: 'bt-1' }));

    fireEvent.click(within(screen.getByRole('columnheader', { name: /Expected close/ })).getByRole('button'));
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'expectedCloseDate' }));
  });

  it('FR-DEAL-11 filters and sorts by the deal\'s monthly value (Slice 8)', async () => {
    renderList();
    await screen.findAllByText('Deal 1');
    fireEvent.change(screen.getByLabelText('Monthly value from'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Monthly value to'), { target: { value: '49.40' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ valueMin: '40', valueMax: '49.40' }));

    // Not an amount yet: not sent, and the field says why.
    fireEvent.change(screen.getByLabelText('Monthly value to'), { target: { value: '49.4.0' } });
    expect(await screen.findByText('Enter an amount such as 49.40.')).toBeInTheDocument();
    await waitFor(() => expect(lastParams()?.valueMax).toBeUndefined());

    fireEvent.click(within(screen.getByRole('columnheader', { name: /Monthly value/ })).getByRole('button'));
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'value' }));
  });

  it('FR-RBAC-17 without commercial.view there is no value filter', async () => {
    setPermissions({ 'deals.view': 'OWN', 'deals.edit': 'OWN' });
    renderList();
    await screen.findAllByText('Deal 1');
    expect(screen.queryByLabelText('Monthly value from')).toBeNull();
  });

  it('FR-DEAL-04 a Sales User, who sees only their own deals, gets no salesperson filter', async () => {
    setPermissions({ 'deals.view': 'OWN', 'deals.edit': 'OWN' });
    renderList();
    await screen.findAllByText('Deal 1');
    expect(screen.queryByRole('combobox', { name: 'Salesperson' })).toBeNull();
  });

  it('FR-RBAC-17 the value column is shown only with commercial.view', async () => {
    renderList();
    await screen.findAllByText('Deal 1');
    expect(screen.getByRole('columnheader', { name: /Monthly value/ })).toBeInTheDocument();
  });
});
