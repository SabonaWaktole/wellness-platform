import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextInput } from './TextInput';

describe('SUP-05 TextInput tour id', () => {
  it('SUP-05 marks the container, so the highlight covers the label, the control and the message', () => {
    render(<TextInput label="Name" helperText="As on the ID" tourId="clients.form.name" />);
    const container = screen.getByText('Name').closest('[data-tour]') as HTMLElement;
    expect(container).toHaveAttribute('data-tour', 'clients.form.name');
    expect(container).toContainElement(screen.getByLabelText('Name'));
    expect(container).toContainElement(screen.getByText('As on the ID'));
  });

  it('SUP-05 keeps the id off the <input> itself', () => {
    render(<TextInput label="Name" tourId="clients.form.name" />);
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('data-tour');
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('tourId');
  });

  it('SUP-05 adds no attribute when the prop is omitted', () => {
    const { container } = render(<TextInput label="Name" />);
    expect(container.querySelector('[data-tour]')).toBeNull();
  });
});
