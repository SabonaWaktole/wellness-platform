import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StatusesSettingsContent } from './StatusesSettingsContent';
import { useStatusLabelsStore } from '../../../store/useStatusLabelsStore';
import { statusLabelService } from '../../../services/statusLabelService';
import { salesSettingsService } from '../../../services/followUpService';

vi.mock('../../../services/statusLabelService', () => ({
  statusLabelService: { list: vi.fn(), update: vi.fn(), reorder: vi.fn() },
}));
vi.mock('../../../services/followUpService', () => ({
  salesSettingsService: { get: vi.fn(), update: vi.fn() },
}));

const CONTRACT_LABELS = [
  { key: 'DRAFT', labelSq: 'Skicë', labelEn: 'Draft', colour: '#64748B', order: 1 },
  { key: 'ACTIVE', labelSq: 'Aktive', labelEn: 'Active', colour: '#3DAA6C', order: 2 },
];
const PAYMENT_LABELS = [{ key: 'PAID', labelSq: 'Paguar', labelEn: 'Paid', colour: '#3DAA6C', order: 1 }];
const DEAL_LABELS = [{ key: 'INTERESTED', labelSq: 'I interesuar', labelEn: 'Interested', colour: '#0EA5E9', order: 3 }];

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/acme/settings/statuses']}>
      <Routes>
        <Route path="/:tenantSlug/settings/statuses" element={<StatusesSettingsContent />} />
      </Routes>
    </MemoryRouter>
  );

describe('StatusesSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusLabelsStore.setState({ byDomain: {}, loading: {} });
    vi.mocked(salesSettingsService.get).mockResolvedValue({ staleDealDays: 14 });
    (statusLabelService.list as any).mockImplementation((_slug: string, domain: string) =>
      Promise.resolve(domain === 'contract' ? CONTRACT_LABELS : domain === 'deal' ? DEAL_LABELS : PAYMENT_LABELS)
    );
  });

  it('FR-SET-07, 08 FR-DEAL-06 loads and shows the contract and payment statuses and the deal stages', async () => {
    renderAt();

    expect((await screen.findAllByText('Draft')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Interested')).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Deal stages' })).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(3);
  });

  it('FR-SET-07 renaming "Active" saves the new label and colour, then reloads', async () => {
    (statusLabelService.update as any).mockResolvedValue({ key: 'ACTIVE', labelSq: 'Në fuqi', labelEn: 'Live', colour: '#00FF00', order: 2 });
    renderAt();
    await screen.findAllByText('Active');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Aktive' }));
    const labelInput = screen.getByRole('textbox', { name: 'Albanian label' });
    fireEvent.change(labelInput, { target: { value: 'Në fuqi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(statusLabelService.update).toHaveBeenCalledWith('acme', 'contract', 'ACTIVE', {
        labelSq: 'Në fuqi',
        labelEn: 'Active',
        colour: '#3DAA6C',
      })
    );
  });

  it('moves a status up and reorders through the API', async () => {
    (statusLabelService.reorder as any).mockResolvedValue([
      { ...CONTRACT_LABELS[1], order: 1 },
      { ...CONTRACT_LABELS[0], order: 2 },
    ]);
    renderAt();
    await screen.findAllByText('Active');

    fireEvent.click(screen.getByRole('button', { name: 'Move Aktive up' }));

    await waitFor(() => expect(statusLabelService.reorder).toHaveBeenCalledWith('acme', 'contract', ['ACTIVE', 'DRAFT']));
  });

  it('FR-DEAL-12 the Administrator sets after how many days without activity a deal is highlighted', async () => {
    vi.mocked(salesSettingsService.update).mockResolvedValue({ staleDealDays: 21 });
    renderAt();
    const input = await screen.findByLabelText('Highlight open deals with no activity for');
    await waitFor(() => expect(input).toHaveValue(14));

    fireEvent.change(input, { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the days without activity' }));

    await waitFor(() => expect(salesSettingsService.update).toHaveBeenCalledWith('acme', { staleDealDays: 21 }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('FR-DEAL-12 refuses a number of days outside 1 to 365 before saving', async () => {
    renderAt();
    const input = await screen.findByLabelText('Highlight open deals with no activity for');
    await waitFor(() => expect(input).toHaveValue(14));
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the days without activity' }));
    expect(await screen.findByText('Enter a whole number of days from 1 to 365.')).toBeInTheDocument();
    expect(salesSettingsService.update).not.toHaveBeenCalled();
  });
});
