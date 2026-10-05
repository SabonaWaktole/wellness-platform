/**
 * NFR-PERF-01, 02 and 03 on a real deployment: signs in against a running
 * API and times the Milestone 1 company queries (budget 1 s), the Milestone 2
 * pipeline board and deal list and the calendar's month and day feeds
 * (budget 2 s), the pricing screen's calculation (budget 300 ms) and the offer PDF in
 * Albanian and English (budget 3 s), printing p50/p95 per query. Exits 1 if any p95
 * reaches its budget. Read-only: after signing in it issues GET requests and
 * the calculation, which stores nothing (FR-PRC-12).
 *
 * Seed the target first (`npm run seed:uat -- --companies 10000 --deals 2000`)
 * so the numbers are taken at the SRS figures of 10,000 companies and 2,000
 * open deals, and add `--follow-ups 5000` for the calendar. Sign in as a
 * user who sees every deal (the Administrator).
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
/** NFR-PERF-03: the pipeline board and the calendar's month feed. */
const PIPELINE_BUDGET_MS = 2000;
/** NFR-PERF-02: a price calculation. */
const CALCULATION_BUDGET_MS = 300;
/** NFR-PERF-02: an offer PDF. */
const PDF_BUDGET_MS = 3000;

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
  const post = (path: string, body: object) =>
    fetch(`${api}${path}`, { method: 'POST', headers: { Cookie: jwt, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const businessTypes = (await (await get(`/${tenant}/lookups/business-types`)).json()) as { data: { id: string }[] };
  const areas = (await (await get(`/${tenant}/lookups/areas`)).json()) as { data: { id: string }[] };

  /** Label, path, budget, and a body for the one POST (the calculation). */
  const queries: Array<[string, string, number, object?]> = [
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
  // The calendar's month view with its leading and trailing days, and a day with the overdue list
  // (M2 Slice 12). Seeded with `--follow-ups 5000`: thousands of items fall in and before these ranges.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const monthStart = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
  const monthEnd = new Date(startOfDay.getFullYear(), startOfDay.getMonth() + 1, 1);
  const range = (from: Date, to: Date) => `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  queries.push(
    ['calendar, month', `/${tenant}/calendar?${range(monthStart, monthEnd)}`, PIPELINE_BUDGET_MS],
    ['calendar, day + overdue', `/${tenant}/calendar?${range(startOfDay, new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000))}`, PIPELINE_BUDGET_MS]
  );
  // The Performance screen (M3 Slice 12, NFR-PERF-04): the table over a year with the comparison, and a
  // drill-down. Measured only for a user with Performance: view (the Sales Manager or the CEO).
  if ((await get(`/${tenant}/performance?preset=LAST_MONTH`)).ok) {
    queries.push(
      ['performance, this year', `/${tenant}/performance?preset=THIS_YEAR&compare=true`, PIPELINE_BUDGET_MS],
      ['performance, last month', `/${tenant}/performance?preset=LAST_MONTH`, PIPELINE_BUDGET_MS],
      ['performance, records', `/${tenant}/performance/records?preset=THIS_YEAR&indicator=CALLS&limit=50`, PIPELINE_BUDGET_MS]
    );
  } else {
    console.log('This user cannot view performance: the Performance screen is not measured. Sign in as the Sales Manager or the CEO.\n');
  }
  // The role dashboards (M3 Slices 13 and 14, NFR-PERF-04): the one that suits the user's role.
  for (const kind of ['sales-manager', 'sales-user', 'ceo', 'administrator']) {
    if ((await get(`/${tenant}/dashboard/${kind}?preset=THIS_MONTH`)).ok) {
      queries.push(
        [`dashboard ${kind}, this year`, `/${tenant}/dashboard/${kind}?preset=THIS_YEAR`, PIPELINE_BUDGET_MS],
        [`dashboard ${kind}, this month`, `/${tenant}/dashboard/${kind}?preset=THIS_MONTH`, PIPELINE_BUDGET_MS]
      );
    }
  }
  const deals = (await (await get(`/${tenant}/deals?pageSize=1`)).json()) as { data: { items: { id: string }[] } };
  const config = (await (await get(`/${tenant}/pricing/config`)).json()) as { data?: { frequencies?: { id: string }[] } };
  if (deals.data?.items?.[0]) {
    queries.push([
      'price calculation',
      `/${tenant}/pricing/calculate`,
      CALCULATION_BUDGET_MS,
      { dealId: deals.data.items[0].id, frequencyId: config.data?.frequencies?.[0]?.id },
    ]);
  }

  // The offer PDF (M2 Slice 9), in both languages, for the newest offer the user can see. Skipped
  // with a note when the workspace has no offer yet (draft one on a deal first).
  const offers = (await (await get(`/${tenant}/offers?pageSize=1`)).json()) as { items?: { id: string }[]; data?: { items?: { id: string }[] } };
  const offerId = (offers.items ?? offers.data?.items)?.[0]?.id;
  if (offerId) {
    for (const lang of ['sq', 'en']) {
      queries.push([`offer PDF (${lang})`, `/${tenant}/offers/${offerId}/pdf?lang=${lang}&disposition=inline`, PDF_BUDGET_MS]);
    }
  } else {
    console.log('No offer found: the offer PDF is not measured. Draft an offer on any deal and run again.\n');
  }

  let failed = false;
  console.log(`${runs} runs per query against ${api} (${tenant}), budgets at p95\n`);
  console.log(`${'query'.padEnd(28)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'budget'.padStart(7)}  total`);
  for (const [label, path, budget, body] of queries) {
    const samples: number[] = [];
    let total: unknown = '';
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      const res = await (body ? post(path, body) : get(path));
      if (label.startsWith('offer PDF')) {
        // A PDF, not JSON: time the whole download and show its size.
        const bytes = (await res.arrayBuffer()).byteLength;
        samples.push(performance.now() - start);
        if (!res.ok) throw new Error(`${label}: ${res.status}`);
        total = `${Math.round(bytes / 1024)} KB`;
        continue;
      }
      const json = (await res.json()) as { total?: number; data?: { total?: number; items?: unknown[] } };
      samples.push(performance.now() - start);
      if (!res.ok) throw new Error(`${label}: ${res.status} ${JSON.stringify(json)}`);
      total = json.total ?? json.data?.total ?? json.data?.items?.length ?? '';
    }
    const p95 = percentile(samples, 0.95);
    if (p95 >= budget) failed = true;
    console.log(
      `${label.padEnd(28)} ${percentile(samples, 0.5).toFixed(0).padStart(8)} ${p95.toFixed(0).padStart(8)} ${String(budget).padStart(7)}  ${total}${p95 >= budget ? '  OVER BUDGET' : ''}`
    );
  }

  if (failed) {
    console.log('\nAt least one query is over its budget (NFR-PERF-01, 02 or 03).');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
