
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ClientDetailContent } from './ClientDetailContent';
import * as clientsHooks from '../../hooks/useClients';
import { useAuthStore } from '../../store/useAuthStore';
import * as apptHooks from '../../hooks/useAppointments';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useParams: () => ({ clientId: 'client-1' }),
  useNavigate: () => vi.fn(),
  // The page reads `?logInteraction` to auto-open the interaction slide-over.
  // These tests render outside a router, so an empty param set is enough.
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ state: null }),
}));

vi.mock('../../hooks/useClients', () => ({
  useClientDetail: vi.fn(),
  useClientHistory: vi.fn(),
  useClientSettings: vi.fn(),
  useAddInteraction: vi.fn()
}));

vi.mock('../../hooks/useAppointments', () => ({
  useClientAppointments: vi.fn()
}));

// Mock heavy child components
vi.mock('../../components/ui/SlideOver', () => ({
  SlideOver: () => <div data-testid="slide-over" />
}));
vi.mock('../../components/panels/AppointmentDetailPanel/AppointmentDetailPanel', () => ({
  AppointmentDetailPanel: () => <div data-testid="appointment-panel" />
}));
vi.mock('../../components/forms/AppointmentForm/AppointmentForm', () => ({
  AppointmentForm: () => <div data-testid="appointment-form" />
}));

