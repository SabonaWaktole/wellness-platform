import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SlideOver } from './SlideOver';

describe('SUP-10 SlideOver tour id', () => {
  it('SUP-10 puts the id and the layer marker on the panel, and leaves its label link alone', () => {
    render(
      <SlideOver isOpen onClose={() => {}} title="Details" tourId="clients.list.detailsPanel">
        <p>{'Body'}</p>
      </SlideOver>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-tour', 'clients.list.detailsPanel');
    expect(dialog).toHaveAttribute('data-tour-layer');
    expect(dialog).toHaveAttribute('aria-labelledby', 'slideover-title');
  });

  it('SUP-05 adds neither attribute when the prop is omitted', () => {
    render(
      <SlideOver isOpen onClose={() => {}} title="Details">
        <p>{'Body'}</p>
      </SlideOver>,
    );
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-tour');
  });
});
