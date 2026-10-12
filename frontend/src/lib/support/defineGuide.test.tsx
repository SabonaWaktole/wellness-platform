import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { copyKeys, definePageGuide, resolveStepCopy, runtimeVars, sharedStep } from './defineGuide';
import { loadSupportCopy } from './supportCopy';
import type { GuideStep } from './types';

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

beforeAll(async () => {
  await loadSupportCopy('support');
  i18n.addResourceBundle('en', 'supportSales', { clients: { list: { add: { title: 'Add a client', body: 'Opens the form.', when: 'For new clients.', warning: 'Nothing saves yet.', disabled: 'Needs permission.' } } } }, true, true);
});

describe('SUP-03 definePageGuide', () => {
  const steps: GuideStep[] = [{ id: 'add', target: 'clients.list.add', kind: 'control' }];

  it('SUP-03 returns the guide it was given, frozen all the way down', () => {
    const guide = definePageGuide({ pageId: 'clients.list', version: 1, namespace: 'supportSales', steps });
    expect(guide).toMatchObject({ pageId: 'clients.list', version: 1, namespace: 'supportSales' });
    expect(Object.isFrozen(guide)).toBe(true);
    expect(Object.isFrozen(guide.steps)).toBe(true);
    expect(Object.isFrozen(guide.steps[0])).toBe(true);
  });

  it('SUP-03 does not freeze the array it was handed', () => {
    definePageGuide({ pageId: 'clients.list', version: 1, namespace: 'supportSales', steps });
    expect(Object.isFrozen(steps)).toBe(false);
  });
});

describe('SUP-18 copyKeys', () => {
  it('SUP-18 derives the keys by convention <pageId>.<stepId>.title|body|when|warning|disabled', () => {
    expect(copyKeys('clients.list', 'add')).toEqual({
      title: 'clients.list.add.title',
      body: 'clients.list.add.body',
      when: 'clients.list.add.when',
      warning: 'clients.list.add.warning',
      disabled: 'clients.list.add.disabled',
    });
  });
});

describe('SUP-03 resolveStepCopy', () => {
  const guide = { pageId: 'clients.list', namespace: 'supportSales' };
  const add: GuideStep = { id: 'add', target: 'clients.list.add', kind: 'control' };

  it('SUP-03 reads every part from the guide’s namespace', () => {
    expect(resolveStepCopy(guide, add, t)).toEqual({
      title: 'Add a client',
      body: 'Opens the form.',
      when: 'For new clients.',
      warning: 'Nothing saves yet.',
      disabled: 'Needs permission.',
    });
  });

  it('SUP-03 leaves out the parts that do not exist', () => {
    const copy = resolveStepCopy(guide, { ...add, id: 'nothing' }, t);
    expect(copy.when).toBeUndefined();
    expect(copy.warning).toBeUndefined();
    expect(copy.disabled).toBeUndefined();
  });

  it('SUP-05 a step’s own copy wins over the shared kind it uses', () => {
    const copy = resolveStepCopy(guide, { ...add, use: 'shared.search' }, t);
    expect(copy.title).toBe('Add a client');
  });

  it('SUP-05 runtime values (such as the dialog title read from the page) reach the copy', () => {
    i18n.addResourceBundle('en', 'supportSales', { clients: { list: { dlg: { title: 'Fill in {{dialogTitle}}', body: 'B' } } } }, true, true);
    const copy = resolveStepCopy(guide, { id: 'dlg', target: 'clients.list.dlg', kind: 'region' }, t, { dialogTitle: 'Add a client' });
    expect(copy.title).toBe('Fill in Add a client');
  });
});

describe('SUP-05 runtimeVars', () => {
  it('SUP-05 reads a dialog’s visible title from its aria-labelledby', () => {
    document.body.innerHTML = '<div role="dialog" aria-labelledby="t1"><h2 id="t1">Add a client</h2><button id="b">x</button></div>';
    expect(runtimeVars(document.getElementById('b'))).toEqual({ dialogTitle: 'Add a client' });
    document.body.innerHTML = '';
  });

  it('SUP-05 gives nothing outside a dialog, or with no element', () => {
    expect(runtimeVars(null)).toEqual({});
    expect(runtimeVars(document.createElement('div'))).toEqual({});
  });
});

describe('SUP-05 sharedStep', () => {
  it('SUP-05 builds a step for a shared kind in one line, taking kind and safety from the registry', () => {
    expect(sharedStep('search', 'clients.list.search', { vars: { subject: 'clients' } })).toEqual({
      id: 'search',
      target: 'clients.list.search',
      kind: 'field',
      safety: 'explain-only',
      use: 'shared.search',
      vars: { subject: 'clients' },
    });
  });

  it('SUP-05 lets the page override anything', () => {
    expect(sharedStep('search', 'clients.list.search', { id: 'find' })).toMatchObject({ id: 'find', use: 'shared.search' });
  });

  it('SUP-05 refuses a kind that does not exist', () => {
    expect(() => sharedStep('nope', 'a.b')).toThrow(/nope/);
  });
});
