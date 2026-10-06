import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DealDetailContent } from './DealDetailContent';
import { dealService } from '../../services/dealService';
import { followUpService } from '../../services/followUpService';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../../components/ui/Toast';
import type { DealDetail } from '../../types/deal';

vi.mock('../../services/dealService', () => ({
  dealService: { get: vi.fn(), changeStage: vi.fn(), reassign: vi.fn(), remove: vi.fn(), activities: vi.fn(), offers: vi.fn(), list: vi.fn(), win: vi.fn(), lose: vi.fn(), reopen: vi.fn() },
}));
vi.mock('../../services/lookupService', () => ({
  lookupService: { list: vi.fn().mockResolvedValue([{ id: 'r1', nameSq: 'Çmimi', nameEn: 'Price', order: 0, active: true }]) },
}));
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));
vi.mock('../../services/followUpService', () => ({ followUpService: { list: vi.fn(), schedule: vi.fn() } }));
vi.mock('../../hooks/useActiveLookups', () => ({
  useActiveLookups: () => [
    { id: 'i3', days: 3, nameSq: '3 ditë', nameEn: '3 days', order: 1, active: true },
    { id: 'i5', days: 5, nameSq: '5 ditë', nameEn: '5 days', order: 2, active: true },
  ],
}));
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
  lastActivityAt: '2026-10-02T08:00:00Z',
  hasOverdueFollowUp: false,
  isStale: false,
  wonAt: null,
  lostAt: null,
  lostReasonId: null,
  lostReasonSq: null,
  lostReasonEn: null,
  lostNote: null,
  packageId: null,
  packageNameSq: null,
  packageNameEn: null,
  wonQuotationId: null,
  wonQuotationReference: null,
  notes: 'Wants a visit first',
  createdByUserId: 'u-a',
  contacts: [{ id: 'p1', name: 'Alba Hoxha', position: 'Drejtore', phone: '+355690000002', email: null, isPrimary: true }],
  history: [
    { id: 'h1', fromStage: null, toStage: 'NEW_LEAD', changedByUserId: 'u-a', changedByName: 'Besa Test', at: '2026-10-01T08:00:00Z', note: null },
    { id: 'h2', fromStage: 'NEW_LEAD', toStage: 'CONTACTED', changedByUserId: null, changedByName: null, at: '2026-10-02T08:00:00Z', note: null },
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
    setPermissions({
      'deals.view': 'TEAM',
      'deals.edit': 'TEAM',
      'commercial.view': 'TEAM',
      'script.view': true,
      'calendar.view': 'TEAM',
      'followups.manage': 'TEAM',
    });
    vi.mocked(dealService.get).mockResolvedValue(detail());
    vi.mocked(followUpService.list).mockResolvedValue([]);
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

  it('FR-DEAL-03 FR-FUP-01 lists the deal\'s open follow-ups, and "+3 days" schedules one on this deal', async () => {
    vi.mocked(followUpService.list).mockResolvedValue([
      {
        id: 'f1', clientId: 'c1', companyName: 'Kafe Blloku', dealId: 'd1', dealTitle: null, dealType: 'NEW_CONTRACT',
        contactPersonId: 'p1', contactName: 'Alba Hoxha', assignedUserId: 'u-a', assignedUserName: 'Besa Test', type: 'CALL',
        status: 'SCHEDULED', scheduledAt: '2026-10-01T07:00:00Z', notes: 'Send the revised offer', intervalDays: 3,
        completedInteractionId: null, cancelReason: null, isOverdue: true, history: [], createdAt: '2026-09-28T08:00:00Z', updatedAt: '2026-09-28T08:00:00Z',
      },
    ]);
    vi.mocked(followUpService.schedule).mockResolvedValue({} as any);
    renderPage();
    expect(await screen.findByText('Send the revised offer')).toBeInTheDocument();
    expect(followUpService.list).toHaveBeenCalledWith('acme', { dealId: 'd1' });
    expect(screen.getByText('Overdue')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Follow up in 3 days' }));
    await waitFor(() =>
      expect(followUpService.schedule).toHaveBeenCalledWith('acme', expect.objectContaining({ clientId: 'c1', dealId: 'd1', intervalDays: 3 }))
    );
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

describe('Won and lost on the deal page (FR-DEAL-14..17)', () => {
  const offer = { id: 'o1', reference: 'OF-2026-0001', status: 'SENT', superseded: false, netMonthlyPrice: '49.40', annualValue: '592.80', permittedActions: [], dealOpen: true, version: 1, createdAt: '2026-10-02T08:00:00Z', updatedAt: '2026-10-02T08:00:00Z', readyAt: '2026-10-02T08:00:00Z', sentAt: '2026-10-02T12:00:00Z', validUntil: '2026-11-01', respondedAt: null, statusNote: null, note: null, createdByName: 'Besa Test', services: [], pendingApproval: null, language: 'sq' };

  beforeEach(() => {
    vi.clearAllMocks();
    setPermissions({ 'deals.view': 'TEAM', 'deals.edit': 'TEAM', 'deals.reopen': 'TEAM', 'commercial.view': 'TEAM', 'followups.manage': 'TEAM' });
    vi.mocked(dealService.get).mockResolvedValue(detail());
    vi.mocked(followUpService.list).mockResolvedValue([]);
    vi.mocked(dealService.activities).mockResolvedValue([]);
    vi.mocked(dealService.offers).mockResolvedValue([offer] as any);
  });

  it('FR-DEAL-14 the win dialog shows the offer\'s values read-only and sends no price', async () => {
    vi.mocked(dealService.win).mockResolvedValue(
      detail({ stage: 'WON', agreedMonthlyPrice: '49.40', agreedAnnualValue: '592.80', wonQuotationReference: 'OF-2026-0001', wonAt: '2026-10-04T00:00:00Z', closedAt: '2026-10-04T00:00:00Z' })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Win deal' }));
    expect((await screen.findAllByText('OF-2026-0001')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/49\.40/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('textbox', { name: /price/i })).toBeNull();
    fireEvent.click(within(screen.getByText('Win this deal').closest('div')!.parentElement!).getByRole('button', { name: 'Win deal' }));
    await waitFor(() => expect(dealService.win).toHaveBeenCalledWith('acme', 'd1', expect.objectContaining({ offerId: 'o1', closeFollowUps: true })));
    const args = vi.mocked(dealService.win).mock.calls[0][2] as Record<string, unknown>;
    expect(args).not.toHaveProperty('agreedMonthlyPrice');
    expect(await screen.findByRole('heading', { name: 'Won' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('FR-DEAL-16 the lost dialog needs a reason', async () => {
    vi.mocked(dealService.lose).mockResolvedValue(detail({ stage: 'LOST', lostReasonId: 'r1', lostReasonSq: 'Çmimi', lostReasonEn: 'Price', lostAt: '2026-10-04T00:00:00Z' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as lost' }));
    const confirm = await screen.findAllByRole('button', { name: 'Mark as lost' });
    const submit = confirm[confirm.length - 1];
    expect(submit).toBeDisabled();
    fireEvent.change(await screen.findByRole('combobox', { name: /Reason/ }), { target: { value: 'r1' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(dealService.lose).toHaveBeenCalledWith('acme', 'd1', { reasonId: 'r1', note: null }));
    expect(await screen.findByRole('heading', { name: 'Lost' })).toBeInTheDocument();
  });

  it('FR-DEAL-17 only deals.reopen sees Reopen on a closed deal, and Win and Lost are gone', async () => {
    vi.mocked(dealService.get).mockResolvedValue(detail({ stage: 'LOST' }));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Win deal' })).toBeNull();
  });

  it('FR-DEAL-17 without deals.reopen there is no Reopen', async () => {
    setPermissions({ 'deals.view': 'TEAM', 'deals.edit': 'TEAM', 'commercial.view': 'TEAM' });
    vi.mocked(dealService.get).mockResolvedValue(detail({ stage: 'WON' }));
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  });
});

describe('Renewal deal on the deal page (M3 FR-REN-06, 07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPermissions({ 'deals.view': 'TEAM', 'deals.edit': 'TEAM', 'commercial.view': 'TEAM', 'contracts.manage': 'TEAM', 'script.view': true, 'calendar.view': 'TEAM', 'followups.manage': 'TEAM' });
    vi.mocked(followUpService.list).mockResolvedValue([]);
    vi.mocked(dealService.activities).mockResolvedValue([]);
    vi.mocked(dealService.offers).mockResolvedValue([]);
  });

  it('FR-REN-06 says which contract a Renewal deal renews, with a link to it', async () => {
    vi.mocked(dealService.get).mockResolvedValue(detail({ type: 'RENEWAL', stage: 'INTERESTED', renewalOfContractId: 'k1', renewalOfContractNumber: 'CTR-2026-0001', renewalStartsOn: '2027-01-01' }));
    renderPage();
    expect(await screen.findByRole('link', { name: 'Renewal of CTR-2026-0001' })).toHaveAttribute('href', '/acme/contracts/k1');
  });

  it('FR-REN-07 a won Renewal deal shows "Create contract" with the start date the new term gets', async () => {
    vi.mocked(dealService.get).mockResolvedValue(
      detail({ type: 'RENEWAL', stage: 'WON', wonAt: '2026-12-01T00:00:00Z', closedAt: '2026-12-01T00:00:00Z', renewalOfContractId: 'k1', renewalOfContractNumber: 'CTR-2026-0001', renewalStartsOn: '2027-01-01', contractId: null })
    );
    renderPage();
    expect(await screen.findByRole('button', { name: 'Create contract' })).toBeInTheDocument();
    expect(screen.getByText(/The new term starts on/)).toBeInTheDocument();
  });

  it('a deal that is not a renewal shows neither the link nor the start date', async () => {
    vi.mocked(dealService.get).mockResolvedValue(detail());
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/Renewal of/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The new term starts on/)).not.toBeInTheDocument();
  });
});
