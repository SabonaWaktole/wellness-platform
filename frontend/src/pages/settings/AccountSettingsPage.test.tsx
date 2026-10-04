import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AccountSettingsPage } from './AccountSettingsPage';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../../components/ui/Toast';
import { useTenantSettings } from '../../hooks/useTenantSettings';
import '../../i18n';

vi.mock('../../hooks/useTenantSettings', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useTenantSettings')>(
    '../../hooks/useTenantSettings'
  );
  return {
    ...actual,
    useTenantSettings: vi.fn(),
  };
});

const storedSettings = {
  name: 'Acme',
  requiresQuotationApproval: true,
  currency: 'USD',
  locale: 'en-US' as const,
  timezone: 'UTC',
  dateFormat: 'MM/DD/YYYY' as const,
  defaultLanguage: 'en' as const,
  registrationNumber: null,
  addressLine: null,
  addressCity: null,
  addressState: null,
  addressPostalCode: null,
  contactEmail: null,
  contactPhone: null,
  logoUrl: null,
  coverImageUrl: null,
};

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/settings']}>
        <Routes>
          <Route path="/:tenantSlug/settings" element={<AccountSettingsPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

/**
 * These cover the write-back to the auth store, not the form.
 *
 * The store is what the rest of the app actually reads — useLanguageSync for
 * the interface language, the money formatter for currency and locale. A field
 * the server persists but the page forgets to mirror produces a specific and
 * very confusing bug: the save succeeds, the success toast fires, and the
 * interface does not change until the next sign-in refetches /me. That is what
 * happened to the workspace language, and nothing failed when it did.
 */
describe('AccountSettingsPage write-back to the auth store', () => {
  const updateSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updateSettings.mockResolvedValue({ ...storedSettings, defaultLanguage: 'it' });

    vi.mocked(useTenantSettings).mockReturnValue({
      fetchSettings: vi.fn().mockResolvedValue(storedSettings),
      updateSettings,
      loading: false,
      error: null,
    });

    useAuthStore.setState({
      user: {
        userId: 'u1',
        email: 'owner@example.com',
        role: 'BUSINESS_OWNER',
        tenantId: 't1',
        tenantSlug: 'acme',
        tenantCurrency: 'USD',
        tenantLocale: 'en-US',
        tenantDefaultLanguage: 'en',
        userLanguage: null,
        // settings.manage (D2's BUSINESS_OWNER -> Administrator mapping) is
        // what the page actually gates on now (FR-RBAC-07).
        permissions: { 'settings.manage': true },
      } as any,
      isAuthenticated: true,
    });
  });

  it('mirrors a saved workspace language into the store, so the UI switches without a reload', async () => {
    renderPage();
    await screen.findByDisplayValue('Acme');

    await userEvent.selectOptions(screen.getByLabelText(/Default System Language/i), 'it');
    await userEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalled());

    // The assertion that matters: not that the request was sent, but that what
    // came back reached the store the interface reads.
    await waitFor(() =>
      expect(useAuthStore.getState().user?.tenantDefaultLanguage).toBe('it')
    );
  });

  it('mirrors every localization field the server returns, not just some of them', async () => {
    updateSettings.mockResolvedValue({
      ...storedSettings,
      currency: 'EUR',
      locale: 'it-IT',
      timezone: 'Europe/Rome',
      dateFormat: 'DD/MM/YYYY',
      defaultLanguage: 'it',
    });

    renderPage();
    await screen.findByDisplayValue('Acme');
    await userEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      const user = useAuthStore.getState().user;
      expect(user?.tenantCurrency).toBe('EUR');
      expect(user?.tenantLocale).toBe('it-IT');
      expect(user?.tenantTimezone).toBe('Europe/Rome');
      expect(user?.tenantDateFormat).toBe('DD/MM/YYYY');
      expect(user?.tenantDefaultLanguage).toBe('it');
    });
  });

  it('FR-RBAC-18 the quotation approval switch shows for a legacy workspace and is hidden under the sales process', async () => {
    const { unmount } = renderPage();
    await screen.findByDisplayValue('Acme');
    expect(screen.getByText('Require Approval for Quotations')).toBeInTheDocument();
    unmount();

    useAuthStore.setState((state) => ({ user: { ...state.user!, tenantSalesWorkflow: 'SALES_PROCESS' } }));
    renderPage();
    await screen.findByDisplayValue('Acme');
    expect(screen.queryByText('Require Approval for Quotations')).not.toBeInTheDocument();
  });
});
