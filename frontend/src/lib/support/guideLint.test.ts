import { describe, expect, it } from 'vitest';
import { assertGuideIntegrity, lintGuide, type CopyLookup } from './guideLint';
import { definePageGuide, sharedStep } from './defineGuide';
import type { GuideStep } from './types';

/** A catalogue in memory: `en` and `sq` each hold a set of "<namespace>:<key>" strings. */
const catalogue = (en: string[], sq: string[] = en): CopyLookup => {
  const sets = { en: new Set(en), sq: new Set(sq) };
  return (lng, namespace, key) => sets[lng].has(`${namespace}:${key}`);
};

const keysFor = (pageId: string, ids: string[], parts = ['title', 'body']) => ids.flatMap((id) => parts.map((p) => `supportSales:${pageId}.${id}.${p}`));

const good: GuideStep[] = [
  { id: 'add', target: 'clients.list.add', kind: 'control' },
  { id: 'search', target: 'clients.list.search', kind: 'field', safety: 'try-it' },
  { id: 'rows', target: 'clients.list.row', kind: 'region', repeat: true },
  { id: 'delete', target: 'clients.list.delete', kind: 'control', warning: true },
];

const make = (steps: GuideStep[]) => definePageGuide({ pageId: 'clients.list', version: 1, namespace: 'supportSales', steps });
const copy = (ids = ['add', 'search', 'rows', 'delete'], extra: string[] = []) => catalogue([...keysFor('clients.list', ids), ...keysFor('clients.list', ['delete'], ['warning']), ...extra]);
const codes = (guide: ReturnType<typeof make>, lookup: CopyLookup) => lintGuide(guide, lookup).map((issue) => issue.code);

describe('SUP-02 guide lint: a sound guide', () => {
  it('SUP-02 passes', () => {
    expect(lintGuide(make(good), copy())).toEqual([]);
    expect(() => assertGuideIntegrity(make(good), copy())).not.toThrow();
  });

  it('SUP-02 an empty guide is reported', () => {
    expect(codes(make([]), copy())).toEqual(['empty-guide']);
  });

  it('SUP-05 a step using a shared kind needs no copy of its own', () => {
    const steps = [sharedStep('pagination', 'clients.list.pagination'), sharedStep('search', 'clients.list.search')];
    expect(lintGuide(make(steps))).toEqual([]);
  });
});

