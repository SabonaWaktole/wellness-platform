import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { LookupListEditor, type LookupColumn } from './LookupListEditor';
import type { RiskLevel } from '../../../services/lookupService';

const LEVELS: RiskLevel[] = [
  { id: 'rl1', nameSq: 'Niveli 1', nameEn: 'Level 1', level: 1, description: 'Rrezik i ulët', order: 1, active: true },
  { id: 'rl2', nameSq: 'Niveli 2', nameEn: null, level: 2, description: null, order: 2, active: true },
  { id: 'rl3', nameSq: 'Niveli 3', nameEn: 'Level 3', level: 3, description: null, order: 3, active: false },
];

const levelColumn: LookupColumn<RiskLevel> = {
  field: 'level',
  header: 'Level',
  render: (item) => `L${item.level}`,
  renderInput: ({ id, label, value, onChange }) => (
    <input id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  draftOf: (item) => (item ? String(item.level) : '4'),
};

const apiError = (code: string, extra: object = {}) => Object.assign(new Error(code), { response: { data: { code, ...extra } } });

describe('LookupListEditor', () => {
  const handlers = {
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onReorder: vi.fn(),
    onSetActive: vi.fn(),
    onDelete: vi.fn(),
  };

  const renderEditor = (items = LEVELS) =>
    render(
      <LookupListEditor
        caption="Risk levels"
        items={items}
        columns={[levelColumn]}
        toValues={(draft) => ({ level: Number(draft.level) })}
        errorMessage={(err: any) => `failed: ${err.response?.data?.code}`}
        {...handlers}
      />
    );

  const row = (id: string) => screen.getByTestId(`lookup-row-${id}`);

  beforeEach(() => {
    vi.clearAllMocks();
    for (const handler of Object.values(handlers)) handler.mockResolvedValue(undefined);
  });

  it('FR-SET-02 lists the values in order with both labels, their own columns and whether they are active', () => {
    renderEditor();

    const table = screen.getByRole('table', { name: 'Risk levels' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['lookup-row-rl1', 'lookup-row-rl2', 'lookup-row-rl3']);
    expect(within(row('rl1')).getByText('Level 1')).toBeDefined();
    expect(within(row('rl1')).getByText('L1')).toBeDefined();
    expect(within(row('rl1')).getByText('Active')).toBeDefined();
    expect(within(row('rl3')).getByText('Inactive')).toBeDefined();
  });

  it('FR-LNG-03 says a value without an English name uses the Albanian one', () => {
    renderEditor();

    expect(within(row('rl2')).getByText('Uses the Albanian name')).toBeDefined();
  });

  it('FR-SET-01 adds a value with sq/en labels and the list\'s own fields', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Albanian name' }), { target: { value: 'Niveli 4' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'English name' }), { target: { value: '  ' } });
    expect((screen.getByRole('textbox', { name: 'Level' }) as HTMLInputElement).value).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(handlers.onCreate).toHaveBeenCalledWith({ nameSq: 'Niveli 4', nameEn: null, level: 4 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
  });

  it('cannot save a value without an Albanian name', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'English name' }), { target: { value: 'Level 4' } });

    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('edits a value inline, starting from what it holds', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Level 1' }));
    const english = screen.getByRole('textbox', { name: 'English name' }) as HTMLInputElement;
    expect(english.value).toBe('Level 1');
    fireEvent.change(english, { target: { value: 'Low' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(handlers.onUpdate).toHaveBeenCalledWith('rl1', { nameSq: 'Niveli 1', nameEn: 'Low', level: 1 }));
  });

  it('keeps the row open and explains a refusal', async () => {
    handlers.onUpdate.mockRejectedValue(apiError('LOOKUP_VALUE_TAKEN'));
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('failed: LOOKUP_VALUE_TAKEN');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });

  it('FR-SET-01 deactivates and reactivates a value', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate Level 3' }));

    await waitFor(() => expect(handlers.onSetActive).toHaveBeenCalledWith('rl1', false));
    expect(handlers.onSetActive).toHaveBeenCalledWith('rl3', true);
  });

  it('reorders with the arrow buttons', async () => {
    renderEditor();

    expect((screen.getByRole('button', { name: 'Move Level 1 up' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move Level 1 down' }));

    await waitFor(() => expect(handlers.onReorder).toHaveBeenCalledWith(['rl2', 'rl1', 'rl3']));
  });

  it('reorders by dragging a row onto another', async () => {
    renderEditor();

    fireEvent.dragStart(row('rl3'), { dataTransfer: { effectAllowed: '' } });
    fireEvent.dragOver(row('rl1'));
    fireEvent.drop(row('rl1'));

    await waitFor(() => expect(handlers.onReorder).toHaveBeenCalledWith(['rl3', 'rl1', 'rl2']));
  });

  it('FR-SET-01 explains why a value in use cannot be deleted, and keeps the dialog open', async () => {
    handlers.onDelete.mockRejectedValue(apiError('LOOKUP_ITEM_IN_USE'));
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Level 1' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('failed: LOOKUP_ITEM_IN_USE');
    expect(handlers.onDelete).toHaveBeenCalledWith('rl1');
  });
});
