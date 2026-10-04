import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PipelineBoardContent } from './PipelineBoardContent';
import { dealService } from '../../services/dealService';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../../components/ui/Toast';
import type { BoardColumn, DealStage, DealSummary, PipelineBoard } from '../../types/deal';
import { DEAL_STAGES } from '../../types/deal';

vi.mock('../../services/dealService', () => ({
  dealService: { board: vi.fn(), column: vi.fn(), changeStage: vi.fn(), offers: vi.fn(), win: vi.fn(), lose: vi.fn() },
}));
vi.mock('../../services/followUpService', () => ({ followUpService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/lookupService', () => ({
  lookupService: { list: vi.fn().mockResolvedValue([{ id: 'r1', nameSq: 'Çmimi', nameEn: 'Price', order: 0, active: true }]) },
}));
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));

const card = (id: string, stage: DealStage, overrides: Partial<DealSummary> = {}): DealSummary => ({
  id,
  clientId: `client-${id}`,
  companyName: `Company ${id}`,
  type: 'NEW_CONTRACT',
  title: null,
  stage,
  ownerUserId: 'u1',
  ownerName: 'Besa Test',
  expectedCloseDate: null,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
  closedAt: null,
  netMonthlyPrice: null,
  annualValue: null,
  nextFollowUpAt: null,
  lastActivityAt: '2026-10-02T08:00:00Z',
  hasOverdueFollowUp: false,
  isStale: false,
  ...overrides,
});

const boardWith = (cards: DealSummary[]): PipelineBoard => ({
  columns: DEAL_STAGES.map((stage): BoardColumn => {
    const items = cards.filter((c) => c.stage === stage);
    return { stage, count: items.length, totalNetMonthlyPrice: null, items, nextCursor: null };
  }),
});

const setPermissions = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: { userId: 'u1', email: 'sales@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions },
    isAuthenticated: true,
  } as any);

