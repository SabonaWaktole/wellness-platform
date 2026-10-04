/**
 * Seeds the Milestone 1 UAT users and data into the Wellness Albania
 * workspace (deploy/uat-milestone-1.md). Run after `seed:wellness`.
 *
 * Starts the real app on an ephemeral local port and writes everything
 * through its API as the workspace's Administrator, so the data passes the
 * same validation, permission checks and audit trail as anything a person
 * enters. Idempotent: run it again at any time and only what is missing is
 * created.
 *
 * Usage:
 *   npm run seed:uat -- --password '<pw for every UAT user>' \
 *     [--email-domain wellness-albania.al] [--companies 10000] [--deals 2000] [--follow-ups 5000] [--tenant wellness-albania]
 *
 *   --companies N  also creates bulk companies up to N in total, for the
 *                  NFR-PERF-01 measurement (npm run perf:staging).
 *   --deals N      also creates bulk open deals up to N in total over those
 *                  companies, for the NFR-PERF-03 board measurement (2000).
 *   --follow-ups N also creates bulk open follow-ups up to N in total over
 *                  those companies, for the NFR-PERF-03 calendar measurement
 *                  (5000).
 *
 * There is deliberately no default password.
 */
import { AddressInfo } from 'net';
import { prisma } from '../src/shared/infrastructure/prisma/client';
import { createApp } from '../src/main/app';
import { JwtTokenService } from '../src/auth/infrastructure/JwtTokenService';
import { WELLNESS_WORKSPACE } from '../src/tenant/domain/wellnessWorkspace';
import { seedUat, UAT_USERS } from './uat/seedUat';

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const password = argOf('password') ?? process.env.UAT_PASSWORD;
  if (!password) throw new Error('Pass --password (or UAT_PASSWORD) — there is no default.');
  const tenantSlug = argOf('tenant') ?? WELLNESS_WORKSPACE.urlSlug;
  const emailDomain = argOf('email-domain') ?? 'wellness-albania.al';

  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const result = await seedUat({
      prisma,
      tokenService: new JwtTokenService(),
      apiBase: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`,
      tenantSlug,
      password,
      emailDomain,
      bulkCompanies: Number(argOf('companies') ?? 0),
      bulkDeals: Number(argOf('deals') ?? 0),
      bulkFollowUps: Number(argOf('follow-ups') ?? 0),
      log: (line) => console.log(line),
    });

    console.log(`\nUAT users in /${tenantSlug} (password as given):`);
    for (const spec of UAT_USERS) {
      const user = result.users[spec.key];
      console.log(`  ${spec.roleKey.padEnd(14)} ${user.email}${user.created ? '' : '  (already existed)'}`);
    }
    console.log(`  ADMINISTRATOR  ${result.users.admin.email}  (the workspace owner)`);
    console.log(`\n${result.companiesCreated} UAT companies and ${result.bulkCreated} bulk companies created.`);
    console.log(`${result.dealsCreated} UAT deals and ${result.bulkDealsCreated} bulk deals created.`);
    console.log(`${result.bulkFollowUpsCreated} bulk follow-ups created.`);
  } finally {
    server.close();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
