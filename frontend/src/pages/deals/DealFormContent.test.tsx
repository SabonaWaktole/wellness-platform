import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DealFormContent } from './DealFormContent';
import { dealService } from '../../services/dealService';
import { clientService } from '../../services/clientService';
import { useAuthStore } from '../../store/useAuthStore';
import type { DealDetail } from '../../types/deal';

vi.mock('../../services/dealService', () => ({ dealService: { get: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock('../../services/clientService', () => ({ clientService: { getClient: vi.fn(), searchClients: vi.fn() } }));
vi.mock('../../hooks/useStatusLabels', () => ({ useStatusLabels: () => [] }));
vi.mock('../../hooks/useTeam', () => ({
  useTeam: () => ({
    staff: [{ id: 'u-b', email: 'b@example.com', role: 'STAFF', firstName: 'Dritan', lastName: 'Test', isActive: true }],
    fetchStaff: vi.fn(),
  }),
}));

const saved = (overrides: Partial<DealDetail> = {}): DealDetail => ({
  id: 'd1',
  clientId: 'c1',
  companyName: 'Kafe Blloku',
  type: 'NEW_CONTRACT',
  title: null,
  stage: 'NEW_LEAD',
  ownerUserId: 'u-a',
  ownerName: 'Besa Test',
  expectedCloseDate: null,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
  closedAt: null,
  nextFollowUpAt: null,
  notes: null,
  createdByUserId: 'u-a',
  contacts: [],
  history: [],
  ...overrides,
});

const setPermissions = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: { userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions },
    isAuthenticated: true,
  } as any);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:tenantSlug/deals/new" element={<DealFormContent />} />
        <Route path="/:tenantSlug/deals/:dealId/edit" element={<DealFormContent />} />
        <Route path="/:tenantSlug/deals/:dealId" element={<p>deal page</p>} />
      </Routes>
    </MemoryRouter>
  );

describe('Deal form (FR-DEAL-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPermissions({ 'deals.view': 'OWN', 'deals.edit': 'OWN' });
    vi.mocked(clientService.getClient).mockResolvedValue({ id: 'c1', name: 'Kafe Blloku' } as any);
    vi.mocked(dealService.create).mockResolvedValue(saved());
  });

  it('FR-DEAL-01 creates a deal for the company it was opened from, with type, title, close date and notes', async () => {
    renderAt('/acme/deals/new?clientId=c1');
    expect(await screen.findByText('Kafe Blloku')).toBeInTheDocument();
    expect(screen.getByText(/Leave empty to use “Kafe Blloku – New contract”/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'RENEWAL' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Second site' } });
    fireEvent.change(screen.getByLabelText('Expected close date'), { target: { value: '2026-12-15' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'Visit first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));

    await waitFor(() =>
      expect(dealService.create).toHaveBeenCalledWith('acme', {
        clientId: 'c1',
        type: 'RENEWAL',
        title: 'Second site',
        expectedCloseDate: '2026-12-15',
        notes: 'Visit first',
      })
    );
    expect(await screen.findByText('deal page')).toBeInTheDocument();
  });

  it('FR-DEAL-01 without a company it asks for one before saving', async () => {
    vi.mocked(clientService.searchClients).mockResolvedValue({ items: [{ id: 'c2', name: 'Furra Dritan' }], total: 1 } as any);
    renderAt('/acme/deals/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Create deal' }));
    expect(await screen.findByText('Choose a company.')).toBeInTheDocument();
    expect(dealService.create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search for a company' }), { target: { value: 'Furra' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Furra Dritan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));
    await waitFor(() => expect(dealService.create).toHaveBeenCalledWith('acme', expect.objectContaining({ clientId: 'c2' })));
  });

  it('FR-DEAL-01 naming another salesperson is offered only with companies.reassign', async () => {
    renderAt('/acme/deals/new?clientId=c1');
    await screen.findByText('Kafe Blloku');
    expect(screen.queryByRole('combobox', { name: 'Salesperson' })).toBeNull();
  });

  it('FR-DEAL-01 shows the server\'s field error beside the field', async () => {
    vi.mocked(dealService.create).mockRejectedValue({ response: { status: 400, data: { code: 'INVALID_DEAL', field: 'title' } } });
    renderAt('/acme/deals/new?clientId=c1');
    await screen.findByText('Kafe Blloku');
    fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));
    expect(await screen.findByText('The title is too long.')).toBeInTheDocument();
  });

  it('FR-DEAL-01 edits an existing deal', async () => {
    vi.mocked(dealService.get).mockResolvedValue(saved({ title: 'Old title', notes: 'Old notes' }));
    vi.mocked(dealService.update).mockResolvedValue(saved({ title: 'New title' }));
    renderAt('/acme/deals/d1/edit');
    const titleInput = await screen.findByDisplayValue('Old title');
    fireEvent.change(titleInput, { target: { value: 'New title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save deal' }));
    await waitFor(() =>
      expect(dealService.update).toHaveBeenCalledWith('acme', 'd1', {
        type: 'NEW_CONTRACT',
        title: 'New title',
        expectedCloseDate: null,
        notes: 'Old notes',
      })
    );
  });
});
