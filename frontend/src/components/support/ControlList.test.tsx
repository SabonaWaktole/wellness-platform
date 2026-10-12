import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadSupportCopy } from '../../lib/support/supportCopy';
import type { ExplainableEntry } from '../../lib/support/useExplainableControls';
import type { GuideStep } from '../../lib/support/types';
import { ControlList } from './ControlList';

beforeAll(async () => {
  await loadSupportCopy('support');
});

const step = (id: string, over: Partial<GuideStep> = {}): GuideStep => ({ id, target: `fx.${id}`, kind: 'control', ...over });
const entry = (id: string, over: Partial<ExplainableEntry> = {}): ExplainableEntry => ({ step: step(id), section: '', repeated: false, status: 'found', ...over });
const TITLES: Record<string, string> = { add: 'Add a client', search: 'Search clients', rows: 'A client row', filter: 'Filter by city' };

const setup = (entries = [entry('add'), entry('search'), entry('rows', { repeated: true })], over: Partial<Parameters<typeof ControlList>[0]> = {}) => {
  const props = { onChoose: vi.fn(), onBack: vi.fn(), onRetry: vi.fn() };
  render(<ControlList entries={entries} loading={false} titleOf={(s) => TITLES[s.id] ?? s.id} {...props} {...over} />);
  return props;
};

describe('SUP-14 ControlList', () => {
  it('SUP-14 is a labelled search box over a listbox of options', () => {
    setup();
    expect(screen.getByRole('searchbox', { name: 'Find a control' })).toBeInTheDocument();
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Add a client',
      'Search clients',
      'A client rowAppears on every row',
    ]);
  });

  it('SUP-07 says which controls appear on every row', () => {
    setup();
    expect(screen.getAllByText('Appears on every row')).toHaveLength(1);
  });

  it('SUP-04 choosing an option with the mouse explains that control', () => {
    const { onChoose } = setup();
    fireEvent.click(screen.getByRole('option', { name: /Search clients/ }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 'search' }));
  });

  it('SUP-14 the arrow keys move the highlighted option and Enter explains it', () => {
    const { onChoose } = setup();
    const box = screen.getByRole('searchbox');
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2].id);
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 'rows' }));
  });

  it('SUP-14 the highlight stops at the ends, and Home and End jump', () => {
    setup();
    const box = screen.getByRole('searchbox');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
    fireEvent.keyDown(box, { key: 'End' });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2].id);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2].id);
    fireEvent.keyDown(box, { key: 'Home' });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
  });

  it('SUP-04 typing narrows the list, ignoring case', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'SEARCH' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Search clients']);
  });

  it('SUP-04 says so when nothing matches what was typed', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByText('No control matches “zzz”.')).toBeInTheDocument();
  });

  it('SUP-04 Enter with nothing to choose does nothing', () => {
    const { onChoose } = setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('SUP-04 groups controls under their section heading', () => {
    setup([entry('add', { section: 'Page' }), entry('search', { section: 'Filters' }), entry('filter', { section: 'Filters' })]);
    expect(screen.getByRole('group', { name: 'Page' })).toBeInTheDocument();
    const filters = screen.getByRole('group', { name: 'Filters' });
    expect(within(filters).getAllByRole('option')).toHaveLength(2);
  });

  it('SUP-04 a control without a section is not under a heading', () => {
    setup([entry('add')]);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('SUP-11 says it is loading, and exposes that', () => {
    setup([], { loading: true });
    expect(screen.getByText('Looking at the page…')).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
  });

  it('SUP-11 explains an empty page and offers to look again', () => {
    const { onRetry } = setup([]);
    expect(screen.getByText('No controls on this page can be explained yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('SUP-04 Back returns to the panel', () => {
    const { onBack } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('SUP-14 keeps the highlight on a real option when the list shrinks', () => {
    setup();
    const box = screen.getByRole('searchbox');
    fireEvent.keyDown(box, { key: 'End' });
    fireEvent.change(box, { target: { value: 'add' } });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
  });
});
