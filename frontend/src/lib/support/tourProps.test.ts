import { afterEach, describe, expect, it, vi } from 'vitest';
import { tourPath, tourProps, TOUR_ID_PATTERN } from './tourProps';

afterEach(() => vi.restoreAllMocks());

describe('SUP-05 tour id grammar', () => {
  it.each(['clients.list.add', 'shell.nav.item', 'followUps.list.row', 'settings.pricing.tab.zones', 'a.b', 'dashboard.ceo.kpi-won'])(
    'SUP-05 accepts %s',
    (id) => expect(TOUR_ID_PATTERN.test(id)).toBe(true),
  );

  it.each(['clients', 'Clients.list', 'clients..list', 'clients.list.', '.clients.list', 'clients.List add', 'clients.list_add', ''])(
    'SUP-05 rejects "%s"',
    (id) => expect(TOUR_ID_PATTERN.test(id)).toBe(false),
  );
});

describe('SUP-05 tourProps', () => {
  it('SUP-05 returns the data-tour attribute', () => {
    expect(tourProps('clients.list.add')).toEqual({ 'data-tour': 'clients.list.add' });
  });

  it('SUP-07 marks a repeated structure', () => {
    expect(tourProps('clients.list.row', { repeat: true })).toEqual({ 'data-tour': 'clients.list.row', 'data-tour-repeat': '' });
  });

  it('SUP-05 can record the kind of control', () => {
    expect(tourProps('clients.list.add', { kind: 'control' })).toEqual({ 'data-tour': 'clients.list.add', 'data-tour-kind': 'control' });
  });

  it('SUP-05 adds nothing when there is no id, so a component can spread it unconditionally', () => {
    expect(tourProps(undefined)).toEqual({});
    expect(tourProps(undefined, { repeat: true })).toEqual({});
    expect(tourProps('')).toEqual({});
  });

  it('SUP-05 warns once in development about an id that breaks the grammar, and still returns it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(tourProps('Bad Id')).toEqual({ 'data-tour': 'Bad Id' });
    tourProps('Bad Id');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Bad Id');
  });

  it('SUP-05 does not warn for a valid id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    tourProps('clients.list.add');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('SUP-05 tourPath', () => {
  it('SUP-05 joins segments with dots', () => {
    expect(tourPath('clients.list', 'sort', 'name')).toBe('clients.list.sort.name');
  });

  it('SUP-05 turns characters outside the grammar into hyphens, so data ids cannot break it', () => {
    expect(tourPath('clients.list', 'sort', 'created_at')).toBe('clients.list.sort.created-at');
    expect(tourPath('x.y', 'tab', 'a b')).toBe('x.y.tab.a-b');
  });
});
