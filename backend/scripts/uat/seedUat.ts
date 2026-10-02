import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { RoleKey } from '../../src/access/domain/RoleKey';
import { FieldRole } from '../../src/clients/domain/enums/FieldRole';
import { ClientStatus } from '../../src/clients/domain/enums/ClientStatus';
import { ITokenService } from '../../src/auth/application/ports/ITokenService';
import { UserRole } from '../../src/auth/domain/enums/UserRole';
import { OPEN_DEAL_STAGES } from '../../src/deals/domain/DealStage';

/**
 * The staging data Milestone 1 UAT runs on (deploy/uat-milestone-1.md): one
 * user per role, companies owned by each Sales User and unassigned ones, two
 * contacts each, and contracts, payments, notes and calls so every UAT step
 * has something to look at. Milestone 2 adds a New contract deal on each
 * company Sales User A or B owns (UAT-2), and bulk deals for the board's
 * NFR-PERF-03 measurement.
 *
 * Reads (roles, field definitions, lookups, what already exists) go through
 * Prisma. Every WRITE goes through the real HTTP API as the Administrator, so
 * seeded data passes the same validation, permission checks and audit trail
 * as data a person enters. Idempotent: users are matched by email and
 * companies by name, and only what is missing is created.
 */

export interface UatUserSpec {
  key: 'salesA' | 'salesB' | 'manager' | 'reception' | 'ceo' | 'roleChange' | 'leaver';
  local: string;
  firstName: string;
  lastName: string;
  roleKey: RoleKey;
}

export const UAT_USERS: UatUserSpec[] = [
  { key: 'salesA', local: 'uat.sales.a', firstName: 'Arta', lastName: 'Shitjet', roleKey: RoleKey.SalesUser },
  { key: 'salesB', local: 'uat.sales.b', firstName: 'Besnik', lastName: 'Shitjet', roleKey: RoleKey.SalesUser },
  { key: 'manager', local: 'uat.manager', firstName: 'Mira', lastName: 'Menaxhere', roleKey: RoleKey.SalesManager },
  { key: 'reception', local: 'uat.reception', firstName: 'Rea', lastName: 'Recepsioni', roleKey: RoleKey.Reception },
  { key: 'ceo', local: 'uat.ceo', firstName: 'Cela', lastName: 'Drejtore', roleKey: RoleKey.Ceo },
  // UAT-5 turns this user from Sales User into Reception (step 1) and
  // deactivates the next one with a reassignment (step 2), so the users UAT-1
  // relies on are never the ones disturbed.
  { key: 'roleChange', local: 'uat.rolechange', firstName: 'Dea', lastName: 'Ndryshim', roleKey: RoleKey.SalesUser },
  { key: 'leaver', local: 'uat.leaver', firstName: 'Leka', lastName: 'Largohet', roleKey: RoleKey.SalesUser },
];

type Owner = UatUserSpec['key'] | null;

interface UatCompanySpec {
  name: string;
  owner: Owner;
  businessType: string;
  area: string;
  city: string;
  employees: number;
  status: ClientStatus;
  /** Adds an active contract with a paid first payment (UAT-1: Reception must not see the amounts). */
  contract?: boolean;
}

export const UAT_COMPANIES: UatCompanySpec[] = [
  { name: 'UAT Kafe Blloku', owner: 'salesA', businessType: 'Kafene', area: 'Tiranë', city: 'Tiranë', employees: 8, status: ClientStatus.CLIENT, contract: true },
  { name: 'UAT Qendra e Thirrjeve Arta', owner: 'salesA', businessType: 'Qendër thirrjesh', area: 'Tiranë', city: 'Tiranë', employees: 120, status: ClientStatus.PROSPECT },
  { name: 'UAT Fabrika Durrës', owner: 'salesB', businessType: 'Fabrikë', area: 'Durrës', city: 'Durrës', employees: 300, status: ClientStatus.CLIENT, contract: true },
  { name: 'UAT Kafe Plazhi', owner: 'salesB', businessType: 'Kafene', area: 'Durrës', city: 'Durrës', employees: 6, status: ClientStatus.LEAD },
  { name: 'UAT Klienti pa Shitës', owner: null, businessType: 'Kafene', area: 'Tiranë', city: 'Tiranë', employees: 12, status: ClientStatus.LEAD },
  { name: 'UAT Fabrika e Largimit', owner: 'leaver', businessType: 'Fabrikë', area: 'Tiranë', city: 'Tiranë', employees: 80, status: ClientStatus.PROSPECT },
  { name: 'UAT Qendra e Largimit', owner: 'leaver', businessType: 'Qendër thirrjesh', area: 'Durrës', city: 'Durrës', employees: 45, status: ClientStatus.LEAD },
];

