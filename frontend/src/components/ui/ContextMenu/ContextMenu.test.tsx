import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';

/*
 * Why this exists rather than reusing `DropdownMenu`: that component positions
 * itself from a TRIGGER element's bounding box and has no trigger-less mode, no
 * separators, and no menu roles or keyboard navigation. A right-click menu has
 * no trigger at all — it opens at a point — and Cut/Copy/Paste without dividers
 * between the groups is not a context menu, it is a list.
 */

const items = (over: Partial<ContextMenuItem>[] = []): ContextMenuItem[] => [
  { id: 'cut', label: 'Cut', onClick: vi.fn(), ...over[0] },
  { id: 'sep', kind: 'separator' },
  { id: 'delete', label: 'Delete', onClick: vi.fn(), danger: true, ...over[1] },
];

describe('ContextMenu', () => {
  it('opens at the point it was given', () => {
    render(<ContextMenu x={120} y={80} items={items()} onClose={vi.fn()} />);
    const menu = screen.getByRole('menu');

    expect(menu).toHaveStyle({ left: '120px', top: '80px' });
  });

  it('renders a separator as a separator, not as another command', () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={vi.fn()} />);

    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('runs an item and closes', () => {
    const onClose = vi.fn();
    const onClick = vi.fn();
    render(<ContextMenu x={10} y={10} items={items([{ onClick }])} onClose={onClose} />);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Cut' }));
    expect(onClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does not run a disabled item', () => {
    const onClick = vi.fn();
    render(<ContextMenu x={10} y={10} items={items([{ onClick, disabled: true }])} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Cut' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={10} y={10} items={items()} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a pointer press outside it', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={10} y={10} items={items()} onClose={onClose} />);

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  /* A menu you cannot drive from the keyboard is not reachable at all. */
  it('moves focus between commands with the arrow keys, skipping separators', () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={vi.fn()} />);
    const [cut, del] = screen.getAllByRole('menuitem');

    expect(cut).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(del).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(cut).toHaveFocus();
  });

  it('shows a shortcut hint beside the command it belongs to', () => {
    render(
      <ContextMenu
        x={10}
        y={10}
        items={[{ id: 'cut', label: 'Cut', shortcut: 'Ctrl+X', onClick: vi.fn() }]}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('menuitem', { name: /cut/i })).toHaveTextContent('Ctrl+X');
  });
});
