import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClientSettingsContent } from './ClientSettingsContent';
import {
  useClientSettings,
  useDefineCustomField,
  useDefineOutcomeCategory,
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
  const mockDefineOutcomeCategory = vi.fn();

  const setup = (overrides: { fieldError?: string | null; outcomeError?: string | null } = {}) => {
    (useClientSettings as any).mockReturnValue({
      customFields: [],
      outcomeCategories: [],
      isLoading: false,
      fetchSettings: mockFetchSettings,
    });
    (useDefineCustomField as any).mockReturnValue({
      defineCustomField: mockDefineCustomField,
      isLoading: false,
      error: overrides.fieldError ?? null,
    });
    (useDefineOutcomeCategory as any).mockReturnValue({
      defineOutcomeCategory: mockDefineOutcomeCategory,
      isLoading: false,
      error: overrides.outcomeError ?? null,
    });
    (useUpdateCustomField as any).mockReturnValue({
      updateCustomField: vi.fn(),
      isLoading: false,
      error: null,
    });
    (useDeleteCustomField as any).mockReturnValue({
      deleteCustomField: vi.fn(),
    });
    (useReorderCustomFields as any).mockReturnValue({
      reorderCustomFields: vi.fn(),
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
    const accepted = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'ALPHANUMERIC', 'SINGLE_SELECT', 'EMAIL', 'USER_REFERENCE'];
    const values = within(screen.getByLabelText('Field Type'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);

    for (const value of values) {
      expect(accepted).toContain(value);
    }
  });
});
