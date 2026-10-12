import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('SUP-10 ConfirmDialog tour id', () => {
  it('SUP-10 forwards the id to the dialog it renders, as a layer', () => {
    render(<ConfirmDialog isOpen onClose={() => {}} onConfirm={() => {}} title="Delete client" message="This cannot be undone." tourId="clients.list.deleteDialog" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-tour', 'clients.list.deleteDialog');
    expect(dialog).toHaveAttribute('data-tour-layer');
  });

  it('SUP-05 adds no attribute when the prop is omitted', () => {
    render(<ConfirmDialog isOpen onClose={() => {}} onConfirm={() => {}} title="Delete client" message="This cannot be undone." />);
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-tour');
  });
});
