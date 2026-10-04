import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotificationSettingsPage } from './NotificationSettingsPage';
import { notificationSettingsService } from '../../services/notificationSettingsService';
import { useAuthStore } from '../../store/useAuthStore';
import { ToastProvider } from '../../components/ui/Toast';

vi.mock('../../services/notificationSettingsService');

const settings = {
  emailEnabled: true,
  emailEventTypes: ['QUOTATION_ACCEPTED'],
  emailRecipientRoles: ['BUSINESS_OWNER' as const],
  appointmentRemindersEnabled: true,
  appointmentReminderLeadMinutes: 1440,
  quotationFollowUpEnabled: true,
  quotationFollowUpDays: 3,
  quotationAutoExpireEnabled: false,
  quotationExpiryDays: 30,
  discountApprovalReminderHours: 24,
  availableEventTypes: ['QUOTATION_ACCEPTED', 'QUOTATION_REJECTED', 'APPOINTMENT_REMINDER'],
  availableRecipientRoles: ['BUSINESS_OWNER' as const, 'STAFF' as const],
  limits: {
    reminderLeadMinutes: { min: 15, max: 20160 },
    followUpDays: { min: 1, max: 90 },
    expiryDays: { min: 1, max: 365 },
    discountApprovalReminderHours: { min: 1, max: 168 },
  },
};

const signIn = (role: 'BUSINESS_OWNER' | 'STAFF') => {
  useAuthStore.setState({
    user: {
      userId: 'u1',
      email: 'someone@example.com',
      role,
      tenantId: 't1',
      tenantSlug: 'acme',
      // settings.manage (D2's BUSINESS_OWNER -> Administrator mapping) is
      // what the page actually gates on now (FR-RBAC-07).
      permissions: role === 'BUSINESS_OWNER' ? { 'settings.manage': true } : {},
    } as any,
    isAuthenticated: true,
  });
};

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/settings/notifications']}>
        <Routes>
          <Route
            path="/:tenantSlug/settings/notifications"
            element={<NotificationSettingsPage />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('NotificationSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (notificationSettingsService.get as any).mockResolvedValue(settings);
    (notificationSettingsService.update as any).mockResolvedValue(settings);
    signIn('BUSINESS_OWNER');
  });

  it('renders the event catalogue served by the API rather than a local list', async () => {
    renderPage();

    // Three checkboxes because the server said three, not because the page
    // hard-codes them — a new server-side type must appear here for free.
    expect(await screen.findByLabelText(/quotation accepted/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quotation rejected/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/appointment reminder/i)).toBeInTheDocument();
  });

  it('reflects which events are currently switched on', async () => {
    renderPage();

    expect(await screen.findByLabelText(/quotation accepted/i)).toBeChecked();
    expect(screen.getByLabelText(/quotation rejected/i)).not.toBeChecked();
  });

  it('saves the whole form, including the toggled event', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText(/quotation rejected/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(notificationSettingsService.update).toHaveBeenCalledWith(
        'acme',
        expect.objectContaining({
          emailEventTypes: ['QUOTATION_ACCEPTED', 'QUOTATION_REJECTED'],
        })
      )
    );
  });

  it('keeps the event selection when email is switched off, so turning it back on restores it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText(/send notification emails/i));

    // Still present and still checked — just disabled.
    const accepted = screen.getByLabelText(/quotation accepted/i);
    expect(accepted).toBeChecked();
    expect(accepted).toBeDisabled();
  });

  it('disables the follow-up window while follow-ups are off', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText(/remind staff about unanswered/i));

    expect(screen.getByLabelText(/days to wait before reminding/i)).toBeDisabled();
  });

  it('FR-DSC-12 the approver reminder wait is editable and saved', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText(/hours before reminding the approver/i);
    expect(input).toHaveValue(24);
    await user.clear(input);
    await user.type(input, '48');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(notificationSettingsService.update).toHaveBeenCalledWith(
        'acme',
        expect.objectContaining({ discountApprovalReminderHours: 48 })
      )
    );
  });

  it('discards edits back to the last saved state', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText(/quotation rejected/i));
    expect(screen.getByLabelText(/quotation rejected/i)).toBeChecked();

    await user.click(screen.getByRole('button', { name: /discard changes/i }));
    expect(screen.getByLabelText(/quotation rejected/i)).not.toBeChecked();
  });

  describe('for staff', () => {
    beforeEach(() => signIn('STAFF'));

    it('shows the policy read-only, because it governs their own inbox', async () => {
      renderPage();

      expect(await screen.findByLabelText(/quotation accepted/i)).toBeDisabled();
      expect(screen.getByLabelText(/send notification emails/i)).toBeDisabled();
    });

    it('offers no way to save', async () => {
      renderPage();

      await screen.findByLabelText(/quotation accepted/i);
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    });
  });
});
