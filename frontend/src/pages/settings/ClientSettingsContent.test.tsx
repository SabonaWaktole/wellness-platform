import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClientSettingsContent } from './ClientSettingsContent';
import {
  useClientSettings,
  useDefineCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
  useReorderCustomFields,
} from '../../hooks/useClients';

vi.mock('../../hooks/useClients');

/**
 * The save error from these hooks was captured in state and never rendered, so
 * a rejected submission — notably a field type the backend does not accept —
 * looked to the user like nothing had happened at all.
 */
describe('ClientSettingsContent', () => {
  const mockFetchSettings = vi.fn();
  const mockDefineCustomField = vi.fn();
  const mockUpdateCustomField = vi.fn();
  const mockDeleteCustomField = vi.fn();
  const mockReorderCustomFields = vi.fn();

  const setup = (overrides: { fieldError?: string | null } = {}) => {
    (useClientSettings as any).mockReturnValue({
      customFields: [],
      isLoading: false,
      fetchSettings: mockFetchSettings,
    });
    (useDefineCustomField as any).mockReturnValue({
      defineCustomField: mockDefineCustomField,
      isLoading: false,
      error: overrides.fieldError ?? null,
    });
    // These three were added to the component later; without them the whole
    // suite failed on a destructure of undefined before rendering anything.
    (useUpdateCustomField as any).mockReturnValue({
      updateCustomField: mockUpdateCustomField,
      isLoading: false,
      error: null,
    });
    (useDeleteCustomField as any).mockReturnValue({
      deleteCustomField: mockDeleteCustomField,
      isLoading: false,
      error: null,
    });
    (useReorderCustomFields as any).mockReturnValue({
      reorderCustomFields: mockReorderCustomFields,
      isLoading: false,
      error: null,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/tenant-1/settings/clients']}>
        <ClientSettingsContent />
      </MemoryRouter>
    );

  const openSlideOver = () => {
    // The add button opens the slide-over containing the form and its error.
    const addButton = screen.getAllByRole('button').find((b) => /add/i.test(b.textContent ?? ''));
    expect(addButton).toBeDefined();
    fireEvent.click(addButton!);
  };

  it('renders the custom field save error where the user can see it', () => {
    setup({ fieldError: 'fieldType: Invalid enum value. Expected TEXT | NUMBER | DATE | BOOLEAN' });
    renderPage();

    openSlideOver();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Invalid enum value');
  });

  it('shows no error region when there is no error', () => {
    renderPage();

    openSlideOver();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers BOOLEAN as a selectable field type', () => {
    renderPage();

    openSlideOver();

    const option = screen.getByRole('option', { name: 'Boolean' }) as HTMLOptionElement;
    // Guards the mismatch this fix closed: the dropdown offered BOOLEAN while
    // the backend enum rejected it.
    expect(option.value).toBe('BOOLEAN');
  });

  it('offers the alphanumeric type', () => {
    renderPage();

    openSlideOver();

    const option = screen.getByRole('option', { name: 'Alphanumeric' }) as HTMLOptionElement;
    expect(option.value).toBe('ALPHANUMERIC');
  });

  it('offers only field types the backend accepts', () => {
    renderPage();

    openSlideOver();

    // Mirrors backend src/clients/domain/enums/FieldType.ts.
    const accepted = [
      'TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'ALPHANUMERIC',
      'SINGLE_SELECT', 'MULTI_SELECT', 'EMAIL', 'USER_REFERENCE',
    ];
    // Scoped to the Field Type select: the slide-over also carries a Role
    // dropdown, whose options are FieldRoles and not field types at all.
    const typeSelect = screen.getByLabelText(/Field Type/i);
    const values = Array.from(typeSelect.querySelectorAll('option'))
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);

    for (const value of values) {
      expect(accepted).toContain(value);
    }
  });

  it('offers MULTI_SELECT as a selectable field type', () => {
    renderPage();
    openSlideOver();

    const typeSelect = screen.getByLabelText(/Field Type/i);
    const values = Array.from(typeSelect.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value
    );

    expect(values).toContain('MULTI_SELECT');
  });
});
