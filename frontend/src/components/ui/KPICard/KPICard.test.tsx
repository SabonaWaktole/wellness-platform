import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KPICard } from './KPICard';

describe('SUP-05 KPICard tour id', () => {
  it('SUP-05 puts the id on the card root', () => {
    const { container } = render(<KPICard title="Won" value={12} icon={null} tourId="dashboard.ceo.won" />);
    expect(container.firstElementChild).toHaveAttribute('data-tour', 'dashboard.ceo.won');
  });

  it('SUP-05 adds no attribute when the prop is omitted', () => {
    const { container } = render(<KPICard title="Won" value={12} icon={null} />);
    expect(container.querySelector('[data-tour]')).toBeNull();
  });
});
