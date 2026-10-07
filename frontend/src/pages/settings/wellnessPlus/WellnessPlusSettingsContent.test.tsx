import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WellnessPlusSettingsContent } from './WellnessPlusSettingsContent';
import { membershipSettingsService, type BenefitTable, type TierSetting } from '../../../services/membershipSettingsService';
import { useAuthStore } from '../../../store/useAuthStore';

vi.mock('../../../services/membershipSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/membershipSettingsService')>();
  return {
    ...actual,
    membershipSettingsService: {
      getSettings: vi.fn(),
      updateRules: vi.fn(),
      updateTier: vi.fn(),
      listRelationships: vi.fn(),
      createRelationship: vi.fn(),
      updateRelationship: vi.fn(),
      getBenefits: vi.fn(),
      createBenefit: vi.fn(),
      updateBenefit: vi.fn(),
    },
  };
});

const service = vi.mocked(membershipSettingsService);

const TIERS: TierSetting[] = [
  { tier: 'BRONZE', labelSq: 'Bronz', labelEn: 'Bronze', colour: '#B26A2B', fee: null, termMonths: null },
  { tier: 'SILVER', labelSq: 'Argjend', labelEn: 'Silver', colour: '#8A939B', fee: '60.00', termMonths: 12 },
  { tier: 'GOLD', labelSq: 'Ar', labelEn: 'Gold', colour: '#C9A227', fee: '100.00', termMonths: 12 },
  { tier: 'VIP', labelSq: 'VIP', labelEn: 'VIP', colour: '#5B3FA6', fee: null, termMonths: 12 },
];
const RULES = { familyDiscountPercent: '50.00', graceDays: 0, expiringSoonDays: 30, memberPrefix: 'WP', receiptPrefix: 'RCP', vipReviewNoticeDays: 30 };
const TABLE: BenefitTable = {
  tiers: TIERS.map(({ tier, labelSq, labelEn, colour }) => ({ tier, labelSq, labelEn, colour })),
  services: [
    { id: 's1', nameSq: 'Seanca fizioterapie', nameEn: 'Physiotherapy sessions', order: 1, active: true, discounts: { BRONZE: '10.00', SILVER: '20.00', GOLD: '30.00', VIP: '30.00' } },
    { id: 's2', nameSq: 'Analiza laboratorike', nameEn: 'Laboratory tests', order: 2, active: true, discounts: { BRONZE: null, SILVER: '15.00', GOLD: null, VIP: null } },
  ],
};

const renderAt = (path = '/acme/settings/wellness-plus') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:tenantSlug/settings/wellness-plus/:tab?" element={<WellnessPlusSettingsContent />} />
      </Routes>
    </MemoryRouter>
  );

const signInWith = (...keys: string[]) =>
  useAuthStore.setState({ user: { permissions: Object.fromEntries(keys.map((k) => [k, 'ALL'])) } as never });

