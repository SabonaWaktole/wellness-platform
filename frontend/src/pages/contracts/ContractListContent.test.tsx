import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContractListContent } from './ContractListContent';
import { useContracts } from '../../hooks/useContracts';
import { useStatusLabels } from '../../hooks/useStatusLabels';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../hooks/useContracts', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useContracts')>('../../hooks/useContracts');
  return { ...actual, useContracts: vi.fn() };
});

vi.mock('../../hooks/useStatusLabels', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useStatusLabels')>('../../hooks/useStatusLabels');
  return { ...actual, useStatusLabels: vi.fn() };
});

describe('FR-SET-07 ContractListContent status tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        userId: 'u1',
        email: 'owner@example.com',
        role: 'BUSINESS_OWNER',
        tenantId: 't1',
        tenantSlug: 'acme',
        permissions: { 'commercial.view': true, 'payments.view': true },
      },
      isAuthenticated: true,
    });
    (useContracts as any).mockReturnValue({
      fetchContracts: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      loading: false,
      error: null,
    });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ContractListContent />
      </MemoryRouter>
    );

  it('shows a tenant-renamed contract status label on its tab, not the built-in one', () => {
    (useStatusLabels as any).mockImplementation((domain: string) =>
      domain === 'contract'
        ? [{ key: 'ACTIVE', labelSq: 'Aktive e re', labelEn: 'Live', colour: '#000', order: 0 }]
        : []
    );

    renderPage();

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('includes tabs for the new PENDING_SIGNATURE and SUSPENDED statuses', () => {
    (useStatusLabels as any).mockReturnValue([]);

    renderPage();

    expect(screen.getByText('Pending signature')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });
});
