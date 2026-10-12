import type { RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from '../../routes';
import { loaders } from './pageRegistry';
import { PLANNED_PAGES, ROUTE_MAP, type RouteMapEntry } from './routeMap';

/**
 * The keys `ROUTE_MAP` uses for the router's leaf routes: top level paths as written
 * (`/login`), and the tenant shell's children relative to it (`clients/:clientId`, and
 * the empty string for the index route).
 */
function leafPatterns(table: RouteObject[]): string[] {
  return table.flatMap((route) => {
    const own = route.index ? '' : (route.path ?? '');
    if (route.children) return leafPatterns(route.children);
    return [own];
  });
}

/** Routes that have no entry in the map, in the words a failing test should use. */
function unmapped(patterns: string[], map: RouteMapEntry[]): string[] {
  const known = new Set(map.map((entry) => entry.pattern));
  return patterns.filter((pattern) => !known.has(pattern)).map((pattern) => `route "${pattern}" is neither mapped nor excluded in routeMap.ts`);
}

/** Entries that point at a route the router no longer has. */
function orphans(patterns: string[], map: RouteMapEntry[]): string[] {
  const live = new Set(patterns);
  return map.filter((entry) => !live.has(entry.pattern)).map((entry) => `routeMap.ts entry "${entry.pattern}" matches no route`);
}

describe('SUP-20 every route is mapped to a page or excluded with a reason', () => {
  const patterns = leafPatterns(routes);

  it('SUP-20 the walker finds the router (a non-empty, duplicate free list)', () => {
    expect(patterns.length).toBeGreaterThan(60);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('SUP-20 every path in the router is mapped or excluded', () => {
    expect(unmapped(patterns, ROUTE_MAP)).toEqual([]);
  });

  it('SUP-20 no entry refers to a route that no longer exists', () => {
    expect(orphans(patterns, ROUTE_MAP)).toEqual([]);
  });

  it('SUP-20 a route added without a decision fails with a message naming it', () => {
    const withNewRoute = [...patterns, 'brand-new-screen/:id'];
    expect(unmapped(withNewRoute, ROUTE_MAP)).toEqual([
      'route "brand-new-screen/:id" is neither mapped nor excluded in routeMap.ts',
    ]);
  });

  it('SUP-20 a removed route leaves an orphan that fails with a message naming it', () => {
    const withoutOne = patterns.filter((pattern) => pattern !== 'renewals');
    expect(orphans(withoutOne, ROUTE_MAP)).toEqual(['routeMap.ts entry "renewals" matches no route']);
  });

  it('SUP-20 every exclusion says why', () => {
    for (const entry of ROUTE_MAP.filter((e) => e.pageId === null)) {
      expect(entry.reason, `${entry.pattern} needs a reason`).toBeTruthy();
    }
  });

  it('SUP-20 every mapped page id has a guide loader or is planned', () => {
    const known = new Set([...Object.keys(loaders), ...PLANNED_PAGES]);
    const missing = ROUTE_MAP.filter((entry) => entry.pageId !== null)
      .filter((entry) =>
        entry.variants ? ![...known].some((id) => id.startsWith(`${entry.pageId}.`)) : !known.has(entry.pageId as string),
      )
      .map((entry) => `${entry.pattern} -> ${entry.pageId}`);
    expect(missing).toEqual([]);
  });

  it('SUP-20 a page is planned or loaded, never both', () => {
    expect(PLANNED_PAGES.filter((id) => id in loaders)).toEqual([]);
  });

  it('SUP-20 the planned list has no duplicates', () => {
    expect(new Set(PLANNED_PAGES).size).toBe(PLANNED_PAGES.length);
  });

  // Each page slice deletes its own id from PLANNED_PAGES; the last page slice empties it and makes this a real test.
  it.todo('SUP-20 no planned pages remain');
});
