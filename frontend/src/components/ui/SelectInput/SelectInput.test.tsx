import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SelectInput } from './SelectInput';

describe('SUP-05 SelectInput tour id', () => {
  it('SUP-05 marks the container, which holds the label and the select', () => {
    render(
      <SelectInput label="City" tourId="clients.list.city">
        <option value="a">{'Tirana'}</option>
      </SelectInput>,
    );
    const container = screen.getByText('City').closest('[data-tour]') as HTMLElement;
    expect(container).toHaveAttribute('data-tour', 'clients.list.city');
    expect(container).toContainElement(screen.getByLabelText('City'));
  });

  it('SUP-05 keeps the id off the <select> itself', () => {
    render(
      <SelectInput label="City" tourId="clients.list.city">
        <option value="a">{'Tirana'}</option>
      </SelectInput>,
    );
    expect(screen.getByLabelText('City')).not.toHaveAttribute('data-tour');
  });

  it('SUP-05 adds no attribute when the prop is omitted', () => {
    const { container } = render(
      <SelectInput label="City">
        <option value="a">{'Tirana'}</option>
      </SelectInput>,
    );
    expect(container.querySelector('[data-tour]')).toBeNull();
  });
});
