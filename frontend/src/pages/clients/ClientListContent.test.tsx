// @ts-nocheck
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ClientListContent } from './ClientListContent';
import { MemoryRouter } from 'react-router-dom';
import * as useClientsModule from '../../hooks/useClients';
import * as useTeamModule from '../../hooks/useTeam';
import { useAuthStore } from '../../store/useAuthStore';

// Mock the hook
vi.mock('../../hooks/useClients', () => ({
  useClients: vi.fn(),
  useArchiveClient: vi.fn(),
  useRestoreClient: vi.fn(),
  useClientRelatedCounts: vi.fn(),
}));

vi.mock('../../hooks/useTeam', () => ({
  useTeam: vi.fn(),
}));

describe('ClientListContent', () => {
  let mockFetchClients: ReturnType<typeof vi.fn>;
  let mockArchiveClient: ReturnType<typeof vi.fn>;
  let mockRestoreClient: ReturnType<typeof vi.fn>;
  let mockFetchRelatedCounts: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetchClients = vi.fn();
    mockArchiveClient = vi.fn().mockResolvedValue({ archivedClientName: 'Acme' });
    mockRestoreClient = vi.fn().mockResolvedValue({ restoredClientName: 'Acme' });
    mockFetchRelatedCounts = vi.fn();
    
    // Default mock setup
    vi.mocked(useClientsModule.useClients).mockReturnValue({
      clients: [],
      total: 0,
      isLoading: false,
      error: null,
      fetchClients: mockFetchClients,
    });

    vi.mocked(useClientsModule.useArchiveClient).mockReturnValue({
      archiveClient: mockArchiveClient,
      isLoading: false,
      error: null,
    });
    vi.mocked(useClientsModule.useRestoreClient).mockReturnValue({
      restoreClient: mockRestoreClient,
      isLoading: false,
      error: null,
    });
    vi.mocked(useClientsModule.useClientRelatedCounts).mockReturnValue({
      counts: null,
      isLoading: false,
      fetchRelatedCounts: mockFetchRelatedCounts,
    });

    vi.mocked(useTeamModule.useTeam).mockReturnValue({
      staff: [
        { id: 'u1', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', role: 'STAFF' },
      ],
      pendingInvitations: [],
      loadingStaff: false,
      loadingInvitations: false,
      fetchStaff: vi.fn(),
      fetchPendingInvitations: vi.fn(),
      inviteStaff: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    render(
      <MemoryRouter initialEntries={['/tenant-1/clients']}>
        <ClientListContent />
      </MemoryRouter>
    );
  };

  it('renders the empty state when no clients exist', () => {
    renderComponent();
    expect(screen.getByText('Client Directory')).toBeInTheDocument();
    expect(screen.getByText('Showing 0 of 0 entries')).toBeInTheDocument();
    // The DataTable renders a dedicated empty state with a call to action
    expect(screen.getByText('No clients yet')).toBeInTheDocument();
    expect(screen.getByText('Clients you add will appear here.')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Acme Corp/i })).not.toBeInTheDocument();
  });

  it('renders skeleton placeholders while loading', () => {
    vi.mocked(useClientsModule.useClients).mockReturnValue({
      clients: [],
      total: 0,
      isLoading: true,
      error: null,
      fetchClients: mockFetchClients,
    });
    renderComponent();
    // Loading shows skeleton rows rather than the empty state
    expect(screen.queryByText('No clients yet')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: /client directory/i })).toBeInTheDocument();
  });

  it('renders the client list correctly', () => {
    vi.mocked(useClientsModule.useClients).mockReturnValue({
      clients: [
        {
          id: 'c1',
          tenantId: 'tenant-1',
          name: 'Acme Corp',
          contactInfo: { email: 'contact@acme.com' },
          status: 'FORMER_CLIENT',
          assignedUserId: 'u1',
          customFieldValues: {},
          lastUpdatedByUserId: 'u1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      total: 1,
      isLoading: false,
      error: null,
      fetchClients: mockFetchClients,
    });

    renderComponent();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('contact@acme.com')).toBeInTheDocument();
    expect(screen.getByText('Former client')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1 entries')).toBeInTheDocument();
  });

  it('debounces the search input correctly', () => {
    vi.useFakeTimers();
    
    renderComponent();
    
    // Initial fetch from useEffect on mount. The param is `search`, not
    // `name`: one box now matches name, email and phone (SRS 6.2).
    expect(mockFetchClients).toHaveBeenCalledTimes(1);
    // `archived: false` is explicit: the list asks for active clients, which
    // is what keeps archived ones out of the default view.
    expect(mockFetchClients).toHaveBeenCalledWith({ search: '', archived: false });
    
    mockFetchClients.mockClear();

    const searchInput = screen.getByPlaceholderText(/Search by name, email/i);
    
    // Type rapidly
    fireEvent.change(searchInput, { target: { value: 'A' } });
    fireEvent.change(searchInput, { target: { value: 'Ac' } });
    fireEvent.change(searchInput, { target: { value: 'Acm' } });
    fireEvent.change(searchInput, { target: { value: 'Acme' } });

    // No fetch should have happened yet (timers haven't advanced)
    expect(mockFetchClients).not.toHaveBeenCalled();

    // Advance timers just under the 300ms threshold
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(mockFetchClients).not.toHaveBeenCalled();

    // Advance the rest of the way
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // NOW it should have fetched, and exactly once for the final value
    expect(mockFetchClients).toHaveBeenCalledTimes(1);
    expect(mockFetchClients).toHaveBeenCalledWith({ search: 'Acme', archived: false });

    vi.useRealTimers();
  });

  describe('assignee column', () => {
    const withClient = (assignedUserId) => {
      vi.mocked(useClientsModule.useClients).mockReturnValue({
        clients: [
          { id: 'c1', name: 'Acme Corp', status: 'FORMER_CLIENT', contactInfo: { email: 'hi@acme.com' }, assignedUserId },
        ],
        total: 1,
        isLoading: false,
        error: null,
        fetchClients: mockFetchClients,
      });
      renderComponent();
    };

    it('renders the assignee name, never the raw UUID', () => {
      withClient('u1');
      expect(screen.getByText('Ada Lovelace')).toBeDefined();
      expect(screen.queryByText('u1')).toBeNull();
    });

    it('renders Unassigned when no one is assigned', () => {
      withClient(null);
      expect(screen.getByText('Unassigned')).toBeDefined();
    });

    it('degrades to Unassigned when the assignee is no longer in the staff list', () => {
      withClient('u-not-in-list');
      expect(screen.getByText('Unassigned')).toBeDefined();
      expect(screen.queryByText('u-not-in-list')).toBeNull();
    });
  });

  describe('archiving a client', () => {
    const asOwner = () => {
      useAuthStore.setState({
        user: {
          id: 'u1',
          email: 'owner@example.com',
          role: 'BUSINESS_OWNER',
          // companies.delete (D2's BUSINESS_OWNER -> Administrator mapping)
          // is what the page actually gates on now (FR-RBAC-07).
          permissions: { 'companies.delete': 'ALL' },
        } as any,
        isAuthenticated: true,
        isInitializing: false,
      });
    };

    const withOneClient = () => {
      vi.mocked(useClientsModule.useClients).mockReturnValue({
        clients: [
          {
            id: 'c1',
            name: 'Acme Ltd',
            contactInfo: { email: 'hi@acme.test' },
            status: 'FORMER_CLIENT',
            assignedUserId: 'u1',
            customFieldValues: {},
            lastUpdatedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        isLoading: false,
        error: null,
        fetchClients: mockFetchClients,
      });
    };

    afterEach(() => {
      useAuthStore.setState({ user: null, isAuthenticated: false });
    });

    it('hides the delete action from staff', () => {
      useAuthStore.setState({
        user: { id: 'u2', email: 'staff@example.com', role: 'STAFF' },
        isAuthenticated: true,
        isInitializing: false,
      });
      withOneClient();
      renderComponent();

      fireEvent.click(screen.getByLabelText(/Actions for Acme Ltd/i));
      expect(screen.queryByText('Delete client')).toBeNull();
      // The archived view is an owner tool too.
      expect(screen.queryByText('Archived')).toBeNull();
    });

    it('asks for confirmation before archiving, and does not archive on open', () => {
      asOwner();
      withOneClient();
      renderComponent();

      fireEvent.click(screen.getByLabelText(/Actions for Acme Ltd/i));
      fireEvent.click(screen.getByText('Delete client'));

      expect(screen.getByText('Delete this client?')).toBeDefined();
      expect(mockFetchRelatedCounts).toHaveBeenCalledWith('c1');
      // Opening the dialog must not be the action itself.
      expect(mockArchiveClient).not.toHaveBeenCalled();
    });

    it('tells the owner what archiving preserves', () => {
      asOwner();
      withOneClient();
      vi.mocked(useClientsModule.useClientRelatedCounts).mockReturnValue({
        counts: { interactions: 4, appointments: 2, quotations: 1, invoices: 3 },
        isLoading: false,
        fetchRelatedCounts: mockFetchRelatedCounts,
      });
      renderComponent();

      fireEvent.click(screen.getByLabelText(/Actions for Acme Ltd/i));
      fireEvent.click(screen.getByText('Delete client'));

      expect(screen.getByText(/3 invoice\(s\)/)).toBeDefined();
      expect(screen.getByText(/stay intact/)).toBeDefined();
    });

    it('switches to the archived view and offers restore instead of delete', () => {
      asOwner();
      withOneClient();
      renderComponent();

      fireEvent.click(screen.getByText('Archived'));
      expect(mockFetchClients).toHaveBeenLastCalledWith({ search: '', archived: true });

      fireEvent.click(screen.getByLabelText(/Actions for Acme Ltd/i));
      expect(screen.getByText('Restore client')).toBeDefined();
      expect(screen.queryByText('Delete client')).toBeNull();
    });
  });

  describe('the mine/team/all filter (FR-RBAC-11..13)', () => {
    const signInWithScope = (scope: 'OWN' | 'TEAM' | 'ALL') => {
      useAuthStore.setState({
        user: {
          id: 'u1',
          email: 'someone@example.com',
          role: 'STAFF',
          permissions: { 'companies.view': scope },
        } as any,
        isAuthenticated: true,
        isInitializing: false,
      });
    };

    it('is not offered to an OWN-scoped viewer, who has nothing to narrow', () => {
      signInWithScope('OWN');
      renderComponent();
      expect(screen.queryByLabelText('Filter')).toBeNull();
    });

    it('offers Mine and All to a TEAM-scoped viewer, but not Team itself', () => {
      signInWithScope('TEAM');
      renderComponent();
      const select = screen.getByLabelText('Filter') as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toEqual(['', 'OWN', 'ALL']);
    });

    it('offers Mine, Team and All to an ALL-scoped viewer, and narrows the search on selection', () => {
      signInWithScope('ALL');
      renderComponent();
      const select = screen.getByLabelText('Filter') as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'OWN', 'TEAM', 'ALL']);

      fireEvent.change(select, { target: { value: 'TEAM' } });
      expect(mockFetchClients).toHaveBeenLastCalledWith({ search: '', archived: false, reach: 'TEAM' });
    });
  });

  describe('the needs-completion filter (FR-CMP-08)', () => {
    it('sends needsCompletion=true when toggled on, and Clear resets it', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

      fireEvent.click(screen.getByText('Needs completion'));
      expect(mockFetchClients).toHaveBeenLastCalledWith(
        expect.objectContaining({ needsCompletion: true })
      );

      fireEvent.click(screen.getByText('Clear filters'));
      expect(mockFetchClients).toHaveBeenLastCalledWith(
        expect.objectContaining({ needsCompletion: undefined })
      );
    });

    it('shows an incomplete badge for a company missing a profile field or a contact', () => {
      vi.mocked(useClientsModule.useClients).mockReturnValue({
        clients: [
          {
            id: 'c1',
            tenantId: 'tenant-1',
            name: 'Incomplete Co',
            contactInfo: {},
            status: 'CLIENT',
            assignedUserId: 'u1',
            customFieldValues: {},
            lastUpdatedByUserId: 'u1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'c2',
            tenantId: 'tenant-1',
            name: 'Complete Co',
            contactInfo: {},
            status: 'CLIENT',
            assignedUserId: 'u1',
            customFieldValues: {},
            lastUpdatedByUserId: 'u1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            profile: {
              businessTypeId: 'bt1',
              employeeCount: 5,
              areaId: 'a1',
              cityId: 'c1',
              streetAddress: null,
              taxId: null,
              website: null,
              businessType: { id: 'bt1', nameSq: 'Kafene', nameEn: 'Cafe' },
              riskLevel: null,
              area: { id: 'a1', nameSq: 'Tiranë', nameEn: null },
              city: { id: 'c1', nameSq: 'Tiranë', nameEn: null },
            },
            primaryContact: { id: 'ct1', name: 'Owner', isPrimary: true, createdAt: '', updatedAt: '' },
          },
        ],
        total: 2,
        isLoading: false,
        error: null,
        fetchClients: mockFetchClients,
      });

      renderComponent();
      expect(screen.getByText('Incomplete Co')).toBeInTheDocument();
      expect(screen.getByText('Complete Co')).toBeInTheDocument();
      expect(screen.getAllByText('Incomplete')).toHaveLength(1);
    });
  });

});
// @ts-nocheck
