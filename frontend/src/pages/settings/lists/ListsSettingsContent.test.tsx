import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ListsSettingsContent } from './ListsSettingsContent';
import { useLookupList } from '../../../hooks/useLookupList';
import { lookupErrorMessage } from './lookupErrorMessage';
import i18n from '../../../i18n';

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

const lists = {
  'risk-levels': { items: RISK_LEVELS, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
  'business-types': { items: BUSINESS_TYPES, fetchItems: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
};

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
