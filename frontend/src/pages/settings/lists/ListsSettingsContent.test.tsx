import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ListsSettingsContent } from './ListsSettingsContent';
import { useLookupList } from '../../../hooks/useLookupList';
import { lookupErrorMessage } from './lookupErrorMessage';
import i18n from '../../../i18n';
import { useAuthStore } from '../../../store/useAuthStore';

vi.mock('../../../hooks/useLookupList');

const RISK_LEVELS = [
  { id: 'rl1', nameSq: 'Niveli 1', nameEn: 'Level 1', level: 1, description: null, order: 1, active: true },
  { id: 'rl2', nameSq: 'Niveli 2', nameEn: 'Level 2', level: 2, description: null, order: 2, active: true },
  { id: 'rl3', nameSq: 'Niveli 3', nameEn: 'Level 3', level: 3, description: null, order: 3, active: false },
];
const BUSINESS_TYPES = [
  { id: 'bt-cafe', nameSq: 'Kafene', nameEn: 'Café', riskLevelId: 'rl1', order: 1, active: true },
  { id: 'bt-mine', nameSq: 'Minierë', nameEn: null, riskLevelId: 'rl3', order: 2, active: false },
];
const AREAS = [
  { id: 'a1', nameSq: 'Tiranë', nameEn: 'Tirana', order: 1, active: true },
  { id: 'a2', nameSq: 'Vlorë', nameEn: 'Vlorë', order: 2, active: true },
];
const CITIES = [
  { id: 'c1', nameSq: 'Tiranë', nameEn: 'Tirana', areaId: 'a1', order: 1, active: true },
  { id: 'c2', nameSq: 'Sarandë', nameEn: 'Saranda', areaId: 'a2', order: 1, active: true },
];
const FOLLOW_UP_INTERVALS = [
  { id: 'f3', nameSq: 'Shpejt', nameEn: 'Soon', days: 3, order: 1, active: true },
  { id: 'f5', nameSq: 'Mesatare', nameEn: 'Medium', days: 5, order: 2, active: true },
];
const ACTIVITY_RESULTS = [
  { id: 'ar1', nameSq: 'U kontaktua – i interesuar', nameEn: 'Reached – interested', order: 1, active: true },
];
const LOST_REASONS = [
  { id: 'lr1', nameSq: 'Shumë e shtrenjtë', nameEn: 'Too expensive', order: 1, active: true },
];

