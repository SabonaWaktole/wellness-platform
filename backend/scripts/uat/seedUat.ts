import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { RoleKey } from '../../src/access/domain/RoleKey';
import { FieldRole } from '../../src/clients/domain/enums/FieldRole';
import { ClientStatus } from '../../src/clients/domain/enums/ClientStatus';
import { ITokenService } from '../../src/auth/application/ports/ITokenService';
import { UserRole } from '../../src/auth/domain/enums/UserRole';
import { OPEN_DEAL_STAGES } from '../../src/deals/domain/DealStage';
import { seedActiveContract, seedM3, SeedM3Result } from './seedM3';

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
  key: 'salesA' | 'salesB' | 'salesC' | 'manager' | 'reception' | 'ceo' | 'roleChange' | 'leaver';
  local: string;
  firstName: string;
  lastName: string;
  roleKey: RoleKey;
}

export const UAT_USERS: UatUserSpec[] = [
  { key: 'salesA', local: 'uat.sales.a', firstName: 'Arta', lastName: 'Shitjet', roleKey: RoleKey.SalesUser },
  { key: 'salesB', local: 'uat.sales.b', firstName: 'Besnik', lastName: 'Shitjet', roleKey: RoleKey.SalesUser },
  // M3 Slice 15: the SRS §5.3 conversion example (4 won, 6 lost) is this user's last month and nothing else.
  { key: 'salesC', local: 'uat.sales.c', firstName: 'Dorina', lastName: 'Shitjet', roleKey: RoleKey.SalesUser },
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
  // UAT-1 (M2): 2 employees, a Medium-risk business type, Tiranë — the Example A pricing, deal won at the end.
  { name: 'UAT Restorant Tirana', owner: 'salesA', businessType: 'Restorant', area: 'Tiranë', city: 'Tiranë', employees: 2, status: ClientStatus.LEAD },
  { name: 'UAT Qendra e Thirrjeve Arta', owner: 'salesA', businessType: 'Qendër thirrjesh', area: 'Tiranë', city: 'Tiranë', employees: 120, status: ClientStatus.PROSPECT },
  { name: 'UAT Fabrika Durrës', owner: 'salesB', businessType: 'Fabrikë', area: 'Durrës', city: 'Durrës', employees: 300, status: ClientStatus.CLIENT, contract: true },
  { name: 'UAT Kafe Plazhi', owner: 'salesB', businessType: 'Kafene', area: 'Durrës', city: 'Durrës', employees: 6, status: ClientStatus.LEAD },
  { name: 'UAT Klienti pa Shitës', owner: null, businessType: 'Kafene', area: 'Tiranë', city: 'Tiranë', employees: 12, status: ClientStatus.LEAD },
  { name: 'UAT Fabrika e Largimit', owner: 'leaver', businessType: 'Fabrikë', area: 'Tiranë', city: 'Tiranë', employees: 80, status: ClientStatus.PROSPECT },
  { name: 'UAT Qendra e Largimit', owner: 'leaver', businessType: 'Qendër thirrjesh', area: 'Durrës', city: 'Durrës', employees: 45, status: ClientStatus.LEAD },
];

export const BULK_PREFIX = 'UAT Bulk Company ';
export const BULK_DEAL_PREFIX = 'UAT Bulk Deal ';
const BULK_FOLLOW_UP_PREFIX = 'UAT bulk follow-up ';
/** Marks the three months of activity UAT-6 reads the Performance screen on (M3 Slice 12). */
const PERFORMANCE_PREFIX = 'UAT performance ';
/** Marks the named follow-ups and meetings, so a re-run adds only what is missing. */
export const UAT_PLANNED_PREFIX = 'UAT planned: ';
/** The company whose second deal is the one UAT-2 loses. */
export const UAT2_DEAL_COMPANY = 'UAT Kafe Blloku';
export const UAT2_DEAL_TITLE = 'UAT-2 deal';

/** The salespeople whose named companies get a seeded deal; the leaver's are left to UAT-5. */
const DEAL_OWNERS: ReadonlyArray<'salesA' | 'salesB'> = ['salesA', 'salesB'];

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
  /** Total bulk follow-ups wanted for the NFR-PERF-03 calendar measurement (5000), spread over the bulk companies; 0 for none. */
  bulkFollowUps?: number;
  /** Total bulk contracts, instalments and activities wanted for the NFR-PERF-04 measurement (500, 6000, 5000); 0 for none. */
  bulkContracts?: number;
  bulkInstalments?: number;
  bulkActivities?: number;
  log?: (line: string) => void;
}

