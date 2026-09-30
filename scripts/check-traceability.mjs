#!/usr/bin/env node
/**
 * Requirement traceability check (NFR-MNT-01: "tests exist for every Must
 * requirement").
 *
 * Reads the SRS requirement list (scripts/srs-requirements.json) and every
 * test title in the backend and frontend — `describe(`, `it(`, `test(` and
 * `.each(...)(` lines — and fails when a Must requirement's ID appears in no
 * title. Should and Could requirements without a test are listed as
 * warnings. Titles may use the plan's shorthand: `FR-CMP-01, 02, 03` and
 * `FR-RBAC-11..13` both count for every ID they name.
 *
 * Usage:
 *   node scripts/check-traceability.mjs          exit 1 if a Must ID is untested
 *   node scripts/check-traceability.mjs --list   also print where each ID is tested
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH_ROOTS = ['backend/tests', 'backend/src', 'frontend/src', 'frontend/tests/e2e'];
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mjs|js)$/;
const TITLE_LINE = /\b(?:describe|it|test)(?:\.\w+)*\s*\(|\.each\s*\(/;
const ID_WITH_SHORTHAND = /\b((?:NFR|FR)-[A-Z0-9]+)-(\d{2})((?:\s*(?:,|\.\.)\s*\d{2}\b)*)/g;

const { requirements } = JSON.parse(readFileSync(join(repo, 'scripts', 'srs-requirements.json'), 'utf8'));

function* testFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* testFiles(path);
    else if (TEST_FILE.test(name)) yield path;
  }
}

/** Every ID a title line names, with `, 02` and `..13` shorthand expanded. */
function idsIn(line) {
  const ids = [];
  for (const [, prefix, first, rest] of line.matchAll(ID_WITH_SHORTHAND)) {
    let previous = Number(first);
    ids.push(`${prefix}-${first}`);
    for (const [, separator, number] of rest.matchAll(/(,|\.\.)\s*(\d{2})/g)) {
      const n = Number(number);
      const from = separator === '..' ? previous + 1 : n;
      for (let i = from; i <= n; i++) ids.push(`${prefix}-${String(i).padStart(2, '0')}`);
      previous = n;
    }
  }
  return ids;
}

const testedIn = new Map();
let fileCount = 0;
for (const root of SEARCH_ROOTS) {
  for (const file of testFiles(join(repo, root))) {
    fileCount++;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!TITLE_LINE.test(line)) continue;
      for (const id of idsIn(line)) {
        if (!testedIn.has(id)) testedIn.set(id, new Set());
        testedIn.get(id).add(relative(repo, file));
      }
    }
  }
}

const untested = (priority) => requirements.filter((r) => r.priority === priority && !testedIn.has(r.id));
const missingMust = untested('Must');
const warnings = [...untested('Should'), ...untested('Could')];
const covered = requirements.filter((r) => testedIn.has(r.id)).length;

console.log(`Traceability: ${covered} of ${requirements.length} SRS requirements are named in a test title (${fileCount} test files scanned).`);

if (process.argv.includes('--list')) {
  for (const r of requirements) {
    const files = [...(testedIn.get(r.id) ?? [])];
    console.log(`  ${r.id.padEnd(12)} ${r.priority.padEnd(6)} ${files.length ? files.join(', ') : '— none —'}`);
  }
}

for (const r of warnings) {
  console.log(`  warning: ${r.priority} requirement ${r.id} has no test naming it — ${r.requirement}`);
}

if (missingMust.length > 0) {
  for (const r of missingMust) {
    console.error(`  MISSING: Must requirement ${r.id} has no test naming it — ${r.requirement}`);
  }
  console.error(`\n${missingMust.length} Must requirement(s) untested (NFR-MNT-01). Name the covering test after the ID, e.g. it('${missingMust[0].id} …').`);
  process.exit(1);
}
console.log('Every Must requirement has at least one test (NFR-MNT-01).');
