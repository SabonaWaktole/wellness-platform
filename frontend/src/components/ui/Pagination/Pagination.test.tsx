import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pagination } from './Pagination';

describe('SUP-05 Pagination tour id', () => {
  it('SUP-05 puts the id on the navigation landmark', () => {
    render(<Pagination page={1} pageSize={20} total={84} onPageChange={() => {}} tourId="clients.list.pagination" />);
    expect(screen.getByRole('navigation')).toHaveAttribute('data-tour', 'clients.list.pagination');
  });

  it('SUP-05 adds no attribute when the prop is omitted', () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={84} onPageChange={() => {}} />);
    expect(container.querySelector('[data-tour]')).toBeNull();
  });
});