const lists = {
  'risk-levels': { items: RISK_LEVELS, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
  'business-types': { items: BUSINESS_TYPES, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
  areas: { items: AREAS, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
  cities: { items: CITIES, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
  'follow-up-intervals': { items: FOLLOW_UP_INTERVALS, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
  'lost-reasons': { items: LOST_REASONS, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
  'activity-results': { items: ACTIVITY_RESULTS, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
};

const signInWith = (permissions: Record<string, string | true>) =>
  useAuthStore.setState({ user: { userId: 'me', email: 'me@example.com', role: 'STAFF', tenantId: 't1', permissions } } as any);

const Location = () => <p data-testid="location">{useLocation().pathname}</p>;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/:tenantSlug/settings/lists/:list?"
          element={
            <>
              <ListsSettingsContent />
              <Location />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe('ListsSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useLookupList as any).mockImplementation((list: keyof typeof lists) => ({ loading: false, loadFailed: false, ...lists[list] }));
    lists['business-types'].update.mockResolvedValue(undefined);
    signInWith({ 'settings.manage': true, 'activityResults.manage': true });
  });

  it('FR-SET-02 opens on risk levels, showing each level and description', () => {
    renderAt('/acme/settings/lists');

    expect(screen.getByRole('tab', { name: 'Risk levels', selected: true })).toBeDefined();
    const table = screen.getByRole('table', { name: 'Risk levels' });
    // The English name and the level badge.
    expect(within(within(table).getByTestId('lookup-row-rl2')).getAllByText('Level 2')).toHaveLength(2);
    expect(lists['risk-levels'].fetchItems).toHaveBeenCalled();
  });

  it('switches tabs through the URL', () => {
    renderAt('/acme/settings/lists');

    fireEvent.click(screen.getByRole('tab', { name: 'Business types' }));

    expect(screen.getByTestId('location').textContent).toBe('/acme/settings/lists/business-types');
  });

  it('FR-SET-01 shows each business type with its risk level', () => {
    renderAt('/acme/settings/lists/business-types');

    const table = screen.getByRole('table', { name: 'Business types' });
    const cafe = within(table).getByTestId('lookup-row-bt-cafe');
    expect(within(cafe).getByText('Level 1')).toBeDefined();
  });

  it('UAT-3 step 1: moves a business type to another risk level, offering only active ones', async () => {
    renderAt('/acme/settings/lists/business-types');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Café' }));
    const select = screen.getByRole('combobox', { name: 'Risk level' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['rl1', 'rl2']);
    fireEvent.change(select, { target: { value: 'rl2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(lists['business-types'].update).toHaveBeenCalledWith('bt-cafe', { nameSq: 'Kafene', nameEn: 'Café', riskLevelId: 'rl2' })
    );
  });

  it('keeps an inactive business type\'s own inactive risk level selectable, marked as such', () => {
    renderAt('/acme/settings/lists/business-types');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Minierë' }));
    const select = screen.getByRole('combobox', { name: 'Risk level' }) as HTMLSelectElement;

    expect(select.value).toBe('rl3');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Level 1', 'Level 2', 'Level 3 (Inactive)']);
  });

  it('shows labels in Albanian when the interface is Albanian (FR-LNG-03)', async () => {
    await i18n.changeLanguage('sq');
    try {
      renderAt('/acme/settings/lists/business-types');
      const cafe = screen.getByTestId('lookup-row-bt-cafe');
      expect(within(cafe).getByText('Niveli 1')).toBeDefined();
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('FR-SET-04 Cities tab shows the area column, and filters by area', () => {
    renderAt('/acme/settings/lists/cities');

    const table = screen.getByRole('table', { name: 'Cities' });
    // Each name appears twice per row: the English-name cell and the area badge.
    expect(within(within(table).getByTestId('lookup-row-c1')).getAllByText('Tirana')).toHaveLength(2);
    expect(within(within(table).getByTestId('lookup-row-c2')).getByText('Vlorë')).toBeDefined();

    fireEvent.change(screen.getByRole('combobox', { name: 'Area' }), { target: { value: 'a2' } });

    const cityCalls = (useLookupList as any).mock.calls.filter((args: unknown[]) => args[0] === 'cities');
    expect(cityCalls[cityCalls.length - 1][1]).toEqual({ areaId: 'a2' });
  });

  it('FR-SET-04 Areas: offers to cascade-deactivate an area with active cities', async () => {
    const cascadeError = Object.assign(new Error('AREA_HAS_ACTIVE_CITIES'), {
      response: { data: { code: 'AREA_HAS_ACTIVE_CITIES', activeCities: 2 } },
    });
    lists.areas.setActive.mockReset();
    lists.areas.setActive.mockRejectedValueOnce(cascadeError).mockResolvedValueOnce(undefined);

    renderAt('/acme/settings/lists/areas');

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Tirana' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/2 active cities/)).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate both' }));

    await waitFor(() => expect(lists.areas.setActive).toHaveBeenLastCalledWith('a1', false, true));
  });

  it('FR-SET-05 Follow-up intervals tab shows each interval\'s days, and creating one sends days as a number', async () => {
    renderAt('/acme/settings/lists/follow-up-intervals');

    const table = screen.getByRole('table', { name: 'Follow-up intervals' });
    expect(within(within(table).getByTestId('lookup-row-f5')).getByText('5 days')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Albanian name' }), { target: { value: '10 ditë' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Days' }), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(lists['follow-up-intervals'].create).toHaveBeenCalledWith({ nameSq: '10 ditë', nameEn: null, days: 10 }));
  });

  it('FR-SET-06 Lost-deal reasons tab shows labels only', () => {
    renderAt('/acme/settings/lists/lost-reasons');

    const table = screen.getByRole('table', { name: 'Lost-deal reasons' });
    expect(within(table).getByTestId('lookup-row-lr1')).toBeDefined();
  });

  it('FR-ACT-03 Activity results tab shows each result', () => {
    renderAt('/acme/settings/lists/activity-results');

    const table = screen.getByRole('table', { name: 'Activity results' });
    expect(within(table).getByTestId('lookup-row-ar1')).toBeDefined();
  });

  it('FR-ACT-03 with only activityResults.manage, the activity results are the only list shown', () => {
    signInWith({ 'activityResults.manage': true });
    renderAt('/acme/settings/lists/risk-levels');

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Activity results']);
    expect(screen.getByRole('table', { name: 'Activity results' })).toBeDefined();
  });
});

describe('lookupErrorMessage', () => {
  const t = i18n.getFixedT('en', 'settings');
  const refusal = (data: object, status = 409) => ({ response: { status, data } });

  it('explains the list API\'s refusals in the user\'s language', () => {
    expect(lookupErrorMessage(refusal({ code: 'LOOKUP_ITEM_IN_USE' }), t)).toMatch(/in use/);
    expect(lookupErrorMessage(refusal({ code: 'LOOKUP_VALUE_TAKEN', field: 'level' }), t)).toMatch(/already has this level/);
    expect(lookupErrorMessage(refusal({ code: 'LOOKUP_VALUE_TAKEN', field: 'nameSq' }), t)).toMatch(/already has this name/);
    expect(lookupErrorMessage(refusal({ code: 'RISK_LEVEL_STILL_USED', activeBusinessTypes: 2 }), t)).toMatch(/^2 active business types/);
    expect(lookupErrorMessage(refusal({ error: 'Validation failed' }, 400), t)).toMatch(/Albanian name is required/);
    expect(lookupErrorMessage(new Error('network'), t)).toMatch(/Something went wrong/);
  });
});
