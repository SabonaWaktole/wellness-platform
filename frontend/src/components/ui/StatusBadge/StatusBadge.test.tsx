import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StatusBadge } from './StatusBadge';
import { useStatusLabelsStore } from '../../../store/useStatusLabelsStore';
import { statusLabelService } from '../../../services/statusLabelService';

vi.mock('../../../services/statusLabelService', () => ({
  statusLabelService: { list: vi.fn(), update: vi.fn(), reorder: vi.fn() },
}));

const CONTRACT_LABELS = [
  { key: 'DRAFT', labelSq: 'Skicë', labelEn: 'Draft', colour: '#64748B', order: 1 },
  { key: 'ACTIVE', labelSq: 'Aktive', labelEn: 'Active', colour: '#00FF00', order: 2 },
];

const renderAt = (domain: 'contract' | 'payment', status: string) =>
  render(
    <MemoryRouter initialEntries={['/acme/contracts']}>
      <Routes>
        <Route path="/:tenantSlug/contracts" element={<StatusBadge domain={domain} status={status} />} />
      </Routes>
    </MemoryRouter>
  );

describe('StatusBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusLabelsStore.setState({ byDomain: {}, loading: {} });
    (statusLabelService.list as any).mockImplementation((_slug: string, domain: string) =>
      Promise.resolve(domain === 'contract' ? CONTRACT_LABELS : [])
    );
  });

  it('renders with the tenant-set colour once the labels have loaded (FR-SET-07)', async () => {
    renderAt('contract', 'ACTIVE');

    const badge = await screen.findByText('Active');
    expect(badge).toHaveStyle({ color: '#00FF00' });
  });

  it('falls back to the fixed variant for a key with no tenant row (e.g. WAIVED)', async () => {
    renderAt('payment', 'WAIVED');

    const badge = await screen.findByText('Waived');
    expect(badge.style.color).toBe('');
  });
});
