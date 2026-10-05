import { execFileSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { NOTIFICATION_TYPES } from '../../../src/notifications/domain/NotificationType';

const repo = resolve(__dirname, '../../../..');
const read = (...parts: string[]) => readFileSync(join(repo, ...parts), 'utf8');
const locale = (language: 'sq' | 'en', file: string) => JSON.parse(read('frontend', 'src', 'locales', language, `${file}.json`)) as Record<string, unknown>;

/** `a.b.c` for every string in a catalogue. */
function flatten(value: unknown, prefix = '', into: Record<string, string> = {}): Record<string, string> {
  if (typeof value === 'string') into[prefix] = value;
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, into);
  return into;
}
const placeholders = (text: string) => [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();

/** The namespaces Milestone 3 added or extended. */
const M3_NAMESPACES = ['contracts', 'payments', 'renewals', 'performance', 'dashboard', 'notifications', 'audit', 'settings', 'common'];

describe('NFR-I18N-03 Milestone 3 text exists in sq and en', () => {
  it.each(M3_NAMESPACES)('NFR-I18N-03 %s has the same keys and the same {{placeholders}} in sq and en', (namespace) => {
    const en = flatten(locale('en', namespace));
    const sq = flatten(locale('sq', namespace));
    expect(Object.keys(sq).sort()).toEqual(Object.keys(en).sort());
    const mismatched = Object.keys(en).filter((key) => placeholders(en[key]).join() !== placeholders(sq[key]).join());
    expect(mismatched).toEqual([]);
    const blank = Object.keys(sq).filter((key) => sq[key].trim() === '');
    expect(blank).toEqual([]);
  });

  it('NFR-I18N-03 every notification type, the Milestone 3 ones included, has a sentence in sq and en', () => {
    const en = (locale('en', 'notifications').type ?? {}) as Record<string, string>;
    const sq = (locale('sq', 'notifications').type ?? {}) as Record<string, string>;
    expect(NOTIFICATION_TYPES.filter((type) => !en[type])).toEqual([]);
    expect(NOTIFICATION_TYPES.filter((type) => !sq[type])).toEqual([]);
    for (const type of ['CONTRACT_EXPIRING', 'CONTRACT_EXPIRED', 'PAYMENT_OVERDUE']) expect(NOTIFICATION_TYPES).toContain(type);
  });

  it('NFR-I18N-03 npm run check:translations passes', () => {
    expect(() => execFileSync('node', ['scripts/check-translations.mjs'], { cwd: join(repo, 'frontend'), stdio: 'pipe' })).not.toThrow();
  });

  it('NFR-I18N-03 the two languages have the same set of catalogues', () => {
    const files = (language: string) => readdirSync(join(repo, 'frontend', 'src', 'locales', language)).filter((name) => name.endsWith('.json') && !name.includes('reviewed')).sort();
    expect(files('sq')).toEqual(files('en'));
  });
});

/** `FR-DSH-11, 12, 13` and `FR-PRF-01..10` count for every ID they name, as in check-traceability.mjs. */
function idsIn(text: string): string[] {
  const ids: string[] = [];
  for (const [, prefix, first, rest] of text.matchAll(/\b((?:NFR|FR)-[A-Z0-9]+)-(\d{2})((?:\s*(?:,|\.\.)\s*\d{2}\b)*)/g)) {
    let previous = Number(first);
    ids.push(`${prefix}-${first}`);
    for (const [, separator, number] of rest.matchAll(/(,|\.\.)\s*(\d{2})/g)) {
      const n = Number(number);
      for (let i = separator === '..' ? previous + 1 : n; i <= n; i++) ids.push(`${prefix}-${String(i).padStart(2, '0')}`);
      previous = n;
    }
  }
  return ids;
}

describe('NFR-MNT-03 the Milestone 3 requirement IDs are in the traceability list', () => {
  const requirements = (JSON.parse(read('scripts', 'srs-requirements.json')) as { requirements: Array<{ id: string; priority: string }> }).requirements;

  it('NFR-MNT-03 every ID the plan gives a slice is in scripts/srs-requirements.json, once', () => {
    const plan = read('docs', 'milestone-3-implementation-plan.md');
    const named = new Set(plan.split('\n').filter((line) => line.startsWith('**Requirements:**')).flatMap(idsIn));
    expect(named.size).toBeGreaterThan(80);
    const listed = requirements.map((r) => r.id);
    // The plan names a few IDs for context only (verified, not added), and a few as "FR-AUD-11, 12, 13".
    expect([...named].filter((id) => !listed.includes(id))).toEqual([]);
    expect(listed.filter((id, i) => listed.indexOf(id) !== i)).toEqual([]);
  });

  it('NFR-MNT-03 the traceability check passes: every Must requirement is named in a test title', () => {
    expect(() => execFileSync('node', ['scripts/check-traceability.mjs'], { cwd: repo, stdio: 'pipe' })).not.toThrow();
  });

  it('NFR-MNT-03 the SRS Must IDs of Milestone 3 are Must in the list', () => {
    const priority = (id: string) => requirements.find((r) => r.id === id)?.priority;
    for (const id of ['NFR-USE-03', 'NFR-I18N-03', 'NFR-MNT-03', 'NFR-SEC-06', 'FR-RBAC-21', 'FR-DSH-12']) expect(priority(id)).toBe('Must');
  });
});
