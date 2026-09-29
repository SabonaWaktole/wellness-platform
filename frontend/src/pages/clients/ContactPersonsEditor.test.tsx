import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ContactPersonsEditor } from './ContactPersonsEditor';
import * as clientsHooks from '../../hooks/useClients';
import type { ContactPerson, ContactPersonInput } from '../../types/client';

vi.mock('../../hooks/useClients', () => ({
  useContactPersons: vi.fn(),
}));

const contact = (overrides: Partial<ContactPerson> = {}): ContactPerson => ({
  id: 'ct1',
  clientId: 'c1',
  name: 'Jane Doe',
  position: 'Manager',
  phone: '+1 555 0100',
  email: 'jane@example.com',
  isPrimary: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('ContactPersonsEditor — create mode', () => {
  it('adds a new local row and reports it through onChange', () => {
    const onChange = vi.fn();
    const contacts: ContactPersonInput[] = [{ name: 'First', phone: '+355691234567' }];
    render(<ContactPersonsEditor mode="create" contacts={contacts} onChange={onChange} />);

    fireEvent.click(screen.getByText('Add contact'));

    expect(onChange).toHaveBeenCalledWith([contacts[0], { name: '', position: '', phone: '', email: '' }]);
  });

  it('the first row is marked as the primary contact', () => {
    render(
      <ContactPersonsEditor
        mode="create"
        contacts={[{ name: 'First', phone: '+355691234567' }]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('removes a row when there is more than one', () => {
    const onChange = vi.fn();
    render(
      <ContactPersonsEditor
        mode="create"
        contacts={[{ name: 'First', phone: '1' }, { name: 'Second', phone: '2' }]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getAllByLabelText('Remove contact')[0]);
    expect(onChange).toHaveBeenCalledWith([{ name: 'Second', phone: '2' }]);
  });
});

describe('ContactPersonsEditor — edit mode', () => {
  const addContact = vi.fn();
  const updateContact = vi.fn();
  const removeContact = vi.fn();
  const setPrimaryContact = vi.fn();
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (clientsHooks.useContactPersons as any).mockReturnValue({
      addContact, updateContact, removeContact, setPrimaryContact, isLoading: false, error: null,
    });
  });

  it('saves a field edit through updateContact on blur', () => {
    render(<ContactPersonsEditor mode="edit" clientId="c1" contacts={[contact()]} onChanged={onChanged} />);

    const positionInput = screen.getByDisplayValue('Manager');
    fireEvent.change(positionInput, { target: { value: 'CEO' } });
    fireEvent.blur(positionInput);

    expect(updateContact).toHaveBeenCalledWith('c1', 'ct1', { position: 'CEO' });
  });

  it('calls setPrimaryContact when a non-primary contact is chosen', () => {
    const contacts = [contact({ id: 'ct1', isPrimary: true }), contact({ id: 'ct2', name: 'Second', isPrimary: false })];
    render(<ContactPersonsEditor mode="edit" clientId="c1" contacts={contacts} onChanged={onChanged} />);

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);

    expect(setPrimaryContact).toHaveBeenCalledWith('c1', 'ct2');
  });

  it('removing the primary contact prompts for a replacement instead of calling removeContact directly', () => {
    const contacts = [contact({ id: 'ct1', isPrimary: true }), contact({ id: 'ct2', name: 'Second', isPrimary: false })];
    render(<ContactPersonsEditor mode="edit" clientId="c1" contacts={contacts} onChanged={onChanged} />);

    fireEvent.click(screen.getAllByLabelText('Remove contact')[0]);

    expect(removeContact).not.toHaveBeenCalled();
    expect(screen.getByText('Choose which contact becomes primary before removing this one.')).toBeInTheDocument();
  });

  it('confirming the replacement calls removeContact with the chosen successor', () => {
    const contacts = [contact({ id: 'ct1', isPrimary: true }), contact({ id: 'ct2', name: 'Second', isPrimary: false })];
    render(<ContactPersonsEditor mode="edit" clientId="c1" contacts={contacts} onChanged={onChanged} />);

    fireEvent.click(screen.getAllByLabelText('Remove contact')[0]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ct2' } });
    fireEvent.click(screen.getByText('Remove contact', { selector: 'button' }));

    expect(removeContact).toHaveBeenCalledWith('c1', 'ct1', 'ct2');
  });

  it('the last remaining contact cannot be removed at all', () => {
    render(<ContactPersonsEditor mode="edit" clientId="c1" contacts={[contact()]} onChanged={onChanged} />);

    fireEvent.click(screen.getByLabelText('Remove contact'));

    expect(removeContact).not.toHaveBeenCalled();
    expect(screen.getByText('Choose which contact becomes primary before removing this one.')).toBeInTheDocument();
  });

  it('adds a new contact through addContact', () => {
    render(<ContactPersonsEditor mode="edit" clientId="c1" contacts={[contact()]} onChanged={onChanged} />);

    fireEvent.click(screen.getByText('Add contact'));
    const nameInputs = screen.getAllByLabelText('Name');
    fireEvent.change(nameInputs[nameInputs.length - 1], { target: { value: 'New Person' } });
    fireEvent.click(screen.getByText('Save'));

    expect(addContact).toHaveBeenCalledWith('c1', { name: 'New Person', position: '', phone: '', email: '' });
  });
});