export const BULK_PREFIX = 'UAT Bulk Company ';
export const BULK_DEAL_PREFIX = 'UAT Bulk Deal ';

/** The salespeople whose named companies get a seeded deal; the leaver's are left to UAT-5. */
const DEAL_OWNERS: ReadonlyArray<Owner> = ['salesA', 'salesB'];

export interface SeedUatOptions {
  prisma: PrismaClient;
  tokenService: ITokenService;
  /** The API root the app listens on, e.g. `http://127.0.0.1:40123/api`. */
  apiBase: string;
  tenantSlug: string;
  password: string;
  emailDomain: string;
  /** Total bulk companies wanted for the NFR-PERF-01 measurement; 0 for none. */
  bulkCompanies: number;
  /** Total bulk deals wanted for the NFR-PERF-03 board measurement, spread over the bulk companies; 0 for none. */
  bulkDeals?: number;
  log?: (line: string) => void;
}

export interface SeedUatResult {
  users: Record<UatUserSpec['key'] | 'admin', { id: string; email: string; created: boolean }>;
  companiesCreated: number;
  bulkCreated: number;
  dealsCreated: number;
  bulkDealsCreated: number;
}

class Api {
  constructor(private readonly base: string, private readonly slug: string, private readonly token: string) {}

  async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}/${this.slug}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
    return json as T;
  }
}

function byName<T extends { nameSq: string }>(items: T[], name: string, what: string): T {
  const found = items.find((item) => item.nameSq === name);
  if (!found) throw new Error(`No ${what} named "${name}" — run the lookup seed (seed:wellness) first.`);
  return found;
}