const renderBoard = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/pipeline']}>
        <Routes>
          <Route path="/:tenantSlug/pipeline" element={<PipelineBoardContent />} />
          <Route path="/:tenantSlug/deals/:dealId" element={<p>deal page</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

const column = (name: RegExp) => screen.getByRole('region', { name });
const dataTransfer = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' });

describe('Pipeline board (FR-DEAL-10, FR-DEAL-13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPermissions({ 'deals.view': 'OWN', 'deals.edit': 'OWN', 'commercial.view': 'OWN' });
    vi.mocked(dealService.board).mockResolvedValue(boardWith([card('a', 'CONTACTED'), card('b', 'CONTACTED'), card('w', 'WON')]));
    vi.mocked(dealService.changeStage).mockImplementation(async (_slug, id, stage) => ({ ...card(id, stage), notes: null, createdByUserId: 'u1', contacts: [], history: [] }));
  });

  it('FR-DEAL-10 shows one column per stage with its card count, and cards with company, title and salesperson', async () => {
    renderBoard();
    const contacted = await waitFor(() => column(/^Contacted/));
    expect(within(contacted).getByText('2')).toBeInTheDocument();
    expect(within(contacted).getByText('Company a')).toBeInTheDocument();
    expect(within(contacted).getByText('Company a – New contract')).toBeInTheDocument();
    expect(within(contacted).getAllByText('Besa Test')).toHaveLength(2);
    expect(screen.getAllByRole('region', { name: /, \d+ deals$/ })).toHaveLength(9);
  });

  it('FR-DEAL-12 FR-DEAL-10 a card shows its next follow-up and the overdue marker', async () => {
    vi.mocked(dealService.board).mockResolvedValue(
      boardWith([{ ...card('a', 'CONTACTED'), nextFollowUpAt: '2026-10-01T07:00:00Z', hasOverdueFollowUp: true }, card('b', 'CONTACTED')])
    );
    renderBoard();
    const contacted = await waitFor(() => column(/^Contacted/));
    expect(within(contacted).getByText('Overdue follow-up')).toBeInTheDocument();
    expect(within(contacted).getByText(/^Follow-up /)).toBeInTheDocument();
  });

  it('FR-DEAL-10 dragging a card from Contacted to Interested moves it and updates both counts', async () => {
    renderBoard();
    const source = await waitFor(() => within(column(/^Contacted/)).getByRole('article', { name: /Company a/ }));
    const transfer = dataTransfer();
    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireEvent.dragOver(column(/^Interested/), { dataTransfer: transfer });
    fireEvent.drop(column(/^Interested/), { dataTransfer: transfer });

    await waitFor(() => expect(dealService.changeStage).toHaveBeenCalledWith('acme', 'a', 'INTERESTED'));
    expect(within(column(/^Interested/)).getByText('Company a')).toBeInTheDocument();
    expect(within(column(/^Interested/)).getByText('1')).toBeInTheDocument();
    expect(within(column(/^Contacted/)).getByText('1')).toBeInTheDocument();
  });

  it('FR-DEAL-07 dropping on Won or Lost opens their dialog instead of moving the card', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([]);
    renderBoard();
    const source = await waitFor(() => within(column(/^Contacted/)).getByRole('article', { name: /Company a/ }));
    const transfer = dataTransfer();
    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireEvent.drop(column(/^Lost/), { dataTransfer: transfer });
    expect(await screen.findByText('Mark this deal as lost')).toBeInTheDocument();
    expect(dealService.changeStage).not.toHaveBeenCalled();
    expect(within(column(/^Contacted/)).getByText('Company a')).toBeInTheDocument();
  });

  it('FR-DEAL-13 the card menu moves a deal to another open stage without dragging', async () => {
    renderBoard();
    const deal = await waitFor(() => within(column(/^Contacted/)).getByRole('article', { name: /Company a/ }));
    fireEvent.click(within(deal).getByRole('button', { name: /Move to stage/ }));
    const menu = await screen.findByRole('menu');
    // Won and Lost are in the menu too, and open their dialogs (FR-DEAL-07).
    expect(within(menu).getByRole('menuitem', { name: /Won/ })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /^Contacted/ })).toBeNull();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Negotiation/ }));

    await waitFor(() => expect(dealService.changeStage).toHaveBeenCalledWith('acme', 'a', 'NEGOTIATION'));
    expect(within(column(/^Negotiation/)).getByText('Company a')).toBeInTheDocument();
  });

  it('FR-DEAL-13 a failed move puts the card back and reloads the board', async () => {
    vi.mocked(dealService.changeStage).mockRejectedValueOnce(new Error('offline'));
    renderBoard();
    const deal = await waitFor(() => within(column(/^Contacted/)).getByRole('article', { name: /Company a/ }));
    fireEvent.click(within(deal).getByRole('button', { name: /Move to stage/ }));
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Negotiation/ }));

    await waitFor(() => expect(dealService.board).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(column(/^Contacted/)).getByText('Company a')).toBeInTheDocument());
  });

  it('FR-DEAL-04 without deals.edit the cards can be opened but not moved', async () => {
    setPermissions({ 'deals.view': 'ALL', 'commercial.view': 'ALL' });
    renderBoard();
    const deal = await waitFor(() => within(column(/^Contacted/)).getByRole('article', { name: /Company a/ }));
    expect(deal).not.toHaveAttribute('draggable', 'true');
    expect(within(deal).queryByRole('button', { name: /Move to stage/ })).toBeNull();
  });

  it('FR-RBAC-17 shows column totals and card values only when the server sends them', async () => {
    vi.mocked(dealService.board).mockResolvedValue({
      columns: boardWith([card('a', 'CONTACTED')]).columns.map(({ totalNetMonthlyPrice: _hidden, ...c }) => ({
        ...c,
        items: c.items.map(({ netMonthlyPrice: _value, annualValue: _annual, ...item }) => item as DealSummary),
      })),
    });
    renderBoard();
    await waitFor(() => column(/^Contacted/));
    expect(screen.queryAllByText('—')).toHaveLength(0);
  });

  it('FR-DEAL-10 loads more cards of one column from its cursor', async () => {
    const columns = boardWith([card('a', 'CONTACTED')]).columns.map((c) =>
      c.stage === 'CONTACTED' ? { ...c, count: 2, nextCursor: 'cursor-1' } : c
    );
    vi.mocked(dealService.board).mockResolvedValue({ columns });
    vi.mocked(dealService.column).mockResolvedValue({ stage: 'CONTACTED', items: [card('z', 'CONTACTED')], nextCursor: null });
    renderBoard();
    fireEvent.click(await waitFor(() => within(column(/^Contacted/)).getByRole('button', { name: 'Load more' })));
    await waitFor(() => expect(within(column(/^Contacted/)).getByText('Company z')).toBeInTheDocument());
    expect(dealService.column).toHaveBeenCalledWith('acme', 'CONTACTED', 'cursor-1');
    expect(within(column(/^Contacted/)).queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
