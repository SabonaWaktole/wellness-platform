/**
 * Fills the Wellness Albania workspace with realistic mock data for a demo or
 * a test environment: staff for every role, thirty businesses with their
 * contacts, deals at every stage, activities and follow-ups, priced offers,
 * contracts with instalments and receipts, renewals, and Wellness+ members
 * with families, payments, VIP requests and card checks.
 *
 * Every record is written through the real HTTP API as a real user, so the app
 * itself calculates prices, numbers, dates, history and audit entries. A few
 * plain columns the API does not expose (profile details, who last edited
 * something) are filled directly. Run `seed:wellness` first.
 *
 * Usage:
 *   npm run seed:mock -- --password '<pw for every user>' [--tenant wellness-albania] [--email-domain wellness-albania.al]
 *
 * Refuses to run on a workspace that already has companies, so it cannot be
 * run twice by accident. There is deliberately no default password.
 */
import { AddressInfo } from 'net';
import { prisma } from '../src/shared/infrastructure/prisma/client';
import { createApp } from '../src/main/app';
import { JwtTokenService } from '../src/auth/infrastructure/JwtTokenService';
import { UserRole } from '../src/auth/domain/enums/UserRole';
import { WELLNESS_WORKSPACE } from '../src/tenant/domain/wellnessWorkspace';
import { NotificationSettings } from '../src/notifications/domain/NotificationSettings';
import { PrismaNotificationSettingsRepository } from '../src/notifications/infrastructure/PrismaNotificationSettingsRepository';
import { ADMIN_PROFILE, COMPANIES, COORDINATOR, OFFER_LETTERHEAD, STAFF, TENANT_PROFILE, UserKey } from './mock/dataset';
import { seedCommercial } from './mock/commercial';
import { seedExtras } from './mock/extras';
import { seedMembers } from './mock/members';
import { Api, Ctx, Rng, Users } from './mock/support';

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const password = argOf('password') ?? process.env.MOCK_PASSWORD;
  if (!password) throw new Error('Pass --password (or MOCK_PASSWORD) — there is no default.');
  const tenantSlug = argOf('tenant') ?? WELLNESS_WORKSPACE.urlSlug;
  const emailDomain = argOf('email-domain') ?? 'wellness-albania.al';
  const log = (line: string) => console.log(line);

  const tenant = await prisma.tenant.findUnique({ where: { urlSlug: tenantSlug } });
  if (!tenant) throw new Error(`No workspace at /${tenantSlug} — run seed:wellness first.`);
  const tenantId = tenant.id;
  if ((await prisma.client.count({ where: { tenantId } })) > 0) {
    throw new Error(`/${tenantSlug} already has companies; seed:mock only fills an empty workspace.`);
  }

  const tokenService = new JwtTokenService();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const apiBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  try {
    const roles = await prisma.role.findMany({ where: { tenantId, isSystem: true } });
    const roleId = (key: string) => {
      const role = roles.find((r) => r.key === key);
      if (!role) throw new Error(`The workspace has no ${key} role.`);
      return role.id;
    };
    const admin = await prisma.user.findFirstOrThrow({ where: { tenantId, roleId: roleId('ADMINISTRATOR'), deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const tokenFor = (user: { id: string; role: string; warehouseId: string | null }) =>
      tokenService.sign({ userId: user.id, role: user.role as UserRole, tenantId, tenantSlug, warehouseId: user.warehouseId });
    const adminApi = new Api(apiBase, tenantSlug, tokenFor(admin));

    // --- Staff: one user per role, every profile field filled --------------
    await prisma.user.update({ where: { id: admin.id }, data: { ...ADMIN_PROFILE } });
    const users = { admin: { id: admin.id, email: admin.email, api: adminApi } } as unknown as Users;
    for (const spec of STAFF) {
      const email = `${spec.local}@${emailDomain}`;
      const created = await adminApi.call('POST', '/auth/users', {
        email, password, roleId: roleId(spec.roleKey), firstName: spec.firstName, lastName: spec.lastName,
      });
      await prisma.user.update({ where: { id: created.user.id }, data: { phone: spec.phone, language: spec.language } });
      const row = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id } });
      users[spec.key as UserKey] = { id: row.id, email, api: new Api(apiBase, tenantSlug, tokenFor(row)) };
      log(`user      + ${email} (${spec.roleKey})`);
    }
    // A Wellness+ coordinator: a custom role copied from Reception with the member permissions added.
    await adminApi.call('POST', `/roles/${roleId('RECEPTION')}/copy`, { nameSq: COORDINATOR.roleNameSq, nameEn: COORDINATOR.roleNameEn });
    const coordinatorRole = await prisma.role.findFirstOrThrow({ where: { tenantId, nameEn: COORDINATOR.roleNameEn } });
    const granted = (await prisma.rolePermission.findMany({ where: { roleId: coordinatorRole.id } })).map((p) => ({ key: p.permissionKey, scope: p.scope }));
    for (const key of ['members.view', 'members.manage', 'members.payments.view', 'members.payments.record']) {
      if (!granted.some((g) => g.key === key)) granted.push({ key, scope: null });
    }
    await adminApi.call('PUT', `/roles/${coordinatorRole.id}/permissions`, { permissions: granted });
    const coordinator = await adminApi.call('POST', '/auth/users', {
      email: `${COORDINATOR.local}@${emailDomain}`, password, roleId: coordinatorRole.id, firstName: COORDINATOR.firstName, lastName: COORDINATOR.lastName,
    });
    await prisma.user.update({ where: { id: coordinator.user.id }, data: { phone: COORDINATOR.phone, language: COORDINATOR.language } });
    const coordinatorRow = await prisma.user.findUniqueOrThrow({ where: { id: coordinator.user.id } });
    users.coordinator = { id: coordinatorRow.id, email: coordinatorRow.email, api: new Api(apiBase, tenantSlug, tokenFor(coordinatorRow)) };
    log(`user      + ${coordinatorRow.email} (${COORDINATOR.roleNameEn}, a custom role)`);
    // A custom role copied from Sales User, so a custom role (with its base) exists too.
    await adminApi.call('POST', `/roles/${roleId('SALES_USER')}/copy`, { nameSq: 'Shitës i ri', nameEn: 'Junior Sales' });
    log('role      + Junior Sales (copied from Sales User)');

    // --- Workspace details the settings screens show ------------------------
    await prisma.tenant.update({ where: { id: tenantId }, data: { ...TENANT_PROFILE, clientFormSeededAt: tenant.clientFormSeededAt ?? new Date() } });
    await prisma.pricingSettings.update({ where: { tenantId }, data: { ...OFFER_LETTERHEAD } });
    await prisma.salesScript.updateMany({ where: { tenantId }, data: { createdByUserId: admin.id, publishedByUserId: admin.id } });
    await prisma.tierSetting.updateMany({ where: { tenantId }, data: { updatedByUserId: admin.id } });
    await prisma.membershipSettings.updateMany({ where: { tenantId }, data: { updatedByUserId: admin.id } });
    await prisma.contractSettings.upsert({
      where: { tenantId },
      create: { tenantId, updatedByUserId: admin.id } as any,
      update: { updatedByUserId: admin.id },
    });
    await prisma.salesSettings.upsert({ where: { tenantId }, create: { tenantId } as any, update: {} });
    // Email is off until the owner turns it on, so this row is the defaults as they are.
    await new PrismaNotificationSettingsRepository().save(NotificationSettings.defaults(tenantId));
    log('settings  + workspace details, offer letterhead, notification defaults');

    const ctx: Ctx = { prisma, tenantId, tenantSlug, apiBase, password, emailDomain, users, rng: new Rng(20261013), log, tokenFor };
    await seedCommercial(ctx, COMPANIES);
    await seedMembers(ctx);
    await seedExtras(ctx);

    console.log(`\nDone. Everyone signs in at /${tenantSlug}/login with the password you passed:`);
    console.log(`  ADMINISTRATOR  ${admin.email}`);
    for (const spec of STAFF) console.log(`  ${spec.roleKey.padEnd(14)} ${spec.local}@${emailDomain}`);
    console.log(`  ${'COORDINATOR'.padEnd(14)} ${COORDINATOR.local}@${emailDomain}  (Wellness+ Coordinator)`);
  } finally {
    server.close();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
