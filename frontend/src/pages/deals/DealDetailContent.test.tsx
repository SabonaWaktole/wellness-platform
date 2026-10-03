import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DealDetailContent } from './DealDetailContent';
import { dealService } from '../../services/dealService';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../../components/ui/Toast';
import type { DealDetail } from '../../types/deal';

vi.mock('../../services/dealService', () => ({
  dealService: { get: vi.fn(), changeStage: vi.fn(), reassign: vi.fn(), remove: vi.fn(), activities: vi.fn(), offers: vi.fn(), list: vi.fn() },
}));
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({
    staff: [
      { id: 'u-a', email: 'a@example.com', role: 'STAFF', firstName: 'Besa', lastName: 'Test', isActive: true },
      { id: 'u-b', email: 'b@example.com', role: 'STAFF', firstName: 'Dritan', lastName: 'Test', isActive: true },
    ],
    fetchStaff: vi.fn(),
  }),
}));

const detail = (overrides: Partial<DealDetail> = {}): DealDetail => ({
  id: 'd1',
  clientId: 'c1',
  companyName: 'Kafe Blloku',
  type: 'NEW_CONTRACT',
  title: null,
  stage: 'CONTACTED',
  ownerUserId: 'u-a',
  ownerName: 'Besa Test',
  expectedCloseDate: '2026-12-15',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-02T08:00:00Z',
  closedAt: null,
  netMonthlyPrice: null,
  annualValue: null,
  nextFollowUpAt: null,
  notes: 'Wants a visit first',
  createdByUserId: 'u-a',
  contacts: [{ id: 'p1', name: 'Alba Hoxha', position: 'Drejtore', phone: '+355690000002', email: null, isPrimary: true }],
  history: [
    { id: 'h1', fromStage: null, toStage: 'NEW_LEAD', changedByUserId: 'u-a', changedByName: 'Besa Test', at: '2026-10-01T08:00:00Z' },
    { id: 'h2', fromStage: 'NEW_LEAD', toStage: 'CONTACTED', changedByUserId: null, changedByName: null, at: '2026-10-02T08:00:00Z' },
  ],
  ...overrides,
});

const setPermissions = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: { userId: 'u-m', email: 'manager@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions },
    isAuthenticated: true,
  } as any);

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/deals/d1']}>
        <Routes>
          <Route path="/:tenantSlug/deals/:dealId" element={<DealDetailContent />} />
          <Route path="/:tenantSlug/pipeline" element={<p>pipeline board</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('Deal page (FR-DEAL-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPermissions({ 'deals.view': 'TEAM', 'deals.edit': 'TEAM', 'commercial.view': 'TEAM', 'script.view': true });
    vi.mocked(dealService.get).mockResolvedValue(detail());
    vi.mocked(dealService.activities).mockResolvedValue([]);
    vi.mocked(dealService.offers).mockResolvedValue([]);
  });

  it('FR-DEAL-03 shows company, contact persons, stage, value, salesperson, stage history, notes and the sales script button on one page', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Kafe Blloku – New contract' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kafe Blloku' })).toHaveAttribute('href', '/acme/clients/c1');
    expect(screen.getByText('Alba Hoxha')).toBeInTheDocument();
    expect(screen.getAllByText('Contacted').length).toBeGreaterThan(0);
    expect(screen.getByText('No offer yet')).toBeInTheDocument();
    expect(screen.getByText('Besa Test', { selector: 'dd *, dd' })).toBeInTheDocument();
    expect(screen.getByText('Wants a visit first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sales script/ })).toBeInTheDocument();
    for (const section of ['Offers', 'Activities', 'Follow-ups', 'Stage history']) {
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument();
    }
  });

  it('FR-DEAL-09 lists every stage change with who made it, or "Automatic"', async () => {
    renderPage();
    const history = within(await screen.findByRole('list', { name: 'Stage history' }));
    expect(history.getByText('Opened in New lead')).toBeInTheDocument();
    expect(history.getByText('New lead → Contacted')).toBeInTheDocument();
    expect(history.getByText(/Automatic/)).toBeInTheDocument();
  });

  it('FR-DEAL-07 moves the deal to another open stage; Won and Lost are not offered', async () => {
    vi.mocked(dealService.changeStage).mockResolvedValue(detail({ stage: 'NEGOTIATION' }));
    renderPage();
    const select = await screen.findByRole('combobox', { name: 'Move to stage' });
    expect(within(select).queryByRole('option', { name: 'Won' })).toBeNull();
    fireEvent.change(select, { target: { value: 'NEGOTIATION' } });
    await waitFor(() => expect(dealService.changeStage).toHaveBeenCalledWith('acme', 'd1', 'NEGOTIATION'));
  });

  it('FR-DEAL-05 changing the salesperson is offered only with companies.reassign', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Change salesperson' })).toBeNull();
  });

  it('FR-DEAL-05 a Sales Manager hands the deal to another salesperson', async () => {
    setPermissions({ 'deals.view': 'TEAM', 'deals.edit': 'TEAM', 'companies.reassign': 'TEAM' });
    vi.mocked(dealService.reassign).mockResolvedValue(detail({ ownerUserId: 'u-b', ownerName: 'Dritan Test' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Change salesperson' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'New salesperson' }), { target: { value: 'u-b' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change salesperson' }));
    await waitFor(() => expect(dealService.reassign).toHaveBeenCalledWith('acme', 'd1', 'u-b'));
  });

  it('FR-DEAL-19 deleting needs deals.delete, asks first, and returns to the pipeline', async () => {
    setPermissions({ 'deals.view': 'TEAM', 'deals.edit': 'TEAM', 'deals.delete': 'TEAM' });
    vi.mocked(dealService.remove).mockResolvedValue();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Deal actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete deal' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete deal' }));
    await waitFor(() => expect(dealService.remove).toHaveBeenCalledWith('acme', 'd1'));
    expect(await screen.findByText('pipeline board')).toBeInTheDocument();
  });

  it('FR-DEAL-04 a deal outside the viewer\'s scope reads as not found', async () => {
    vi.mocked(dealService.get).mockRejectedValue({ response: { status: 404 } });
    renderPage();
    expect(await screen.findByText('This deal does not exist or is not one of yours.')).toBeInTheDocument();
  });
});

