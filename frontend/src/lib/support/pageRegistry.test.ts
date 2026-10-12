import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isExcluded, isPlanned, loadGuide, loaders, resolvePageId } from './pageRegistry';

describe('SUP-01 resolvePageId: the current URL names the page', () => {
  it.each([
    ['/acme/clients', 'clients.list'],
    ['/acme/clients/c1', 'clients.detail'],
    ['/acme/clients/new', 'clients.form'],
    ['/acme/clients/c1/edit', 'clients.form'],
    ['/acme/clients/c1/pricing', 'pricing.offer'],
    ['/acme/deals/d1/pricing', 'pricing.offer'],
    ['/acme/deals/new', 'deals.form'],
    ['/acme/deals/d1', 'deals.detail'],
    ['/acme/members/payments', 'members.payments'],
    ['/acme/members/m1', 'members.detail'],
    ['/acme/settings', 'settings.company'],
    ['/acme/settings/pricing', 'settings.pricing'],
    ['/acme/settings/pricing/zones', 'settings.pricing'],
    ['/acme/settings/lists/cities', 'settings.lists'],
    ['/acme/follow-ups', 'followUps'],
    ['/admin/tenants', 'admin.tenants'],
    ['/admin', 'admin.dashboard'],
    ['/admin/dashboard', 'admin.dashboard'],
  ])('SUP-01 %s is %s', (pathname, pageId) => {
    expect(resolvePageId(pathname)).toBe(pageId);
  });

  it('SUP-01 the dashboard is named by the variant the page publishes', () => {
    expect(resolvePageId('/acme/dashboard', 'salesManager')).toBe('dashboard.salesManager');
    expect(resolvePageId('/acme/dashboard', 'ceo')).toBe('dashboard.ceo');
  });

  it('SUP-01 the dashboard has no page id until the variant is known', () => {
    expect(resolvePageId('/acme/dashboard')).toBeNull();
  });

  it('SUP-01 a variant is ignored on routes that have none', () => {
    expect(resolvePageId('/acme/clients', 'ceo')).toBe('clients.list');
  });

  it('SUP-01 a trailing slash does not change the page', () => {
    expect(resolvePageId('/acme/clients/')).toBe('clients.list');
  });

  it('SUP-01 a tenant slug that looks like a route word still resolves its pages', () => {
    expect(resolvePageId('/login/clients')).toBe('clients.list');
  });

  it.each(['/login', '/q/abc', '/m/abc', '/v/abc', '/f/abc', '/forgot-password', '/unauthorized', '/acme', '/nowhere/at/all/really'])(
    'SUP-01 %s has no page',
    (pathname) => {
      expect(resolvePageId(pathname)).toBeNull();
    },
  );
});

describe('SUP-20 isExcluded tells a decided exclusion from an unknown path', () => {
  it.each(['/login', '/q/abc', '/acme/settings/client-management/forms/f1/print', '/unauthorized'])('SUP-20 %s is excluded', (pathname) => {
    expect(isExcluded(pathname)).toBe(true);
  });

  it('SUP-20 a mapped page is not excluded', () => {
    expect(isExcluded('/acme/clients')).toBe(false);
  });

  it('SUP-20 an unknown path falls through to the 404 exclusion', () => {
    expect(isExcluded('/acme/no/such/page/here')).toBe(true);
  });
});

describe('SUP-19 guides are loaded on demand', () => {
  it('SUP-19 every loader is a function, so no guide module is imported eagerly', () => {
    for (const loader of Object.values(loaders)) expect(typeof loader).toBe('function');
  });

  it('SUP-19 pageRegistry has no static import from guides/', () => {
    const source = readFileSync(resolve(__dirname, 'pageRegistry.ts'), 'utf8');
    expect(source).not.toMatch(/^import\s[^;]*from\s+['"][^'"]*guides\//m);
  });

  it('SUP-19 a page without a guide loads null, and is reported as planned', async () => {
    expect(await loadGuide('clients.list')).toBeNull();
    expect(isPlanned('clients.list')).toBe(true);
    expect(isPlanned('not.a.page')).toBe(false);
  });
});
