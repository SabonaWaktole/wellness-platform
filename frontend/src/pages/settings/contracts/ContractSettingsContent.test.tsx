import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContractSettingsContent } from './ContractSettingsContent';
import { contractSettingsService } from '../../../services/contractSettingsService';

vi.mock('../../../services/contractSettingsService', () => ({
  contractSettingsService: { get: vi.fn(), update: vi.fn() },
}));

const DEFAULTS = { reminderLeadDays: [60, 30, 7], expiringSoonDays: 30, paymentGraceDays: 0, numberPrefix: 'CTR' };

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/acme/settings/contracts']}>
      <Routes>
        <Route path="/:tenantSlug/settings/contracts" element={<ContractSettingsContent />} />
      </Routes>
    </MemoryRouter>
  );

describe('ContractSettingsContent (M3 Slice 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contractSettingsService.get).mockResolvedValue(DEFAULTS);
  });

  it('FR-REN-01 shows the four settings with their current values', async () => {
    renderAt();
    expect(await screen.findByLabelText(/Renewal reminders|Kujtesat e rinovimit/)).toHaveValue('60, 30, 7');
    expect(screen.getByLabelText(/Expiring soon window|Dritarja/)).toHaveValue('30');
    expect(screen.getByLabelText(/grace days|shtyrjes/)).toHaveValue('0');
    expect(screen.getByLabelText(/prefix|Parashtesa/)).toHaveValue('CTR');
  });

  it('FR-REN-01 saves 90 and 30 as numbers and shows the stored order', async () => {
    vi.mocked(contractSettingsService.update).mockResolvedValue({ ...DEFAULTS, reminderLeadDays: [90, 30] });
    renderAt();
    const leads = await screen.findByLabelText(/Renewal reminders|Kujtesat e rinovimit/);
    fireEvent.change(leads, { target: { value: '30, 90' } });
    fireEvent.click(screen.getByRole('button', { name: /Save|Ruaj/ }));

    await waitFor(() =>
      expect(contractSettingsService.update).toHaveBeenCalledWith('acme', { ...DEFAULTS, reminderLeadDays: [30, 90] })
    );
    await waitFor(() => expect(leads).toHaveValue('90, 30'));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('FR-CON-05 upper-cases the prefix as it is typed', async () => {
    renderAt();
    const prefix = await screen.findByLabelText(/prefix|Parashtesa/);
    fireEvent.change(prefix, { target: { value: 'wa' } });
    expect(prefix).toHaveValue('WA');
  });

  it('shows the server refusal against the field it names, and keeps the draft', async () => {
    vi.mocked(contractSettingsService.update).mockRejectedValue({ response: { data: { field: 'paymentGraceDays', code: 'INVALID_CONTRACT_SETTINGS' } } });
    renderAt();
    const grace = await screen.findByLabelText(/grace days|shtyrjes/);
    fireEvent.change(grace, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: /Save|Ruaj/ }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(grace).toHaveAttribute('aria-invalid', 'true');
    expect(grace).toHaveValue('45');
  });

  it('keeps Save disabled until something changes', async () => {
    renderAt();
    await screen.findByLabelText(/Expiring soon window|Dritarja/);
    expect(screen.getByRole('button', { name: /Save|Ruaj/ })).toBeDisabled();
  });
});
