import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropdownMenu } from './DropdownMenu';

const items = [
  { id: 'edit', label: 'Edit', onClick: () => {}, tourId: 'clients.list.rowMenu.edit' },
  { id: 'delete', label: 'Delete', onClick: () => {}, danger: true, tourId: 'clients.list.rowMenu.delete' },
  { id: 'plain', label: 'Plain', onClick: () => {} },
];

describe('SUP-05 DropdownMenu tour ids', () => {
  it('SUP-05 marks each item that has an id, in the portalled menu', () => {
    render(<DropdownMenu trigger={<button type="button">Open</button>} items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute('data-tour', 'clients.list.rowMenu.edit');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('data-tour', 'clients.list.rowMenu.delete');
  });

  it('SUP-05 leaves an item without an id unmarked', () => {
    render(<DropdownMenu trigger={<button type="button">Open</button>} items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menuitem', { name: 'Plain' })).not.toHaveAttribute('data-tour');
  });

  it('SUP-05 marks the menu itself when asked', () => {
    render(<DropdownMenu trigger={<button type="button">Open</button>} items={items} menuTourId="clients.list.rowMenu" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toHaveAttribute('data-tour', 'clients.list.rowMenu');
  });

  it('SUP-05 adds no attribute anywhere when nothing was asked for', () => {
    render(<DropdownMenu trigger={<button type="button">Open</button>} items={[{ id: 'a', label: 'A', onClick: () => {} }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(document.body.querySelector('[data-tour]')).toBeNull();
  });
});
