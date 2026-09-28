import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { InvoiceListContent } from './InvoiceListContent';
import { useInvoices } from '../../hooks/useInvoices';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../hooks/useInvoices');

const signIn = (permissions: Record<string, string | true>) =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: 'u1', email: 'u@example.com', role: 'STAFF', tenantId: 't1', permissions },
  } as any);

const invoice = {
  id: 'inv-abcdef12-0000', clientName: 'Acme', status: 'SENT',
  createdAt: '2026-07-01T10:00:00Z', dueDate: '2026-08-01T10:00:00Z',
};

const renderList = async (row: Record<string, unknown>) => {
  (useInvoices as any).mockReturnValue({
    fetchInvoices: vi.fn().mockResolvedValue({ data: [row], total: 1 }),
    loading: false,
  });
  render(
    <MemoryRouter initialEntries={['/acme/invoices']}>
      <Routes>
        <Route path="/:tenantSlug/invoices" element={<InvoiceListContent />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText('Acme');
};

describe('InvoiceListContent money column (FR-RBAC-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('drops the total column for a role without commercial.view', async () => {
    signIn({ 'invoices.manage': 'OWN' });
    await renderList(invoice);

    expect(screen.queryByText('Total Amount')).toBeNull();
    expect(screen.queryByText(/NaN|undefined|0[.,]00/)).toBeNull();
  });

  it('shows the total with commercial.view', async () => {
    signIn({ 'invoices.manage': 'OWN', 'commercial.view': 'OWN' });
    await renderList({ ...invoice, grandTotal: 1234 });

    expect(screen.getByText('Total Amount')).toBeInTheDocument();
  });
});