describe('Deal page activities (FR-ACT-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPermissions({ 'deals.view': 'OWN', 'deals.edit': 'OWN', 'activities.view': 'OWN', 'activities.add': 'OWN', 'notes.add': 'OWN' });
    vi.mocked(dealService.get).mockResolvedValue(detail());
  });

  it("FR-ACT-05 lists the deal's activities with their type, time, author, contact, result and next action", async () => {
    vi.mocked(dealService.activities).mockResolvedValue([
      {
        id: 'i1', clientId: 'c1', dealId: 'd1', channel: 'CALL', content: '', occurredAt: '2026-10-02T09:00:00.000Z',
        recordedAt: '2026-10-02T09:05:00.000Z', updatedAt: null, author: { id: 'u-a', name: 'Besa Test' },
        contact: { id: 'p1', name: 'Alba Hoxha' }, result: { id: 'r1', nameSq: 'Kërkoi ofertë', nameEn: 'Offer requested' },
        clientFeedback: null, nextAction: 'Prepare the offer',
      },
    ]);
    renderPage();

    const section = await screen.findByRole('list', { name: 'Activities' });
    expect(within(section).getByText('Call')).toBeInTheDocument();
    expect(within(section).getByText(/Besa Test/)).toBeInTheDocument();
    expect(within(section).getByText('Alba Hoxha')).toBeInTheDocument();
    expect(within(section).getByText('Offer requested')).toBeInTheDocument();
    expect(within(section).getByText('Prepare the offer')).toBeInTheDocument();
    expect(dealService.activities).toHaveBeenCalledWith('acme', 'd1');
  });

  it('FR-ACT-01 offers "Record activity" on an open deal', async () => {
    vi.mocked(dealService.activities).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No activities on this deal yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record activity' })).toBeInTheDocument();
  });

  it('FR-ACT-01 a won deal takes no new activities', async () => {
    vi.mocked(dealService.get).mockResolvedValue(detail({ stage: 'WON', closedAt: '2026-10-02T10:00:00Z' }));
    vi.mocked(dealService.activities).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No activities on this deal yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record activity' })).not.toBeInTheDocument();
  });
});
