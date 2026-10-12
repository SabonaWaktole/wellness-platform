import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { resolveStepCopy } from './defineGuide';
import { SHARED, SHARED_KINDS, sharedCopyKeys } from './sharedGuidance';
import { loadSupportCopy } from './supportCopy';
import type { GuideStep } from './types';

const read = (lng: string, key: string): unknown => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], i18n.getResourceBundle(lng, 'support'));

beforeAll(async () => {
  await i18n.changeLanguage('sq');
  await loadSupportCopy('support');
  await i18n.changeLanguage('en');
  await loadSupportCopy('support');
});

afterEach(() => i18n.changeLanguage('en'));

describe('SUP-05 shared guidance kinds', () => {
  it('SUP-05 defines the sixteen control families the plan calls for', () => {
    expect([...SHARED_KINDS].sort()).toEqual(
      [
        'backLink', 'bulkSelect', 'confirmDialog', 'dateRange', 'emptyAction', 'export', 'filterSelect', 'pagination',
        'refresh', 'rowMenu', 'saveBar', 'search', 'sortHeader', 'statusBadge', 'statusChips', 'tabs',
      ].sort(),
    );
  });

  it.each(SHARED_KINDS)('SUP-18 %s has a title and a body in English and Albanian', (kind) => {
    const keys = sharedCopyKeys(kind);
    for (const lng of ['en', 'sq']) {
      expect(read(lng, keys.title), `${lng} ${keys.title}`).toEqual(expect.any(String));
      expect(read(lng, keys.body), `${lng} ${keys.body}`).toEqual(expect.any(String));
      expect(String(read(lng, keys.title)).length).toBeGreaterThan(2);
    }
  });

  it.each(SHARED_KINDS)('SUP-18 %s has a disabled hint in both languages exactly when it declares one', (kind) => {
    const keys = sharedCopyKeys(kind);
    for (const lng of ['en', 'sq']) {
      expect(read(lng, keys.disabled) !== undefined, `${lng} ${keys.disabled}`).toBe(Boolean(SHARED[kind].disabledHint));
    }
  });

  it.each(SHARED_KINDS)('SUP-12 %s explains and never operates', (kind) => {
    expect(SHARED[kind].safety).toBe('explain-only');
  });

  it('SUP-18 English and Albanian define the same shared keys', () => {
    const keys = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object' ? Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k)) : [prefix];
    const en = keys((i18n.getResourceBundle('en', 'support') as { shared: unknown }).shared).sort();
    const sq = keys((i18n.getResourceBundle('sq', 'support') as { shared: unknown }).shared).sort();
    expect(sq).toEqual(en);
  });
});

describe('SUP-05 shared guidance in use', () => {
  const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
  const step = (over: Partial<GuideStep> = {}): GuideStep => ({ id: 'search', target: 'clients.list.search', kind: 'field', use: 'shared.search', ...over });
  const guide = { pageId: 'clients.list', namespace: 'supportSales' };

  it('SUP-05 a step that uses a shared kind gets its title and body, with the subject filled in', () => {
    const copy = resolveStepCopy(guide, step({ vars: { subject: 'clients' } }), t);
    expect(copy.title).toBe('Search clients');
    expect(copy.body).toContain('narrow clients');
  });

  it('SUP-05 the same shared kind reads in Albanian', async () => {
    await i18n.changeLanguage('sq');
    const copy = resolveStepCopy(guide, step({ vars: { subject: 'klientët' } }), t);
    expect(copy.title).toBe('Kërko në klientët');
  });

  it('SUP-05 without a subject the copy still reads sensibly', () => {
    const copy = resolveStepCopy(guide, step(), t);
    expect(copy.title).toBe('Search this page');
    expect(copy.title).not.toContain('{{');
  });

  it('SUP-05 the disabled hint of a shared kind is available to the popover', () => {
    const copy = resolveStepCopy(guide, step({ id: 'pg', target: 'clients.list.pagination', use: 'shared.pagination' }), t);
    expect(copy.disabled).toBe('A direction is dimmed when there is nothing further that way.');
  });
});