export async function seedUat(options: SeedUatOptions): Promise<SeedUatResult> {
  const { prisma, tenantSlug, emailDomain } = options;
  const log = options.log ?? (() => {});

  const tenant = await prisma.tenant.findUnique({ where: { urlSlug: tenantSlug } });
  if (!tenant) throw new Error(`No workspace at /${tenantSlug} — run seed:wellness first.`);
  const tenantId = tenant.id;

  const roles = await prisma.role.findMany({ where: { tenantId, isSystem: true } });
  const roleId = (key: RoleKey) => {
    const role = roles.find((r) => r.key === key);
    if (!role) throw new Error(`The workspace has no ${key} role.`);
    return role.id;
  };

  const admin = await prisma.user.findFirst({
    where: { tenantId, roleId: roleId(RoleKey.Administrator), isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('The workspace has no active Administrator — run seed:wellness with --owner-email first.');

  const token = options.tokenService.sign({
    userId: admin.id,
    role: admin.role as UserRole,
    tenantId,
    tenantSlug,
    warehouseId: admin.warehouseId,
  });
  const api = new Api(options.apiBase, tenantSlug, token);

  // --- Users -------------------------------------------------------------
  const users = { admin: { id: admin.id, email: admin.email, created: false } } as SeedUatResult['users'];
  for (const spec of UAT_USERS) {
    const email = `${spec.local}@${emailDomain}`;
    const existing = await prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) {
      users[spec.key] = { id: existing.id, email, created: false };
      continue;
    }
    const created = await api.call('POST', '/auth/users', {
      email,
      password: options.password,
      roleId: roleId(spec.roleKey),
      firstName: spec.firstName,
      lastName: spec.lastName,
    });
    users[spec.key] = { id: created.user.id, email, created: true };
    log(`user  + ${email} (${spec.roleKey})`);
  }

  // --- Lookups and client field names -----------------------------------
  const [businessTypes, areas, cities, fieldDefs] = await Promise.all([
    prisma.businessType.findMany({ where: { tenantId, active: true } }),
    prisma.area.findMany({ where: { tenantId, active: true } }),
    prisma.city.findMany({ where: { tenantId, active: true } }),
    prisma.customFieldDefinition.findMany({ where: { tenantId } }),
  ]);
  // The seeded calls' result (FR-ACT-02): the workspace's first active one.
  const callResult = await prisma.activityResult.findFirstOrThrow({ where: { tenantId, active: true }, orderBy: { order: 'asc' } });
  const fieldName = (role: FieldRole) => fieldDefs.find((f) => f.role === role)?.fieldName;
  const nameField = fieldName(FieldRole.PRIMARY_NAME) ?? 'Name';
  const statusField = fieldName(FieldRole.STATUS) ?? 'Status';
  const assigneeField = fieldName(FieldRole.ASSIGNEE) ?? 'Assigned To';

  const profileFor = (spec: Pick<UatCompanySpec, 'businessType' | 'area' | 'city' | 'employees'>) => {
    const area = byName(areas, spec.area, 'area');
    const city = byName(cities.filter((c) => c.areaId === area.id), spec.city, `city in ${spec.area}`);
    return {
      businessTypeId: byName(businessTypes, spec.businessType, 'business type').id,
      employeeCount: spec.employees,
      areaId: area.id,
      cityId: city.id,
      streetAddress: 'Rruga e Kavajës 1',
    };
  };

  // --- Named UAT companies ----------------------------------------------
  let companiesCreated = 0;
  for (const [index, spec] of UAT_COMPANIES.entries()) {
    const existing = await prisma.client.findFirst({ where: { tenantId, name: spec.name, deletedAt: null } });
    if (existing) continue;

    const ownerId = spec.owner ? users[spec.owner].id : null;
    const phoneBase = 690000000 + index * 10;
    const company = await api.call('POST', '/clients', {
      customFieldValues: {
        [nameField]: spec.name,
        [statusField]: spec.status,
        ...(ownerId ? { [assigneeField]: ownerId } : {}),
      },
      profile: profileFor(spec),
      contacts: [
        { name: `Drejtori ${spec.name.replace('UAT ', '')}`, position: 'Drejtor', phone: `+355${phoneBase + 1}`, email: `drejtori.${index}@uat.example.com`, isPrimary: true },
        { name: `Administratorja ${spec.name.replace('UAT ', '')}`, position: 'Administratore', phone: `+355${phoneBase + 2}`, email: `admin.${index}@uat.example.com` },
      ],
    });
    companiesCreated += 1;
    log(`company + ${spec.name}${spec.owner ? ` (${spec.owner})` : ' (unassigned)'}`);

    await api.call('POST', `/clients/${company.id}/interactions`, { channel: 'NOTE', content: 'Shënim UAT: klienti preferon takime në mëngjes.' });
    // A call names its contact person and its result (M2 Slice 7, FR-ACT-02).
    const primary = await prisma.contactPerson.findFirstOrThrow({ where: { tenantId, clientId: company.id, isPrimary: true, deletedAt: null } });
    await api.call('POST', `/clients/${company.id}/interactions`, {
      channel: 'CALL',
      content: 'Telefonatë UAT: u diskutua oferta vjetore.',
      contactPersonId: primary.id,
      resultId: callResult.id,
      clientFeedback: 'I interesuar për një ofertë vjetore.',
      nextAction: 'Dërgo ofertën.',
    });

    if (spec.contract) {
      const year = new Date().getFullYear();
      const contract = await api.call('POST', '/contracts', {
        clientId: company.id,
        planName: 'Paketa Wellness UAT',
        amount: 2400,
        billingPeriod: 'ANNUAL',
        startsAt: `${year}-01-01`,
        endsAt: `${year}-12-31`,
        assignedUserId: ownerId,
      });
      const contractId = contract.id;
      await api.call('POST', `/contracts/${contractId}/activate`, {});
      const added = await api.call('POST', `/contracts/${contractId}/payments`, { dueDate: `${year}-01-15`, amount: 2400 });
      await api.call('POST', `/contracts/${contractId}/payments/${added.payment.id}/record`, { action: 'PAY' });
    }
  }

  // --- One deal per salesperson's company (M2 Slice 6, UAT-2) -------------
  // Checked per company rather than per run, so a workspace seeded before
  // Milestone 2 gets its deals on the next run.
  let dealsCreated = 0;
  for (const spec of UAT_COMPANIES.filter((c) => DEAL_OWNERS.includes(c.owner))) {
    const company = await prisma.client.findFirst({ where: { tenantId, name: spec.name, deletedAt: null } });
    if (!company || (await prisma.deal.count({ where: { tenantId, clientId: company.id } })) > 0) continue;
    await api.call('POST', '/deals', { clientId: company.id, type: 'NEW_CONTRACT' });
    dealsCreated += 1;
    log(`deal + ${spec.name}`);
  }

  // --- Bulk companies for NFR-PERF-01 ------------------------------------
  let bulkCreated = 0;
  if (options.bulkCompanies > 0) {
    const have = await prisma.client.count({ where: { tenantId, name: { startsWith: BULK_PREFIX } } });
    const missing = options.bulkCompanies - have;
    if (missing > 0) {
      // Straight to the database: 10,000 API round trips would take far longer
      // than the measurement itself, and these rows exist only to be searched.
      const profile = profileFor({ businessType: 'Kafene', area: 'Tiranë', city: 'Tiranë', employees: 10 });
      const owners = [users.salesA.id, users.salesB.id, null];
      const now = new Date();
      const rows = Array.from({ length: missing }, (_, i) => {
        const n = have + i;
        return {
          id: randomUUID(),
          tenantId,
          name: `${BULK_PREFIX}${n}`,
          status: ClientStatus.PROSPECT,
          customFieldValues: {},
          ...profile,
          assignedUserId: owners[n % owners.length],
          lastUpdatedByUserId: admin.id,
          createdAt: now,
          updatedAt: now,
        };
      });
      for (let i = 0; i < rows.length; i += 2_000) {
        const batch = rows.slice(i, i + 2_000);
        await prisma.client.createMany({ data: batch });
        await prisma.contactPerson.createMany({
          data: batch.map((row, j) => ({
            id: randomUUID(),
            tenantId,
            clientId: row.id,
            name: `Kontakti ${have + i + j}`,
            phone: `+3556${String(have + i + j).padStart(8, '0')}`,
            isPrimary: true,
            createdAt: now,
            updatedAt: now,
          })),
        });
      }
      bulkCreated = missing;
      log(`bulk + ${missing} companies (now ${options.bulkCompanies})`);
    }
  }

  // --- Bulk deals for NFR-PERF-03 ---------------------------------------
  let bulkDealsCreated = 0;
  const wantedDeals = options.bulkDeals ?? 0;
  if (wantedDeals > 0) {
    const have = await prisma.deal.count({ where: { tenantId, title: { startsWith: BULK_DEAL_PREFIX } } });
    const missing = wantedDeals - have;
    const bulkCompanies = await prisma.client.findMany({
      where: { tenantId, name: { startsWith: BULK_PREFIX } },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    if (missing > 0 && bulkCompanies.length === 0) {
      throw new Error('Bulk deals need bulk companies: pass --companies as well.');
    }
    if (missing > 0) {
      // Straight to the database, like the bulk companies: open deals spread
      // over the open stages and both salespeople, each with its first
      // history row.
      const owners = [users.salesA.id, users.salesB.id];
      const now = new Date();
      const deals = Array.from({ length: missing }, (_, i) => {
        const n = have + i;
        return {
          id: randomUUID(),
          tenantId,
          clientId: bulkCompanies[n % bulkCompanies.length].id,
          ownerUserId: owners[n % owners.length],
          createdByUserId: admin.id,
          type: 'NEW_CONTRACT',
          title: `${BULK_DEAL_PREFIX}${n}`,
          stageKey: OPEN_DEAL_STAGES[n % OPEN_DEAL_STAGES.length],
          createdAt: now,
          updatedAt: now,
        };
      });
      for (let i = 0; i < deals.length; i += 2_000) {
        const batch = deals.slice(i, i + 2_000);
        await prisma.deal.createMany({ data: batch });
        await prisma.dealStageHistory.createMany({
          data: batch.map((deal) => ({
            id: randomUUID(),
            tenantId,
            dealId: deal.id,
            fromStage: null,
            toStage: deal.stageKey,
            changedByUserId: admin.id,
            at: now,
          })),
        });
      }
      bulkDealsCreated = missing;
      log(`bulk + ${missing} deals (now ${wantedDeals})`);
    }
  }

  return { users, companiesCreated, bulkCreated, dealsCreated, bulkDealsCreated };
}