describe('ClientDetailContent Timeline', () => {
  beforeEach(() => {
    vi.mocked(clientsHooks.useClientSettings).mockReturnValue({
      customFields: [],
      outcomeCategories: [],
      isLoading: false,
      error: null,
      fetchSettings: vi.fn() as any
    });
    
    vi.mocked(clientsHooks.useAddInteraction).mockReturnValue({
      addInteraction: vi.fn(),
      isLoading: false,
      error: null
    });
    
    vi.mocked(apptHooks.useClientAppointments).mockReturnValue({
      appointments: [],
      total: 0,
      isLoading: false,
      error: null,
      updateAppointmentLocally: vi.fn(),
      fetchClientAppointments: vi.fn() as any
    });
  });

  it('FR-CMP-05 renders APPOINTMENT_COMPLETED with its translated status', () => {
    const mockClient = { id: 'client-1', name: 'Test Client', status: 'ACTIVE', contactInfo: {} };
    
    vi.mocked(clientsHooks.useClientDetail).mockReturnValue({
      client: mockClient,
      isLoading: false,
      fetchClient: vi.fn()
    } as any);
    
    vi.mocked(clientsHooks.useClientHistory).mockReturnValue({
      history: {
        nextCursor: null,
        timeline: [
          {
            id: 'appointment:COMPLETED',
            category: 'ACTIVITY',
            type: 'APPOINTMENT_COMPLETED',
            timestamp: new Date().toISOString(),
            actor: null,
            details: { status: 'COMPLETED' }
          }
        ]
      },
      isLoading: false,
      types: [], setTypes: vi.fn(), isLoadingMore: false, error: null, loadMore: vi.fn(), fetchHistory: vi.fn()
    } as any);

    render(<ClientDetailContent />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });
  
  it('FR-CMP-05 renders APPOINTMENT_CANCELLED with its translated status', () => {
    const mockClient = { id: 'client-1', name: 'Test Client', status: 'ACTIVE', contactInfo: {} };
    
    vi.mocked(clientsHooks.useClientDetail).mockReturnValue({
      client: mockClient,
      isLoading: false,
      fetchClient: vi.fn()
    } as any);
    
    vi.mocked(clientsHooks.useClientHistory).mockReturnValue({
      history: {
        nextCursor: null,
        timeline: [
          {
            id: 'appointment:CANCELLED',
            category: 'ACTIVITY',
            type: 'APPOINTMENT_CANCELLED',
            timestamp: new Date().toISOString(),
            actor: null,
            details: { status: 'CANCELLED' }
          }
        ]
      },
      isLoading: false,
      types: [], setTypes: vi.fn(), isLoadingMore: false, error: null, loadMore: vi.fn(), fetchHistory: vi.fn()
    } as any);

    render(<ClientDetailContent />);

    // Assert that the explicit status label renders
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  // BOOLEAN custom fields are stored as real JSON booleans. Rendering them with
  // `{value || '-'}` was wrong in both directions: React renders a bare `true`
  // as nothing, and `false` is falsy so it fell through to the "not set" dash.
  describe('BOOLEAN custom field display', () => {
    const renderWithCustomField = (value: unknown) => {
      vi.mocked(clientsHooks.useClientSettings).mockReturnValue({
        customFields: [{ id: 'cf-1', fieldName: 'isVip', fieldType: 'BOOLEAN', isRequired: false }],
        outcomeCategories: [],
        isLoading: false,
        fetchSettings: vi.fn(),
      } as any);

      vi.mocked(clientsHooks.useClientDetail).mockReturnValue({
        client: {
          id: 'client-1',
          name: 'Test Client',
          status: 'ACTIVE',
          contactInfo: {},
          customFieldValues: { isVip: value },
        },
        isLoading: false,
        fetchClient: vi.fn(),
      } as any);

      vi.mocked(clientsHooks.useClientHistory).mockReturnValue({
        history: { timeline: [] },
        isLoading: false,
        types: [], setTypes: vi.fn(), isLoadingMore: false, error: null, loadMore: vi.fn(), fetchHistory: vi.fn(),
      } as any);

      render(<ClientDetailContent />);
    };

    it('renders a true boolean as "Yes" rather than blank', () => {
      renderWithCustomField(true);
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders a false boolean as "No", distinct from the not-set dash', () => {
      renderWithCustomField(false);
      expect(screen.getByText('No')).toBeInTheDocument();
      // The decisive assertion: "off" must not be indistinguishable from "never set".
      expect(screen.queryByText('-')).toBeNull();
    });

    it('still renders the dash when the field has never been set', () => {
      renderWithCustomField(undefined);
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });
});

// FR-RBAC-03, 07 (UAT-3 step 3): once the Administrator removes contract
// validity from a role, its holders stop seeing the Contracts tab rather than
// a tab that fails to load.
describe('ClientDetailContent Contracts tab', () => {
  const renderAs = (permissions: Record<string, string | true>) => {
    useAuthStore.setState({ user: { userId: 'me', email: 'me@example.com', role: 'STAFF', tenantId: 't1', permissions } } as any);
    vi.mocked(clientsHooks.useClientSettings).mockReturnValue({ customFields: [], outcomeCategories: [], isLoading: false, fetchSettings: vi.fn() } as any);
    vi.mocked(clientsHooks.useAddInteraction).mockReturnValue({ addInteraction: vi.fn(), isLoading: false, error: null });
    vi.mocked(apptHooks.useClientAppointments).mockReturnValue({
      appointments: [], total: 0, isLoading: false, error: null, updateAppointmentLocally: vi.fn(), fetchClientAppointments: vi.fn() as any,
    });
    vi.mocked(clientsHooks.useClientDetail).mockReturnValue({
      client: { id: 'client-1', name: 'Test Client', status: 'ACTIVE', contactInfo: {} }, isLoading: false, fetchClient: vi.fn(),
    } as any);
    vi.mocked(clientsHooks.useClientHistory).mockReturnValue({ history: { timeline: [] }, isLoading: false, types: [], setTypes: vi.fn(), isLoadingMore: false, error: null, loadMore: vi.fn(), fetchHistory: vi.fn() } as any);
    render(<ClientDetailContent />);
  };

  it('shows the Contracts tab to a role that can see contract validity', () => {
    renderAs({ 'companies.view': 'ALL', 'contracts.validity.view': 'ALL' });
    expect(screen.getByRole('tab', { name: /Contracts/ })).toBeInTheDocument();
  });

  it('FR-RBAC-07 hides it from a role without contracts.validity.view', () => {
    renderAs({ 'companies.view': 'ALL' });
    expect(screen.queryByRole('tab', { name: /Contracts/ })).not.toBeInTheDocument();
  });
  it('FR-DEAL-01 shows the Deals tab to a role that can see deals', () => {
    renderAs({ 'companies.view': 'OWN', 'deals.view': 'OWN' });
    expect(screen.getByRole('tab', { name: /Deals/ })).toBeInTheDocument();
  });

  it('FR-DEAL-04 hides the Deals tab from Reception, which holds no deals key', () => {
    renderAs({ 'companies.view': 'ALL', 'contracts.validity.view': 'ALL' });
    expect(screen.queryByRole('tab', { name: /Deals/ })).not.toBeInTheDocument();
  });
});
