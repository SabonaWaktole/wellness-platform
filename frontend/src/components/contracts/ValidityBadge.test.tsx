import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ValidityBadge } from './ValidityBadge';
import type { ValidityBadgeData } from '../../types/contract';

const badge = (over: Partial<ValidityBadgeData>): ValidityBadgeData => ({
  status: 'VALID',
  reason: null,
  startsOn: '2027-03-01',
  endsOn: '2028-02-29',
  daysLeft: 200,
  ...over,
});

describe('ValidityBadge (FR-CON-21)', () => {
  it('says "Valid until" with the end date, in words rather than colour alone', () => {
    render(<ValidityBadge validity={badge({})} />);
    expect(screen.getByTestId('validity-badge').textContent).toMatch(/^Valid until .*2028/);
  });

  it('says "Expiring soon" for a contract inside the window', () => {
    render(<ValidityBadge validity={badge({ status: 'EXPIRING_SOON' })} />);
    expect(screen.getByTestId('validity-badge').textContent).toMatch(/^Expiring soon/);
  });

  it('gives the reason when not valid: a status word, "Not started", or no contract', () => {
    const { rerender } = render(<ValidityBadge validity={badge({ status: 'NOT_VALID', reason: 'SUSPENDED' })} />);
    expect(screen.getByTestId('validity-badge').textContent).toBe('Not valid: Suspended');

    rerender(<ValidityBadge validity={badge({ status: 'NOT_VALID', reason: 'NOT_STARTED' })} />);
    expect(screen.getByTestId('validity-badge').textContent).toBe('Not valid: Not started');

    rerender(<ValidityBadge validity={badge({ status: 'NOT_VALID', reason: 'NO_CONTRACT', startsOn: null, endsOn: null })} />);
    expect(screen.getByTestId('validity-badge').textContent).toBe('Not valid: No contract');
  });
});
