import { expect, type Page, type Request } from '@playwright/test';

/**
 * The invariant of the Support tour (SUP-12): while a tour runs, nothing the user did not ask for changes data.
 * Watches the page's own API traffic and fails on any `POST`, `PUT`, `PATCH` or `DELETE`.
 *
 * Some read-only calls use POST (the pricing test calculator, the employee-upload preview). A page slice that
 * has one names it in `allow` and says so in its PR (risk R14); nothing is allowed by default.
 *
 *   const watch = expectNoMutations(page);
 *   ...start the tour, press Next to the end...
 *   watch.assert();
 */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface NoMutationsOptions {
  /** URL patterns (matched against the path) of read-only endpoints that happen to use a mutating method. */
  allow?: Array<string | RegExp>;
}

export interface MutationWatch {
  /** The mutating requests seen so far, as `METHOD /path`. */
  readonly seen: string[];
  /** Stops watching and fails if any mutating request was seen. */
  assert(): void;
}

const matches = (pattern: string | RegExp, path: string) => (typeof pattern === 'string' ? path.includes(pattern) : pattern.test(path));

export function expectNoMutations(page: Page, { allow = [] }: NoMutationsOptions = {}): MutationWatch {
  const seen: string[] = [];
  const onRequest = (request: Request) => {
    if (!MUTATING.has(request.method())) return;
    const { pathname } = new URL(request.url());
    if (!pathname.startsWith('/api/')) return;
    if (allow.some((pattern) => matches(pattern, pathname))) return;
    seen.push(`${request.method()} ${pathname}`);
  };
  page.on('request', onRequest);

  return {
    seen,
    assert() {
      page.off('request', onRequest);
      expect(seen, 'a Support tour must not change data').toEqual([]);
    },
  };
}
