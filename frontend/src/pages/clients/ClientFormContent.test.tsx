// @ts-nocheck
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ClientFormContent } from './ClientFormContent';
import { emptyPageGeometry } from '../../types/form';
import * as clientsHooks from '../../hooks/useClients';
import * as formHooks from '../../hooks/useClientForm';
import * as teamHooks from '../../hooks/useTeam';
import { useAuthStore } from '../../store/useAuthStore';

const navigate = vi.fn();
/** Edit mode by default; a test sets `clientId: undefined` for the create form. */
let routeParams: Record<string, string | undefined> = { tenantSlug: 'acme', clientId: 'client-1' };

vi.mock('react-router-dom', () => ({
  useParams: () => routeParams,
  useNavigate: () => navigate,
}));

vi.mock('../../hooks/useClients', () => ({
  useCreateClient: vi.fn(),
  useUpdateClient: vi.fn(),
  useClientDetail: vi.fn(),
  useContactPersons: vi.fn(() => ({
    addContact: vi.fn(),
    updateContact: vi.fn(),
    removeContact: vi.fn(),
    setPrimaryContact: vi.fn(),
    isLoading: false,
    error: null,
  })),
}));
vi.mock('../../hooks/useClientForm', () => ({ useClientForm: vi.fn() }));
vi.mock('../../hooks/useTeam', () => ({ useTeam: vi.fn() }));

const definition = (id, fieldName) => ({
  id,
  tenantId: 't1',
  fieldName,
  fieldType: 'TEXT',
  order: 0,
  role: null,
  required: false,
});

/**
 * A NARROW form — it places only "Company Name". The stored client also has
 * "VAT Number", set through a wider form.
 */
const narrowForm = {
  id: 'cf1',
  name: 'Quick Lead',
  description: null,
  isDefault: true,
  status: 'PUBLISHED',
  version: 1,
  updatedAt: '2026-08-30T00:00:00.000Z',
  unplacedFieldIds: [],
  definitions: [definition('f1', 'Company Name')],
  layout: {
    version: 3,
    page: emptyPageGeometry(),
    pages: [
      {
        id: 'p1',
        sections: [
          {
            id: 's1',
            title: 'Company Information',
            x: 0,
            y: 0,
            width: 400,
            height: 200,
            elements: [
              {
                id: 'i1',
                type: 'INPUT',
                x: 0,
                y: 0,
                width: 200,
                height: 60,
                // Bound to the tenant definition, which is what makes this a
                // client-intake field rather than a form-only one.
                field: {
                  key: 'company_name',
                  label: 'Company Name',
                  dataType: 'TEXT',
                  required: false,
                  clientFieldId: 'f1',
                },
              },
            ],
          },
        ],
      },
    ],
  },
};

const updateClient = vi.fn();

describe('ClientFormContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeParams = { tenantSlug: 'acme', clientId: 'client-1' };
    useAuthStore.setState({ user: null, isAuthenticated: false });
    vi.mocked(clientsHooks.useCreateClient).mockReturnValue({
      createClient: vi.fn(),
      isLoading: false,
      error: null,
    });
    vi.mocked(clientsHooks.useUpdateClient).mockReturnValue({
      updateClient,
      isLoading: false,
      error: null,
    });
    vi.mocked(clientsHooks.useClientDetail).mockReturnValue({
      client: {
        id: 'client-1',
        customFieldValues: { 'Company Name': 'WorkMed', 'VAT Number': 'AL12345' },
        notes: '',
      },
      fetchClient: vi.fn(),
    });
    vi.mocked(formHooks.useClientForm).mockReturnValue({
      form: narrowForm,
      setForm: vi.fn(),
      isLoading: false,
      error: null,
      fetchForm: vi.fn(),
    });
    vi.mocked(teamHooks.useTeam).mockReturnValue({ staff: [], fetchStaff: vi.fn() });
  });

  describe('FR-DEAL-02 "Create a deal" on the company form', () => {
    const signInWith = (permissions) =>
      useAuthStore.setState({
        user: { userId: 'u1', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions },
        isAuthenticated: true,
      });

    it('FR-DEAL-02 is offered when creating a company, to someone who may create deals', () => {
      routeParams = { tenantSlug: 'acme', clientId: undefined };
      signInWith({ 'companies.edit': 'OWN', 'deals.edit': 'OWN' });
      render(<ClientFormContent />);
      const box = screen.getByRole('checkbox', { name: /Also create a deal/ });
      expect(box).not.toBeChecked();
      fireEvent.click(box);
      expect(box).toBeChecked();
    });

    it('FR-DEAL-02 is not offered without deals.edit, or when editing a company', () => {
      routeParams = { tenantSlug: 'acme', clientId: undefined };
      signInWith({ 'companies.edit': 'OWN' });
      const { unmount } = render(<ClientFormContent />);
      expect(screen.queryByRole('checkbox', { name: /Also create a deal/ })).toBeNull();
      unmount();

      routeParams = { tenantSlug: 'acme', clientId: 'client-1' };
      signInWith({ 'companies.edit': 'OWN', 'deals.edit': 'OWN' });
      render(<ClientFormContent />);
      expect(screen.queryByRole('checkbox', { name: /Also create a deal/ })).toBeNull();
    });
  });

  it('renders the tenant form, not a hardcoded field list', () => {
    render(<ClientFormContent />);
    expect(screen.getByRole('heading', { name: 'Company Information' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Company Name/)).toBeInTheDocument();
  });

  /*
   * THE DATA-LOSS GUARD.
   *
   * The renderer only produces values for the fields THIS form places. Saving
   * those alone would wipe every field the form does not show — invisible until
   * it destroys a record. The page must layer edits over the stored values.
   */
  it('keeps values the form does not render when saving an edit', async () => {
    render(<ClientFormContent />);

    fireEvent.change(screen.getByLabelText(/Company Name/), {
      target: { value: 'WorkMed Ltd' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(updateClient).toHaveBeenCalled());
    const [, payload] = updateClient.mock.calls[0];
    expect(payload.customFieldValues).toEqual({
      'Company Name': 'WorkMed Ltd',
      'VAT Number': 'AL12345',
    });
  });

  it('blocks submit and flags a required field left blank', async () => {
    vi.mocked(formHooks.useClientForm).mockReturnValue({
      form: {
        ...narrowForm,
        definitions: [{ ...definition('f1', 'Company Name'), required: true }],
      },
      setForm: vi.fn(),
      isLoading: false,
      error: null,
      fetchForm: vi.fn(),
    });
    vi.mocked(clientsHooks.useClientDetail).mockReturnValue({
      client: { id: 'client-1', customFieldValues: {}, notes: '' },
      fetchClient: vi.fn(),
    });

    render(<ClientFormContent />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(updateClient).not.toHaveBeenCalled();
  });
});
