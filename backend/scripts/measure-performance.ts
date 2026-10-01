/**
 * NFR-PERF-01 and NFR-PERF-03 on a real deployment: signs in against a
 * running API and times the Milestone 1 company queries (budget 1 s) and the
 * Milestone 2 pipeline board and deal list (budget 2 s), printing p50/p95 per
 * query. Exits 1 if any p95 reaches its budget. Read-only: it only issues GET
 * requests after signing in.
 *
 * Seed the target first (`npm run seed:uat -- --companies 10000 --deals 2000`)
 * so the numbers are taken at the SRS figures of 10,000 companies and 2,000
 * open deals. Sign in as a user who sees every deal (the Administrator).
 *
 * Usage:
 *   npm run perf:staging -- --api https://api.example.com/api --tenant wellness-albania \
 *     --email <user> --password <pw> [--runs 20]
 */
const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

/** NFR-PERF-01: company search and filters. */
const COMPANY_BUDGET_MS = 1000;
/** NFR-PERF-03: the pipeline board (the calendar joins it in Slice 12). */
const PIPELINE_BUDGET_MS = 2000;

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

async function main(): Promise<void> {
  const api = argOf('api')?.replace(/\/$/, '');
  const tenant = argOf('tenant');
  const email = argOf('email') ?? process.env.PERF_EMAIL;
  const password = argOf('password') ?? process.env.PERF_PASSWORD;
  const runs = Number(argOf('runs') ?? 20);
  if (!api || !tenant || !email || !password) {
    throw new Error('Usage: --api <base url ending in /api> --tenant <slug> --email <user> --password <pw> [--runs 20]');
  }

  const login = await fetch(`${api}/${tenant}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Sign-in failed: ${login.status} ${await login.text()}`);
  const jwt = login.headers.getSetCookie().find((c) => c.startsWith('jwt='))?.split(';')[0];
  if (!jwt) throw new Error('Sign-in did not set the jwt cookie.');

  const get = (path: string) => fetch(`${api}${path}`, { headers: { Cookie: jwt } });

  const businessTypes = (await (await get(`/${tenant}/lookups/business-types`)).json()) as { data: { id: string }[] };
  const areas = (await (await get(`/${tenant}/lookups/areas`)).json()) as { data: { id: string }[] };

  const queries: Array<[string, string, number]> = [
    ['session (/auth/me)', '/auth/me', COMPANY_BUDGET_MS],
    ['company list, first page', `/${tenant}/clients/search`, COMPANY_BUDGET_MS],
    ['text search', `/${tenant}/clients/search?search=Company`, COMPANY_BUDGET_MS],
    ['contact phone search', `/${tenant}/clients/search?search=%2B3556`, COMPANY_BUDGET_MS],
    ['needs-completion filter', `/${tenant}/clients/search?needsCompletion=true`, COMPANY_BUDGET_MS],
  ];
  if (businessTypes.data?.[0]) {
    queries.push(['business type filter', `/${tenant}/clients/search?businessTypeId=${businessTypes.data[0].id}`, COMPANY_BUDGET_MS]);
  }
  if (areas.data?.[0]) queries.push(['area filter', `/${tenant}/clients/search?areaId=${areas.data[0].id}`, COMPANY_BUDGET_MS]);
  queries.push(
    ['pipeline board', `/${tenant}/deals/board`, PIPELINE_BUDGET_MS],
    ['deal list, first page', `/${tenant}/deals`, PIPELINE_BUDGET_MS],
    ['deal list, one stage', `/${tenant}/deals?stage=NEGOTIATION`, PIPELINE_BUDGET_MS]
  );

  let failed = false;
  console.log(`${runs} runs per query against ${api} (${tenant}), budgets at p95\n`);
  console.log(`${'query'.padEnd(28)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'budget'.padStart(7)}  total`);
  for (const [label, path, budget] of queries) {
    const samples: number[] = [];
    let total: unknown = '';
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      const res = await get(path);
      const body = (await res.json()) as { total?: number; data?: { total?: number } };
      samples.push(performance.now() - start);
      if (!res.ok) throw new Error(`${label}: ${res.status} ${JSON.stringify(body)}`);
      total = body.total ?? body.data?.total ?? '';
    }
    const p95 = percentile(samples, 0.95);
    if (p95 >= budget) failed = true;
    console.log(
      `${label.padEnd(28)} ${percentile(samples, 0.5).toFixed(0).padStart(8)} ${p95.toFixed(0).padStart(8)} ${String(budget).padStart(7)}  ${total}${p95 >= budget ? '  OVER BUDGET' : ''}`
    );
  }

  if (failed) {
    console.log('\nAt least one query is over its budget (NFR-PERF-01 or NFR-PERF-03).');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
