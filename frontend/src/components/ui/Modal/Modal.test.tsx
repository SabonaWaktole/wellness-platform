import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal';

describe('SUP-10 Modal tour id', () => {
  it('SUP-10 puts the id and the layer marker on the dialog root, so the tour scopes to it', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Add a client" tourId="clients.list.addDialog">
        <p>{'Body'}</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-tour', 'clients.list.addDialog');
    expect(dialog).toHaveAttribute('data-tour-layer');
  });

  it('SUP-05 adds neither attribute when the prop is omitted', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Add a client">
        <p>{'Body'}</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-tour');
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-tour-layer');
  });
});