describe('Settings → Wellness+ (M4 Slice 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getSettings.mockResolvedValue({ settings: RULES, tiers: TIERS });
    service.getBenefits.mockResolvedValue(TABLE);
    service.listRelationships.mockResolvedValue([
      { id: 'r1', nameSq: 'Fëmijë', nameEn: 'Child', order: 1, active: true },
      { id: 'r2', nameSq: 'Prind', nameEn: 'Parent', order: 2, active: false },
    ]);
  });
  afterEach(() => useAuthStore.setState({ user: null }));

  describe('the Administrator', () => {
    beforeEach(() => signInWith('wellnessplus.settings.manage'));

    it('FR-TIR-01 shows the four tiers; only Silver and Gold have a fee, Bronze has no term', async () => {
      renderAt();
      const gold = await screen.findByRole('region', { name: 'Gold' });
      expect(within(gold).getByLabelText('Fee (EUR)')).toHaveValue('100.00');
      expect(within(screen.getByRole('region', { name: 'Bronze' })).queryByLabelText('Fee (EUR)')).toBeNull();
      expect(within(screen.getByRole('region', { name: 'Bronze' })).queryByLabelText('Term (months)')).toBeNull();
      expect(within(screen.getByRole('region', { name: 'VIP' })).queryByLabelText('Fee (EUR)')).toBeNull();
      expect(within(screen.getByRole('region', { name: 'VIP' })).getByLabelText('Term (months)')).toHaveValue('12');
    });

    it('FR-TIR-01 saves the Gold fee as typed and lets the server judge it', async () => {
      service.updateTier.mockResolvedValue({ ...TIERS[2], fee: '110.00' });
      renderAt();
      const gold = await screen.findByRole('region', { name: 'Gold' });
      fireEvent.change(within(gold).getByLabelText('Fee (EUR)'), { target: { value: '110' } });
      fireEvent.click(within(gold).getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(service.updateTier).toHaveBeenCalledWith('acme', 'GOLD', { labelSq: 'Ar', labelEn: 'Gold', colour: '#C9A227', fee: '110', termMonths: 12 })
      );
      await waitFor(() => expect(within(gold).getByLabelText('Fee (EUR)')).toHaveValue('110.00'));
      expect(within(gold).getByRole('status')).toBeInTheDocument();
    });

    it('FR-TIR-01 shows the server refusal against the field it names and keeps the draft', async () => {
      service.updateTier.mockRejectedValue({ response: { data: { field: 'fee' } } });
      renderAt();
      const silver = await screen.findByRole('region', { name: 'Silver' });
      const fee = within(silver).getByLabelText('Fee (EUR)');
      fireEvent.change(fee, { target: { value: '0' } });
      fireEvent.click(within(silver).getByRole('button', { name: 'Save' }));
      expect(await within(silver).findByRole('alert')).toBeInTheDocument();
      expect(fee).toHaveAttribute('aria-invalid', 'true');
      expect(fee).toHaveValue('0');
    });

    it('FR-TIR-05, FR-FAM-04, FR-MEM-03 the rules tab sends numbers and upper-cased prefixes', async () => {
      service.updateRules.mockResolvedValue({ ...RULES, graceDays: 14, memberPrefix: 'WA' });
      renderAt('/acme/settings/wellness-plus/rules');
      fireEvent.change(await screen.findByLabelText('Grace days'), { target: { value: '14' } });
      fireEvent.change(screen.getByLabelText('Member number prefix'), { target: { value: 'wa' } });
      expect(screen.getByLabelText('Member number prefix')).toHaveValue('WA');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(service.updateRules).toHaveBeenCalledWith('acme', {
          familyDiscountPercent: '50.00', graceDays: 14, expiringSoonDays: 30, vipReviewNoticeDays: 30, memberPrefix: 'WA', receiptPrefix: 'RCP',
        })
      );
    });

    it('keeps Save disabled until something changes', async () => {
      renderAt('/acme/settings/wellness-plus/rules');
      await screen.findByLabelText('Grace days');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('FR-FAM-02 lists relationships, and a deactivated one can be reactivated', async () => {
      service.updateRelationship.mockResolvedValue({ id: 'r2', nameSq: 'Prind', nameEn: 'Parent', order: 2, active: true });
      renderAt('/acme/settings/wellness-plus/relationships');
      expect(await screen.findByText('Child')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
      await waitFor(() => expect(service.updateRelationship).toHaveBeenCalledWith('acme', 'r2', { active: true }));
    });

    it('FR-FAM-02 adds a relationship with both names', async () => {
      service.createRelationship.mockResolvedValue({ id: 'r3', nameSq: 'Vëlla', nameEn: 'Sibling', order: 3, active: true });
      renderAt('/acme/settings/wellness-plus/relationships');
      await screen.findByText('Child');
      expect(screen.getByRole('button', { name: 'Add relationship' })).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Name (Albanian)'), { target: { value: 'Vëlla' } });
      fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Sibling' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add relationship' }));
      await waitFor(() => expect(service.createRelationship).toHaveBeenCalledWith('acme', { nameSq: 'Vëlla', nameEn: 'Sibling' }));
    });

    it('FR-BEN-01 the benefit grid is editable: changing Gold physiotherapy to 35 saves only that tier', async () => {
      service.updateBenefit.mockResolvedValue({ ...TABLE.services[0], discounts: { ...TABLE.services[0].discounts, GOLD: '35.00' } });
      renderAt('/acme/settings/wellness-plus/benefits');
      const cell = await screen.findByLabelText('Physiotherapy sessions — Gold (%)');
      expect(cell).toHaveValue('30');
      fireEvent.change(cell, { target: { value: '35' } });
      fireEvent.blur(cell);
      await waitFor(() => expect(service.updateBenefit).toHaveBeenCalledWith('acme', 's1', { discounts: { GOLD: '35' } }));
    });

    it('FR-BEN-01 an empty cell clears the discount, and an unchanged cell saves nothing', async () => {
      service.updateBenefit.mockResolvedValue(TABLE.services[1]);
      renderAt('/acme/settings/wellness-plus/benefits');
      const silver = await screen.findByLabelText('Laboratory tests — Silver (%)');
      fireEvent.blur(silver);
      expect(service.updateBenefit).not.toHaveBeenCalled();
      fireEvent.change(silver, { target: { value: '' } });
      fireEvent.blur(silver);
      await waitFor(() => expect(service.updateBenefit).toHaveBeenCalledWith('acme', 's2', { discounts: { SILVER: null } }));
    });

    it('FR-BEN-01 adds a service with both names', async () => {
      service.createBenefit.mockResolvedValue({ id: 's3', nameSq: 'Ultrazë', nameEn: 'Ultrasound', order: 3, active: true, discounts: { BRONZE: null, SILVER: null, GOLD: null, VIP: null } });
      renderAt('/acme/settings/wellness-plus/benefits');
      await screen.findByLabelText('Laboratory tests — Silver (%)');
      fireEvent.change(screen.getByLabelText('Name (Albanian)'), { target: { value: 'Ultrazë' } });
      fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Ultrasound' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add service' }));
      await waitFor(() => expect(service.createBenefit).toHaveBeenCalledWith('acme', { nameSq: 'Ultrazë', nameEn: 'Ultrasound' }));
    });

    it('shows the four tabs', async () => {
      renderAt();
      expect(await screen.findAllByRole('tab')).toHaveLength(4);
    });
  });

  describe('Reception', () => {
    beforeEach(() => signInWith('members.verify'));

    it('FR-BEN-04 opens the benefit table read only: tiers as columns, no input, no button, no tabs, no settings call', async () => {
      renderAt('/acme/settings/wellness-plus/tiers');
      expect(await screen.findByText('Physiotherapy sessions')).toBeInTheDocument();
      for (const tier of ['Bronze', 'Silver', 'Gold', 'VIP']) expect(screen.getByRole('columnheader', { name: tier })).toBeInTheDocument();
      expect(screen.getAllByText('30%')).toHaveLength(2);
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      expect(service.getSettings).not.toHaveBeenCalled();
    });
  });

  it('NFR-I18N-04 every Wellness+ settings string exists in Albanian and English, with no key left only in English', () => {
    const read = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../locales', lang, 'settings.json'), 'utf8'));
    const keys = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
        : [prefix];
    const en = keys(read('en').wellnessPlus);
    const sq = keys(read('sq').wellnessPlus);
    expect(en.length).toBeGreaterThan(40);
    expect(sq.sort()).toEqual(en.sort());
    expect(read('sq').nav.wellnessPlus).toBeTruthy();
    for (const lang of ['en', 'sq']) {
      const catalogue = read(lang).wellnessPlus;
      expect(keys(catalogue).every((k) => k.length > 0)).toBe(true);
    }
  });
});