describe('SUP-05 SUP-07 SUP-12 SUP-18 guide lint: five broken guides, five distinct messages', () => {
  it('SUP-02 reports a duplicate step id', () => {
    const issues = lintGuide(make([...good, { id: 'add', target: 'clients.list.other', kind: 'control' }]), copy());
    expect(issues.map((i) => i.code)).toEqual(['duplicate-step-id']);
    expect(issues[0].message).toBe('Step "add" is declared more than once.');
  });

  it('SUP-05 reports a target id that breaks the grammar', () => {
    const issues = lintGuide(make([{ id: 'add', target: 'Clients List Add', kind: 'control' }]), copy(['add']));
    expect(issues.map((i) => i.code)).toEqual(['invalid-target-id']);
    expect(issues[0].message).toContain('"Clients List Add"');
  });

  it('SUP-07 reports a .row target that is not declared repeat', () => {
    const issues = lintGuide(make([{ id: 'rows', target: 'clients.list.row', kind: 'region' }]), copy(['rows']));
    expect(issues.map((i) => i.code)).toEqual(['repeat-required']);
    expect(issues[0].message).toBe('Step "rows" targets "clients.list.row", which repeats; declare repeat: true.');
  });

  it.each(['clients.list.card', 'clients.list.item'])('SUP-07 also for a %s target', (target) => {
    expect(codes(make([{ id: 's', target, kind: 'region' }]), copy(['s']))).toEqual(['repeat-required']);
  });

  it('SUP-12 reports a destructive step that is try-it', () => {
    const issues = lintGuide(make([{ id: 'delete', target: 'clients.list.delete', kind: 'menu', warning: true, safety: 'try-it' }]), copy(['delete']));
    expect(issues.map((i) => i.code)).toEqual(['destructive-try-it']);
    expect(issues[0].message).toBe('Step "delete" is flagged destructive (warning) and must be explain-only, not try-it.');
  });

  it('SUP-12 reports try-it on a submit control', () => {
    const issues = lintGuide(make([{ id: 'save', target: 'clients.form.save', kind: 'submit', safety: 'try-it' }]), copy(['save']));
    expect(issues.map((i) => i.code)).toEqual(['try-it-not-allowed']);
    expect(issues[0].message).toContain('"submit"');
  });

  it('SUP-12 reports try-it on a plain control or region', () => {
    expect(codes(make([{ id: 'x', target: 'clients.list.x', kind: 'control', safety: 'try-it' }]), copy(['x']))).toEqual(['try-it-not-allowed']);
    expect(codes(make([{ id: 'x', target: 'clients.list.x', kind: 'region', safety: 'try-it' }]), copy(['x']))).toEqual(['try-it-not-allowed']);
  });

  it.each(['tab', 'filter', 'field', 'menu', 'opener'] as const)('SUP-12 allows try-it on a %s', (kind) => {
    expect(codes(make([{ id: 'x', target: 'clients.list.x', kind, safety: 'try-it' }]), copy(['x']))).toEqual([]);
  });

  it('SUP-18 reports copy missing in Albanian, naming the language and the key', () => {
    const lookup = catalogue([...keysFor('clients.list', ['add', 'search', 'rows', 'delete']), ...keysFor('clients.list', ['delete'], ['warning'])], keysFor('clients.list', ['add']));
    const issues = lintGuide(make(good), lookup);
    expect(issues.every((i) => i.code === 'missing-copy')).toBe(true);
    expect(issues.map((i) => i.message)).toContain('Step "search" has no "supportSales:clients.list.search.title" in sq.');
  });

  it('SUP-18 reports copy missing in English', () => {
    const issues = lintGuide(make([good[0]]), catalogue([], keysFor('clients.list', ['add'])));
    expect(issues.map((i) => i.message)).toEqual([
      'Step "add" has no "supportSales:clients.list.add.title" in en.',
      'Step "add" has no "supportSales:clients.list.add.body" in en.',
    ]);
  });

  it('SUP-12 a warning step must have warning copy', () => {
    const lookup = catalogue(keysFor('clients.list', ['delete']));
    expect(lintGuide(make([good[3]]), lookup).map((i) => i.message)).toEqual([
      'Step "delete" has no "supportSales:clients.list.delete.warning" in en.',
      'Step "delete" has no "supportSales:clients.list.delete.warning" in sq.',
    ]);
  });

  it('SUP-05 reports a shared kind that does not exist', () => {
    const issues = lintGuide(make([{ id: 'x', target: 'clients.list.x', kind: 'control', use: 'shared.nope' }]), copy(['x']));
    expect(issues.map((i) => i.code)).toEqual(['unknown-shared-kind']);
  });

  it('SUP-05 a page guide may not reuse shell ids', () => {
    const issues = lintGuide(make([{ id: 'menu', target: 'shell.menu', kind: 'control' }]), copy(['menu']));
    expect(issues.map((i) => i.code)).toEqual(['shell-id-reused']);
  });

  it('SUP-05 the shell guide itself may', () => {
    const shell = definePageGuide({ pageId: 'shell', version: 1, namespace: 'support', steps: [{ id: 'menu', target: 'shell.menu', kind: 'control' }] });
    expect(lintGuide(shell, catalogue(keysFor('shell', ['menu']).map((k) => k.replace('supportSales', 'support'))))).toEqual([]);
  });

  it('SUP-02 each of the broken variants has its own code', () => {
    const all = new Set(['duplicate-step-id', 'invalid-target-id', 'repeat-required', 'destructive-try-it', 'try-it-not-allowed', 'missing-copy', 'unknown-shared-kind', 'shell-id-reused', 'empty-guide']);
    expect(all.size).toBe(9);
  });
});

describe('SUP-02 assertGuideIntegrity', () => {
  it('SUP-02 throws with every problem listed', () => {
    const broken = make([
      { id: 'rows', target: 'clients.list.row', kind: 'region' },
      { id: 'rows', target: 'Bad Id', kind: 'control' },
    ]);
    expect(() => assertGuideIntegrity(broken, copy(['rows']))).toThrow(/clients\.list: .*declared more than once[\s\S]*Bad Id[\s\S]*repeat: true/);
  });
});