export interface SeedUatResult {
  users: Record<UatUserSpec['key'] | 'admin', { id: string; email: string; created: boolean }>;
  companiesCreated: number;
  bulkCreated: number;
  dealsCreated: number;
  /** The named follow-ups and meetings of Sales User A and B (UAT-4). */
  plannedCreated: number;
  bulkDealsCreated: number;
  bulkFollowUpsCreated: number;
  /** The three months of activity behind the Performance screen (UAT-6). */
  performanceCreated: number;
  /** The Milestone 3 contracts, instalments and won deals, and the bulk volumes (SRS §9.1, NFR-PERF-04). */
  m3: SeedM3Result;
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
      await seedActiveContract({ prisma, tenantId, adminId: admin.id, clientId: company.id, ownerId, today: new Date() });
    }
  }

  // --- One deal per salesperson's company (M2 Slice 6, UAT-2) -------------
  // Checked per company rather than per run, so a workspace seeded before
  // Milestone 2 gets its deals on the next run.
  let dealsCreated = 0;
  for (const spec of UAT_COMPANIES.filter((c) => c.owner === 'salesA' || c.owner === 'salesB')) {
    const company = await prisma.client.findFirst({ where: { tenantId, name: spec.name, deletedAt: null } });
    if (!company || (await prisma.deal.count({ where: { tenantId, clientId: company.id } })) > 0) continue;
    await api.call('POST', '/deals', { clientId: company.id, type: 'NEW_CONTRACT' });
    dealsCreated += 1;
    log(`deal + ${spec.name}`);
  }

  // The second deal UAT-2 loses, next to the company's first one (UAT-1 uses UAT Restorant Tirana).
  const uat2Company = await prisma.client.findFirst({ where: { tenantId, name: UAT2_DEAL_COMPANY, deletedAt: null } });
  if (uat2Company && (await prisma.deal.count({ where: { tenantId, clientId: uat2Company.id, title: UAT2_DEAL_TITLE } })) === 0) {
    await api.call('POST', '/deals', { clientId: uat2Company.id, type: 'NEW_CONTRACT', title: UAT2_DEAL_TITLE });
    dealsCreated += 1;
    log(`deal + ${UAT2_DEAL_TITLE} (${UAT2_DEAL_COMPANY})`);
  }

  // --- Follow-ups and meetings for Sales User A and B (UAT-4) ------------
  // Straight to the database: the API refuses a follow-up in the past, and
  // UAT-4 needs one due yesterday (shown as overdue). Each salesperson gets,
  // on their first named company and its deal: a follow-up due yesterday, one
  // in three days, an in-person meeting tomorrow and an online meeting in two.
  let plannedCreated = 0;
  const DAY = 24 * 60 * 60 * 1000;
  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  for (const key of DEAL_OWNERS) {
    const spec = UAT_COMPANIES.find((c) => c.owner === key);
    const company = spec && (await prisma.client.findFirst({ where: { tenantId, name: spec.name, deletedAt: null } }));
    if (!company) continue;
    const deal = await prisma.deal.findFirst({ where: { tenantId, clientId: company.id }, orderBy: { createdAt: 'asc' } });
    const contact = await prisma.contactPerson.findFirst({ where: { tenantId, clientId: company.id, isPrimary: true, deletedAt: null } });
    const items = [
      { label: 'follow-up due yesterday', kind: 'FOLLOW_UP', type: 'CALL', when: at(-1, 10), intervalDays: null as number | null },
      { label: 'follow-up in 3 days', kind: 'FOLLOW_UP', type: 'CALL', when: at(3, 10), intervalDays: 3 },
      { label: 'meeting tomorrow', kind: 'PLANNED', type: 'MEETING', when: at(1, 11), place: 'Zyra e klientit' },
      { label: 'online meeting in 2 days', kind: 'PLANNED', type: 'ONLINE_MEETING', when: at(2, 14) },
    ];
    for (const item of items) {
      const notes = `${UAT_PLANNED_PREFIX}${key} ${item.label}`;
      if ((await prisma.appointment.count({ where: { tenantId, notes } })) > 0) continue;
      await prisma.appointment.create({
        data: {
          id: randomUUID(),
          tenantId,
          clientId: company.id,
          assignedUserId: users[key].id,
          dealId: deal?.id ?? null,
          contactPersonId: contact?.id ?? null,
          scheduledAt: item.when,
          endAt: item.kind === 'PLANNED' ? new Date(item.when.getTime() + 60 * 60 * 1000) : null,
          place: 'place' in item ? item.place : null,
          intervalDays: item.intervalDays ?? null,
          status: 'SCHEDULED',
          kind: item.kind,
          type: item.type,
          notes,
        },
      });
      plannedCreated += 1;
    }
    log(`planned + follow-ups and meetings for ${key} (${company.name})`);
  }

  // --- The seeded pricing and script must be there (UAT-1, UAT-5) --------
  // Both are written when the workspace is provisioned (seed:wellness), so
  // this only checks them, and fails early rather than during the UAT.
  const publishedScript = await prisma.salesScript.count({ where: { tenantId, status: 'PUBLISHED' } });
  if (publishedScript === 0) throw new Error('The workspace has no published sales script — run seed:wellness first.');
  if ((await prisma.pricingSettings.count({ where: { tenantId } })) === 0) throw new Error('The workspace has no pricing configuration — run seed:wellness first.');

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

  // --- Bulk follow-ups for the NFR-PERF-03 calendar ----------------------
  let bulkFollowUpsCreated = 0;
  const wantedFollowUps = options.bulkFollowUps ?? 0;
  if (wantedFollowUps > 0) {
    const have = await prisma.appointment.count({ where: { tenantId, notes: { startsWith: BULK_FOLLOW_UP_PREFIX } } });
    const missing = wantedFollowUps - have;
    const bulkCompanies = await prisma.client.findMany({
      where: { tenantId, name: { startsWith: BULK_PREFIX } },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    if (missing > 0 && bulkCompanies.length === 0) {
      throw new Error('Bulk follow-ups need bulk companies: pass --companies as well.');
    }
    if (missing > 0) {
      // Straight to the database, like the bulk deals: open follow-ups due
      // from six weeks ago to six weeks ahead, so the current month holds
      // many and "overdue" holds thousands, on both salespeople.
      const owners = [users.salesA.id, users.salesB.id];
      const types = ['CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING'];
      const now = Date.now();
      const rows = Array.from({ length: missing }, (_, i) => {
        const n = have + i;
        return {
          id: randomUUID(),
          tenantId,
          clientId: bulkCompanies[n % bulkCompanies.length].id,
          assignedUserId: owners[n % owners.length],
          scheduledAt: new Date(now + ((n % 84) - 42) * 24 * 60 * 60 * 1000 + (8 + (n % 9)) * 60 * 60 * 1000),
          status: 'SCHEDULED',
          kind: 'FOLLOW_UP',
          type: types[n % types.length],
          notes: `${BULK_FOLLOW_UP_PREFIX}${n}`,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        };
      });
      for (let i = 0; i < rows.length; i += 2_000) {
        await prisma.appointment.createMany({ data: rows.slice(i, i + 2_000) });
      }
      bulkFollowUpsCreated = missing;
      log(`bulk + ${missing} follow-ups (now ${wantedFollowUps})`);
    }
  }

  // --- Three months of activity for the Performance screen (M3 Slice 12, UAT-6) ---
  // Straight to the database, for Sales User A and B: calls, emails, visits and meetings on their
  // companies, offers, deals won and lost (with the owner on the history row) and completed
  // follow-ups, spread over the last 13 weeks so "This month", "Last month" and the chart all have
  // numbers. Written once: it does nothing when the marker content already exists.
  const performanceSeeded = await prisma.interaction.count({ where: { tenantId, content: { startsWith: PERFORMANCE_PREFIX } } });
  let performanceCreated = 0;
  if (performanceSeeded === 0) {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const channels = ['CALL', 'CALL', 'CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING'];
    for (const [salesIndex, salesperson] of [users.salesA, users.salesB].entries()) {
      // Companies of their own, so the deals and activities here never change what UAT-1 and UAT-2
      // read on the named companies.
      const performanceCompanies = Array.from({ length: 3 }, (_, i) => `${PERFORMANCE_PREFIX}company ${salesIndex === 0 ? 'A' : 'B'}${i + 1}`);
      const have = new Set((await prisma.client.findMany({ where: { tenantId, name: { in: performanceCompanies } }, select: { name: true } })).map((c) => c.name));
      const missingCompanies = performanceCompanies.filter((name) => !have.has(name));
      if (missingCompanies.length > 0) {
        await prisma.client.createMany({
          data: missingCompanies.map((name) => ({
            id: randomUUID(), tenantId, name, status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: admin.id, assignedUserId: salesperson.id,
          })) as any,
        });
      }
      const companies = await prisma.client.findMany({ where: { tenantId, name: { in: performanceCompanies } }, select: { id: true }, orderBy: { name: 'asc' } });
      const pick = (n: number) => companies[n % companies.length].id;
      // About one activity a day on weekdays, more for A than B so the rows differ.
      const interactions = Array.from({ length: 91 }, (_, offset) => offset)
        .filter((offset) => offset % (salesIndex === 0 ? 1 : 2) === 0)
        .map((offset) => ({
          id: randomUUID(),
          tenantId,
          clientId: pick(offset),
          authorUserId: salesperson.id,
          channel: channels[(offset + salesIndex) % channels.length],
          content: `${PERFORMANCE_PREFIX}${offset}`,
          occurredAt: new Date(now - offset * day - 3 * 60 * 60 * 1000),
          createdAt: new Date(now - offset * day - 3 * 60 * 60 * 1000),
        }));
      await prisma.interaction.createMany({ data: interactions });

      const stamps = (offset: number) => new Date(now - offset * day);
      // A deal won every 18 days (value 500 + 90 per deal) and one lost every 12 days.
      const closed = [
        ...Array.from({ length: 5 }, (_, i) => ({ result: 'WON' as const, offset: 6 + i * 18, n: i })),
        ...Array.from({ length: 7 }, (_, i) => ({ result: 'LOST' as const, offset: 4 + i * 12, n: i })),
      ];
      for (const { result, offset, n } of closed) {
        const id = randomUUID();
        const closedOn = new Date(Date.UTC(stamps(offset).getUTCFullYear(), stamps(offset).getUTCMonth(), stamps(offset).getUTCDate()));
        await prisma.deal.create({
          data: {
            id, tenantId, clientId: pick(n), ownerUserId: salesperson.id, createdByUserId: salesperson.id, type: 'NEW_CONTRACT', stageKey: result,
            title: `${PERFORMANCE_PREFIX}${result.toLowerCase()} ${n}`, createdAt: new Date(closedOn.getTime() - (12 + n * 3) * day), updatedAt: closedOn, closedAt: closedOn,
            ...(result === 'WON' ? { wonAt: closedOn, agreedMonthlyPrice: String(50 + n * 5), agreedAnnualValue: (500 + n * 90).toFixed(2) } : { lostAt: closedOn }),
          } as any,
        });
        await prisma.dealStageHistory.create({
          data: { id: randomUUID(), tenantId, dealId: id, fromStage: 'NEGOTIATION', toStage: result, changedByUserId: salesperson.id, ownerUserId: salesperson.id, at: closedOn },
        });
      }
      await prisma.quotation.createMany({
        data: Array.from({ length: 8 }, (_, i) => ({
          id: randomUUID(), tenantId, clientId: pick(i), createdByUserId: salesperson.id, status: i % 2 === 0 ? 'SENT' : 'DRAFT', version: 1,
          createdAt: stamps(3 + i * 10), sentAt: i % 2 === 0 ? stamps(2 + i * 10) : null,
        })) as any,
      });
      await prisma.appointment.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          id: randomUUID(), tenantId, clientId: pick(i), assignedUserId: salesperson.id, kind: 'FOLLOW_UP', type: 'CALL', status: 'COMPLETED',
          scheduledAt: stamps(5 + i * 8), completedAt: stamps(i % 3 === 0 ? 4 + i * 8 : 5 + i * 8), notes: `${PERFORMANCE_PREFIX}follow-up ${i}`,
          createdAt: stamps(9 + i * 8), updatedAt: stamps(5 + i * 8),
        })) as any,
      });
      performanceCreated += interactions.length + closed.length + 8 + 10;
    }
    log(`performance + ${performanceCreated} activities, deals, offers and follow-ups over 13 weeks`);
  }

  // --- Milestone 3: contracts in every status, instalments, the example month and the volumes ---
  const bulkCompanyIds = (
    await prisma.client.findMany({ where: { tenantId, name: { startsWith: BULK_PREFIX } }, select: { id: true }, orderBy: { name: 'asc' } })
  ).map((c) => c.id);
  const m3 = await seedM3({
    prisma,
    tenantId,
    adminId: admin.id,
    salesA: users.salesA.id,
    salesB: users.salesB.id,
    salesC: users.salesC.id,
    bulkContracts: options.bulkContracts ?? 0,
    bulkInstalments: options.bulkInstalments ?? 0,
    bulkActivities: options.bulkActivities ?? 0,
    bulkCompanyIds,
    log,
  });

  return { users, companiesCreated, bulkCreated, dealsCreated, plannedCreated, bulkDealsCreated, bulkFollowUpsCreated, performanceCreated, m3 };
}
