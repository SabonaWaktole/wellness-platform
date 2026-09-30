/**
 * NFR-PERF-01 on a real deployment: signs in against a running API and times
 * the Milestone 1 company queries, printing p50/p95 per query. Exits 1 if any
 * p95 is 1 s or more. Read-only: it only issues GET requests after signing in.
 *
 * Seed the target first (`npm run seed:uat -- --companies 10000`) so the
 * numbers are taken at the SRS figure of 10,000 companies.
 *
 * Usage:
 *   npm run perf:staging -- --api https://api.example.com/api --tenant wellness-albania \
 *     --email <user> --password <pw> [--runs 20]
 */
const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const BUDGET_MS = 1000;

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

  const queries: Array<[string, string]> = [
    ['session (/auth/me)', '/auth/me'],
    ['company list, first page', `/${tenant}/clients/search`],
    ['text search', `/${tenant}/clients/search?search=Company`],
    ['contact phone search', `/${tenant}/clients/search?search=%2B3556`],
    ['needs-completion filter', `/${tenant}/clients/search?needsCompletion=true`],
  ];
  if (businessTypes.data?.[0]) queries.push(['business type filter', `/${tenant}/clients/search?businessTypeId=${businessTypes.data[0].id}`]);
  if (areas.data?.[0]) queries.push(['area filter', `/${tenant}/clients/search?areaId=${areas.data[0].id}`]);

  let failed = false;
  console.log(`${runs} runs per query against ${api} (${tenant}), budget ${BUDGET_MS} ms at p95\n`);
  console.log(`${'query'.padEnd(28)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)}  total`);
  for (const [label, path] of queries) {
    const samples: number[] = [];
    let total: unknown = '';
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      const res = await get(path);
      const body = (await res.json()) as { total?: number };
      samples.push(performance.now() - start);
      if (!res.ok) throw new Error(`${label}: ${res.status} ${JSON.stringify(body)}`);
      total = body.total ?? '';
    }
    const p95 = percentile(samples, 0.95);
    if (p95 >= BUDGET_MS) failed = true;
    console.log(
      `${label.padEnd(28)} ${percentile(samples, 0.5).toFixed(0).padStart(8)} ${p95.toFixed(0).padStart(8)}  ${total}${p95 >= BUDGET_MS ? '  OVER BUDGET' : ''}`
    );
  }

  if (failed) {
    console.log('\nAt least one query is over the NFR-PERF-01 budget.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
