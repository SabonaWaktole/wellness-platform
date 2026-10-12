import { matchPath } from 'react-router-dom';
import { PLANNED_PAGES, ROUTE_MAP, type RouteMapEntry } from './routeMap';
import type { PageGuide } from './types';

/**
 * Turns a URL into a Support page id, and holds the lazy table of guides.
 * Guides are loaded with dynamic `import()` so each one is its own chunk and a
 * user who never opens Support downloads none of them.
 */

/** Page id to guide loader. Every page slice adds exactly one line here. */
export const loaders: Record<string, () => Promise<{ default: PageGuide }>> = {};

const TENANT_PREFIX = '/:tenantSlug';

const tenantPath = (pattern: string) => (pattern === '' ? TENANT_PREFIX : `${TENANT_PREFIX}/${pattern}`);

// Top level routes first, then the tenant shell's, then the catch-all: the router ranks a static
// `/admin/tenants` above `/:tenantSlug/dashboard` for the same reason.
const TOP_LEVEL = ROUTE_MAP.filter((entry) => entry.pattern.startsWith('/'));
const TENANT = ROUTE_MAP.filter((entry) => !entry.pattern.startsWith('/') && entry.pattern !== '*');
const FALLBACK = ROUTE_MAP.filter((entry) => entry.pattern === '*');

function findEntry(pathname: string): RouteMapEntry | null {
  for (const entry of TOP_LEVEL) if (matchPath(entry.pattern, pathname)) return entry;
  for (const entry of TENANT) if (matchPath(tenantPath(entry.pattern), pathname)) return entry;
  return FALLBACK[0] ?? null;
}

/**
 * The page id for `pathname`, or null when the route has no page (excluded, or unknown).
 * Pages with variants (the role dashboards) have no id until the page publishes its variant.
 */
export function resolvePageId(pathname: string, variant?: string | null): string | null {
  const entry = findEntry(pathname);
  if (!entry || entry.pageId === null) return null;
  if (entry.variants) return variant ? `${entry.pageId}.${variant}` : null;
  return entry.pageId;
}

/** True for a route that was decided to have no Support (print views, pre-login pages) and for unknown paths. */
export const isExcluded = (pathname: string): boolean => findEntry(pathname)?.pageId === null;

export const isPlanned = (pageId: string): boolean => PLANNED_PAGES.includes(pageId);

export const hasLoader = (pageId: string): boolean => Object.hasOwn(loaders, pageId);

export async function loadGuide(pageId: string): Promise<PageGuide | null> {
  if (!hasLoader(pageId)) return null;
  return (await loaders[pageId]()).default;
}
