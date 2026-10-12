import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

const tabs = [
  { id: 'tiers', label: 'Tiers' },
  { id: 'rules', label: 'Rules' },
];

describe('SUP-05 Tabs tour ids', () => {
  it('SUP-05 puts the id on the tab list and a derived id on every tab', () => {
    render(<Tabs tabs={tabs} activeId="tiers" onChange={() => {}} tourId="settings.wellnessPlus.tabs" />);
    expect(screen.getByRole('tablist')).toHaveAttribute('data-tour', 'settings.wellnessPlus.tabs');
    expect(screen.getByRole('tab', { name: 'Tiers' })).toHaveAttribute('data-tour', 'settings.wellnessPlus.tabs.tab.tiers');
    expect(screen.getByRole('tab', { name: 'Rules' })).toHaveAttribute('data-tour', 'settings.wellnessPlus.tabs.tab.rules');
  });

  it('SUP-05 leaves the existing tab and panel ids alone', () => {
    render(<Tabs idBase="pricing" tabs={tabs} activeId="tiers" onChange={() => {}} tourId="settings.pricing.tabs" />);
    expect(screen.getByRole('tab', { name: 'Tiers' })).toHaveAttribute('id', 'pricing-tab-tiers');
    expect(screen.getByRole('tab', { name: 'Tiers' })).toHaveAttribute('aria-controls', 'pricing-panel-tiers');
  });

  it('SUP-05 adds no attribute when the prop is omitted', () => {
    const { container } = render(<Tabs tabs={tabs} activeId="tiers" onChange={() => {}} />);
    expect(container.querySelector('[data-tour]')).toBeNull();
  });
});
