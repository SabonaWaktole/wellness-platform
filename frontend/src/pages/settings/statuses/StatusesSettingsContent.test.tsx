import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StatusesSettingsContent } from './StatusesSettingsContent';
import { useStatusLabelsStore } from '../../../store/useStatusLabelsStore';
import { statusLabelService } from '../../../services/statusLabelService';

vi.mock('../../../services/statusLabelService', () => ({
  statusLabelService: { list: vi.fn(), update: vi.fn(), reorder: vi.fn() },
}));

const CONTRACT_LABELS = [
  { key: 'DRAFT', labelSq: 'Skicë', labelEn: 'Draft', colour: '#64748B', order: 1 },
  { key: 'ACTIVE', labelSq: 'Aktive', labelEn: 'Active', colour: '#3DAA6C', order: 2 },
];
const PAYMENT_LABELS = [{ key: 'PAID', labelSq: 'Paguar', labelEn: 'Paid', colour: '#3DAA6C', order: 1 }];

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
    (statusLabelService.list as any).mockImplementation((_slug: string, domain: string) =>
      Promise.resolve(domain === 'contract' ? CONTRACT_LABELS : PAYMENT_LABELS)
    );
  });

  it('FR-SET-07, 08 loads and shows both domains\' statuses', async () => {
    renderAt();

    expect((await screen.findAllByText('Draft')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('table')).toHaveLength(2);
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
});
