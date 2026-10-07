import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { addDays } from '../../../src/contracts/domain/calendarDay';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaMembershipSeeder } from '../../../src/membership/infrastructure/PrismaMembershipSeeder';
import { PrismaMemberStore } from '../../../src/membership/infrastructure/PrismaMemberStore';
import { PrismaMemberPaymentStore } from '../../../src/membership/infrastructure/PrismaMemberPaymentStore';
import { PrismaEmployeeImportStore } from '../../../src/membership/infrastructure/PrismaEmployeeImportStore';
import { PrismaMemberTermJobStore } from '../../../src/membership/infrastructure/PrismaMemberTermJobStore';
import { PrismaMembershipSettingsStore } from '../../../src/membership/infrastructure/PrismaMembershipSettingsStore';
import { PrismaMembershipWriteTransaction } from '../../../src/membership/infrastructure/PrismaMembershipWriteTransaction';
import { ExpireMemberTermsUseCase } from '../../../src/membership/application/use-cases/MemberTermUseCases';
import { GetCompanyMembershipUseCase, SyncEmployerMembersUseCase } from '../../../src/membership/application/use-cases/EmployerUseCases';
import { ContractValidityListener } from '../../../src/membership/application/ContractValidityListener';
import { SponsorValidity } from '../../../src/membership/application/SponsorValidity';
import { AccessContext } from '../../../src/access/domain/AccessContext';
import { PrismaSchedulerQueries } from '../../../src/scheduler/PrismaSchedulerQueries';
import { MemberTermJob } from '../../../src/scheduler/jobs/MemberTermJob';
import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { PrismaNotificationRepository } from '../../../src/notifications/infrastructure/PrismaNotificationRepository';
import { PrismaPermissionHolderDirectory } from '../../../src/notifications/infrastructure/PrismaPermissionHolderDirectory';
import { PrismaTeamRoster } from '../../../src/access/infrastructure/PrismaTeamRoster';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const day = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = () => day(new Date());
const plusDays = (iso: string, n: number) => day(addDays(asDate(iso), n));
const noon = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/**
 * M4 Slice 10: the employer contract link, former employees and the company tab
 * (FR-EMP-09..13, FR-EMP-15, FR-MEM-11, FR-TIR-07, FR-TIR-08, NFR-REL-02, D8, D9).
 * Contracts and members are written straight to the database with fixed dates and
 * the daily job runs with a moving clock; the hook tests use the real contract
 * route.
 */
describe('Employer contract link (M4 Slice 10)', () => {
  const tenantId = `t-wp-erl-${randomUUID()}`;
  const uid = (label: string) => `u-wpl-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), agent: uid('agent'), viewer: uid('viewer'), sales: uid('sales'), reception: uid('reception') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const members = (who: Who) => ({
    get: (p: string) => authed(who)(request(app).get(`/api/${tenantId}/membership/members${p}`)),
    post: (p: string, body: object = {}) => authed(who)(request(app).post(`/api/${tenantId}/membership/members${p}`)).send(body),
  });
  const tab = (who: Who, clientId: string) => authed(who)(request(app).get(`/api/${tenantId}/clients/${clientId}/membership`));
  const contractStatus = (contractId: string, status: string, reason?: string) =>
    authed('admin')(request(app).post(`/api/${tenantId}/contracts/${contractId}/status`)).send({ status, reason });

  class ThisTenantQueries extends PrismaSchedulerQueries {
    async listTenants() {
      return (await super.listTenants()).filter((tenant) => tenant.id === tenantId);
    }
  }
  const realNotifications = () =>
    new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository(prisma), undefined, new PrismaPermissionHolderDirectory(prisma, new PrismaTeamRoster(prisma)));
  const jobWith = (notifications: NotificationService = realNotifications()) =>
    new MemberTermJob(
      new ThisTenantQueries(prisma),
      new PrismaMemberTermJobStore(prisma),
      new PrismaMembershipSettingsStore(prisma),
      new ExpireMemberTermsUseCase(new PrismaMembershipWriteTransaction(prisma)),
      notifications
    );
  const runAt = (iso: string, job: MemberTermJob = jobWith()) => job.run(noon(iso));

  let counter = 0;
  let areaId: string;
  let cityId: string;
  const company = async (name: string, contracts: Array<{ startsAt: string; endsAt: string; status?: string }>, employeeCount: number | null = null) => {
    const id = randomUUID();
    await prisma.client.create({ data: { id, tenantId, name, status: 'CLIENT', areaId, cityId, employeeCount, customFieldValues: {}, lastUpdatedByUserId: users.admin } as any });
    const contractIds: string[] = [];
    for (const c of contracts) {
      const contractId = randomUUID();
      contractIds.push(contractId);
      await prisma.contract.create({
        data: { id: contractId, tenantId, clientId: id, planName: 'Plan', status: c.status ?? 'ACTIVE', amount: '1000.00', billingPeriod: 'ANNUAL', startsAt: asDate(c.startsAt), endsAt: asDate(c.endsAt), createdByUserId: users.admin },
      });
    }
    return { id, contractIds };
  };

  /** A linked employee as an upload leaves them: a sponsored Silver term with no end date. */
  const employee = async (clientId: string, opts: { tier?: string; startsOn?: string; own?: Array<{ tier: string; source: string; startsOn: string; endsOn: string }> } = {}) => {
    counter += 1;
    const id = randomUUID();
    const startsOn = opts.startsOn ?? '2027-01-01';
    await prisma.member.create({
      data: {
        id, tenantId, memberNumber: `WP-L${String(counter).padStart(5, '0')}-${randomUUID().slice(0, 4)}`, firstName: `Emp${counter}`, lastName: 'Link', startsOn: asDate(startsOn),
        cardToken: randomUUID(), createdBy: users.admin, currentTier: opts.tier ?? 'SILVER', employerClientId: clientId,
      },
    });
    await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: id, tier: 'SILVER', source: 'SPONSORED', startsOn: asDate(startsOn), endsOn: null } });
    for (const t of opts.own ?? []) await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: id, tier: t.tier, source: t.source, startsOn: asDate(t.startsOn), endsOn: asDate(t.endsOn) } });
    return id;
  };
  const rowOf = (id: string) => prisma.member.findUniqueOrThrow({ where: { id } });
  const termsOf = (id: string) => prisma.memberTerm.findMany({ where: { memberId: id }, orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }] });
  const historyOf = (id: string) => prisma.memberTierHistory.findMany({ where: { memberId: id }, orderBy: { createdAt: 'asc' } });
  const auditOf = (id: string) => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Member', entityId: id }, orderBy: { at: 'asc' } });
  const shape = async (id: string) => ({
    tier: (await rowOf(id)).currentTier,
    history: (await historyOf(id)).map((h) => [h.fromTier, h.toTier, h.reason, day(h.createdAt), h.changedByUserId]),
  });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Wellness Employer Test', urlSlug: tenantId, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const customRole = async (keys: string[]) => {
      const id = `r-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `k-${randomUUID()}`, nameSq: 'r', nameEn: 'r', isSystem: false, baseKey: RoleKey.Reception, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    const agentRole = await customRole(['members.view', 'members.manage']);
    const viewerRole = await customRole(['members.view']);
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.agent, agentRole, 'Mira'),
        user(users.viewer, viewerRole, 'Vera'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
    areaId = (await prisma.area.create({ data: { id: randomUUID(), tenantId, nameSq: 'T', nameEn: 'T', order: 1 } })).id;
    cityId = (await prisma.city.create({ data: { id: randomUUID(), tenantId, areaId, nameSq: 'T', nameEn: 'T', order: 1 } })).id;
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('sponsored Silver follows the contract (the daily job)', () => {
    it('FR-EMP-09 a renewal starting the day after the contract ends changes nothing: Silver, no history row, no audit entry (UAT-2 step 4)', async () => {
      const co = await company('Renewal Co', [
        { startsAt: '2026-03-01', endsAt: '2027-02-28' },
        { startsAt: '2027-03-01', endsAt: '2028-02-29' },
      ]);
      const ids = [await employee(co.id), await employee(co.id)];

      await runAt('2027-02-28');
      await runAt('2027-03-01');
      await runAt('2027-03-02');

      for (const id of ids) {
        expect(await shape(id)).toEqual({ tier: 'SILVER', history: [] });
        expect(await auditOf(id)).toEqual([]);
        expect(await termsOf(id)).toHaveLength(1);
      }
    });

    it('FR-EMP-09 the expiry shown on a sponsored member is the end of the contract chain, and moves to the renewal end date', async () => {
      const first = { startsAt: plusDays(today(), -100), endsAt: plusDays(today(), 10) };
      const renewal = { startsAt: plusDays(today(), 11), endsAt: plusDays(today(), 375) };
      const co = await company('Chain Co', [first, renewal]);
      const id = await employee(co.id, { startsOn: plusDays(today(), -100) });

      const res = await members('viewer').get(`/${id}`).expect(200);
      expect(res.body.data.effectiveTier).toBe('SILVER');
      expect(res.body.data.currentTerm).toMatchObject({ source: 'SPONSORED', endsOn: renewal.endsAt });

      // A gap of one day stops the chain at the first contract's end.
      const gapped = await company('Gap Co', [first, { startsAt: plusDays(today(), 12), endsAt: plusDays(today(), 376) }]);
      const other = await employee(gapped.id, { startsOn: plusDays(today(), -100) });
      const second = await members('viewer').get(`/${other}`).expect(200);
      expect(second.body.data.currentTerm.endsOn).toBe(first.endsAt);
    });

    it('FR-EMP-10, FR-TIR-07 the day after the contract ends the employees are Bronze, "Company contract ended" by the system, and a second run changes nothing', async () => {
      const co = await company('Ending Co', [{ startsAt: '2026-03-01', endsAt: '2027-02-28' }]);
      const id = await employee(co.id);

      await runAt('2027-02-28');
      expect(await shape(id)).toEqual({ tier: 'SILVER', history: [] });

      await runAt('2027-03-01');
      expect(await shape(id)).toEqual({ tier: 'BRONZE', history: [['SILVER', 'BRONZE', 'Company contract ended', '2027-03-01', null]] });
      const audit = await auditOf(id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ userId: null, userRole: 'SYSTEM', action: 'STATUS_CHANGE' });

      await runAt('2027-03-01');
      await runAt('2027-03-02');
      expect((await historyOf(id)).length).toBe(1);
      expect((await auditOf(id)).length).toBe(1);
    });

    it('FR-EMP-10 the effect is visible on the member page before the job runs, because the tier is calculated', async () => {
      const co = await company('Calculated Co', [{ startsAt: plusDays(today(), -400), endsAt: plusDays(today(), -1) }]);
      const id = await employee(co.id, { startsOn: plusDays(today(), -400) });

      expect((await rowOf(id)).currentTier).toBe('SILVER');
      const res = await members('viewer').get(`/${id}`).expect(200);
      expect(res.body.data.effectiveTier).toBe('BRONZE');
      expect(res.body.data.currentTerm).toBeNull();
    });

    it('FR-EMP-10 a company with one expired and one valid contract keeps its employees Silver', async () => {
      const co = await company('Mixed Co', [
        { startsAt: '2025-03-01', endsAt: '2026-02-28' },
        { startsAt: '2026-03-01', endsAt: '2027-12-31' },
      ]);
      const id = await employee(co.id, { startsOn: '2025-03-01' });
      await runAt('2027-03-01');
      expect(await shape(id)).toEqual({ tier: 'SILVER', history: [] });
    });

    it('FR-EMP-10 a paid term still gives its tier: Gold stays Gold when the contract ends, and drops only to Silver by its own rule later', async () => {
      const co = await company('Paid Co', [{ startsAt: '2026-03-01', endsAt: '2027-02-28' }]);
      const id = await employee(co.id, { tier: 'GOLD', own: [{ tier: 'GOLD', source: 'PAID', startsOn: '2026-06-01', endsOn: '2027-05-31' }] });
      await runAt('2027-03-01');
      expect(await shape(id)).toEqual({ tier: 'GOLD', history: [] });
    });

    it('FR-EMP-11 a new contract after a gap makes the employees Silver again while they are still linked', async () => {
      const co = await company('Gap Return Co', [
        { startsAt: '2026-03-01', endsAt: '2027-02-28' },
        { startsAt: '2027-04-01', endsAt: '2028-03-31' },
      ]);
      const id = await employee(co.id);

      await runAt('2027-03-01');
      expect((await shape(id)).tier).toBe('BRONZE');
      await runAt('2027-03-31');
      expect((await shape(id)).tier).toBe('BRONZE');
      await runAt('2027-04-01');
      expect(await shape(id)).toEqual({
        tier: 'SILVER',
        history: [
          ['SILVER', 'BRONZE', 'Company contract ended', '2027-03-01', null],
          ['BRONZE', 'SILVER', 'Company contract valid again', '2027-04-01', null],
        ],
      });
      await runAt('2027-04-01');
      expect((await historyOf(id)).length).toBe(2);
    });

    it('NFR-REL-02 a run after a two-day gap records the change once, and the same run twice adds nothing', async () => {
      const co = await company('Catch-up Co', [{ startsAt: '2026-03-01', endsAt: '2027-02-28' }]);
      const ids = [await employee(co.id), await employee(co.id), await employee(co.id)];

      await runAt('2027-02-28');
      await runAt('2027-03-03'); // nothing ran on 01.03 or 02.03
      await runAt('2027-03-03');

      for (const id of ids) {
        expect(await shape(id)).toEqual({ tier: 'BRONZE', history: [['SILVER', 'BRONZE', 'Company contract ended', '2027-03-03', null]] });
        expect(await auditOf(id)).toHaveLength(1);
      }
    });

    it('NFR-REL-02 a notification that fails does not stop the sponsor sync, and the retry adds no second history row', async () => {
      const co = await company('Failing Notice Co', [{ startsAt: '2026-03-01', endsAt: '2027-02-28' }]);
      const id = await employee(co.id);
      const failing = { emitStrict: async () => { throw new Error('mail is down'); } } as unknown as NotificationService;
      const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await runAt('2027-03-01', jobWith(failing));
        await runAt('2027-03-02', jobWith(failing));
        await runAt('2027-03-02');
      } finally {
        quiet.mockRestore();
      }
      expect(await shape(id)).toEqual({ tier: 'BRONZE', history: [['SILVER', 'BRONZE', 'Company contract ended', '2027-03-01', null]] });
    });

    it('FR-EMP-10, FR-EMP-11 the job leaves a member who left the company alone', async () => {
      const co = await company('Left Co', [{ startsAt: '2026-03-01', endsAt: '2027-02-28' }]);
      const id = await employee(co.id);
      await members('agent').post(`/${id}/remove-employer`, {}).expect(200);
      const before = await shape(id);
      await runAt('2027-03-01');
      expect(await shape(id)).toEqual(before);
    });
  });

  describe('the contract-change hook (D8)', () => {
    it('FR-EMP-11 a suspended contract makes the employees Bronze at once, and reinstating returns them to Silver the same day', async () => {
      const co = await company('Hook Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const ids = [await employee(co.id, { startsOn: plusDays(today(), -60) }), await employee(co.id, { startsOn: plusDays(today(), -60) })];

      await contractStatus(co.contractIds[0], 'SUSPENDED', 'Unpaid').expect(200);
      for (const id of ids) {
        expect(await shape(id)).toMatchObject({ tier: 'BRONZE', history: [['SILVER', 'BRONZE', 'Company contract ended', today(), null]] });
      }

      await contractStatus(co.contractIds[0], 'ACTIVE', 'Paid').expect(200);
      for (const id of ids) {
        expect(await shape(id)).toEqual({
          tier: 'SILVER',
          history: [
            ['SILVER', 'BRONZE', 'Company contract ended', today(), null],
            ['BRONZE', 'SILVER', 'Company contract valid again', today(), null],
          ],
        });
        const audit = await auditOf(id);
        expect(audit.every((entry) => entry.userId === null && entry.userRole === 'SYSTEM')).toBe(true);
      }
    });

    it('FR-EMP-10 cancelling the contract makes the employees Bronze at once, by the system', async () => {
      const co = await company('Cancel Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const id = await employee(co.id, { startsOn: plusDays(today(), -60) });
      await contractStatus(co.contractIds[0], 'CANCELLED', 'Closed').expect(200);
      expect(await shape(id)).toMatchObject({ tier: 'BRONZE', history: [['SILVER', 'BRONZE', 'Company contract ended', today(), null]] });
    });

    it('FR-EMP-11 a failing hook never blocks the contract change, and the next job run repairs the employees', async () => {
      const co = await company('Broken Hook Co', [{ startsAt: '2026-03-01', endsAt: '2027-02-28' }]);
      const id = await employee(co.id);

      const broken = new ContractValidityListener(
        new SyncEmployerMembersUseCase({ employeeIds: async () => { throw new Error('database blip'); } }, new ExpireMemberTermsUseCase(new PrismaMembershipWriteTransaction(prisma)))
      );
      const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await expect(broken.contractValidityChanged({ tenantId, clientId: co.id, today: asDate('2027-03-01') })).resolves.toBeUndefined();
      } finally {
        quiet.mockRestore();
      }
      expect((await shape(id)).tier).toBe('SILVER');

      await runAt('2027-03-01');
      expect(await shape(id)).toEqual({ tier: 'BRONZE', history: [['SILVER', 'BRONZE', 'Company contract ended', '2027-03-01', null]] });
    });

    it('FR-EMP-11 the hook is idempotent: telling it twice writes one history row', async () => {
      const co = await company('Twice Co', [{ startsAt: '2026-03-01', endsAt: '2027-02-28' }]);
      const id = await employee(co.id);
      const listener = new ContractValidityListener(new SyncEmployerMembersUseCase(new PrismaMemberStore(prisma), new ExpireMemberTermsUseCase(new PrismaMembershipWriteTransaction(prisma))));
      await listener.contractValidityChanged({ tenantId, clientId: co.id, today: asDate('2027-03-01') });
      await listener.contractValidityChanged({ tenantId, clientId: co.id, today: asDate('2027-03-01') });
      expect((await historyOf(id)).length).toBe(1);
    });
  });

  describe('removing employees', () => {
    it('FR-EMP-12 removing a sponsored Silver employee makes the member Bronze today and a former employee, with "Left company" in the history', async () => {
      const co = await company('Remove Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const id = await employee(co.id, { startsOn: plusDays(today(), -30) });

      const res = await members('agent').post(`/${id}/remove-employer`, { reason: 'Resigned' }).expect(200);
      expect(res.body.data).toMatchObject({ employer: null, formerEmployee: true });

      const row = await rowOf(id);
      expect(row).toMatchObject({ employerClientId: null, formerEmployerClientId: co.id, currentTier: 'BRONZE' });
      expect(day(row.leftCompanyAt!)).toBe(today());
      expect(await shape(id)).toEqual({ tier: 'BRONZE', history: [['SILVER', 'BRONZE', 'Left company', today(), users.agent]] });
      expect((await historyOf(id))[0].comment).toBe('Resigned');
      const [term] = await termsOf(id);
      expect(term).toMatchObject({ source: 'SPONSORED' });
      expect(day(term.endsOn!)).toBe(plusDays(today(), -1));
      const audit = await auditOf(id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ userId: users.agent, action: 'STATUS_CHANGE' });

      const detail = await members('viewer').get(`/${id}`).expect(200);
      expect(detail.body.data).toMatchObject({ effectiveTier: 'BRONZE', formerEmployee: true, formerEmployerClientId: co.id, leftCompanyAt: today() });
    });

    it('FR-EMP-12 a paid Gold term of the same member is untouched', async () => {
      const co = await company('Gold Leaver Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const paid = { tier: 'GOLD', source: 'PAID', startsOn: plusDays(today(), -20), endsOn: plusDays(today(), 345) };
      const id = await employee(co.id, { tier: 'GOLD', startsOn: plusDays(today(), -30), own: [paid] });

      await members('agent').post(`/${id}/remove-employer`, {}).expect(200);

      expect((await rowOf(id)).currentTier).toBe('GOLD');
      const gold = (await termsOf(id)).find((t) => t.source === 'PAID')!;
      expect([gold.tier, day(gold.startsOn), day(gold.endsOn!)]).toEqual(['GOLD', paid.startsOn, paid.endsOn]);
      expect((await historyOf(id)).length).toBe(0);
      const detail = await members('viewer').get(`/${id}`).expect(200);
      expect(detail.body.data.effectiveTier).toBe('GOLD');
      expect(detail.body.data.formerEmployee).toBe(true);
    });

    it('FR-EMP-12 a past leaving date ends the sponsored term the day before it, and a future one is refused', async () => {
      const co = await company('Past Leaver Co', [{ startsAt: plusDays(today(), -90), endsAt: plusDays(today(), 300) }]);
      const id = await employee(co.id, { startsOn: plusDays(today(), -60) });
      await members('agent').post(`/${id}/remove-employer`, { leftOn: plusDays(today(), -10) }).expect(200);
      const [term] = await termsOf(id);
      expect(day(term.endsOn!)).toBe(plusDays(today(), -11));
      expect(day((await rowOf(id)).leftCompanyAt!)).toBe(plusDays(today(), -10));

      const other = await employee(co.id);
      await members('agent').post(`/${other}/remove-employer`, { leftOn: plusDays(today(), 1) }).expect(400);
      await members('agent').post(`/${other}/remove-employer`, { leftOn: 'yesterday' }).expect(400);
      expect((await rowOf(other)).employerClientId).toBe(co.id);
    });

    it('FR-EMP-12 needs "Members: manage"; a member with no employer is refused', async () => {
      const co = await company('Permission Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const id = await employee(co.id);
      for (const who of ['viewer', 'sales', 'reception'] as Who[]) await members(who).post(`/${id}/remove-employer`, {}).expect(403);
      expect((await rowOf(id)).employerClientId).toBe(co.id);

      await members('agent').post(`/${id}/remove-employer`, {}).expect(200);
      const again = await members('agent').post(`/${id}/remove-employer`, {}).expect(409);
      expect(again.body.code).toBe('NOT_AN_EMPLOYEE');
      await members('agent').post(`/${randomUUID()}/remove-employer`, {}).expect(404);
    });

    it('FR-EMP-13 the filter lists only members removed from that company, and narrows by leaving date', async () => {
      const a = await company('Filter A Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const b = await company('Filter B Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const early = await employee(a.id);
      const late = await employee(a.id);
      const elsewhere = await employee(b.id);
      const stays = await employee(a.id);
      await members('agent').post(`/${early}/remove-employer`, { leftOn: plusDays(today(), -20) }).expect(200);
      await members('agent').post(`/${late}/remove-employer`, { leftOn: plusDays(today(), -2) }).expect(200);
      await members('agent').post(`/${elsewhere}/remove-employer`, {}).expect(200);

      const ids = async (query: string) => (await members('viewer').get(`?${query}&limit=100`).expect(200)).body.data.map((m: { id: string }) => m.id).sort();
      expect(await ids(`formerEmployerClientId=${a.id}`)).toEqual([early, late].sort());
      expect(await ids(`formerEmployerClientId=${b.id}`)).toEqual([elsewhere]);
      expect(await ids(`formerEmployerClientId=${a.id}&leftFrom=${plusDays(today(), -5)}`)).toEqual([late]);
      expect(await ids(`formerEmployerClientId=${a.id}&leftTo=${plusDays(today(), -10)}`)).toEqual([early]);
      expect(await ids('formerEmployee=true')).toEqual(expect.arrayContaining([early, late, elsewhere]));
      expect(await ids('formerEmployee=true')).not.toContain(stays);
    });

    it('FR-EMP-15 removing 5 selected members creates 5 history entries in one transaction', async () => {
      const co = await company('Bulk Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const ids = [];
      for (let i = 0; i < 5; i += 1) ids.push(await employee(co.id, { startsOn: plusDays(today(), -30) }));
      const stays = await employee(co.id);

      const res = await members('agent').post('/remove-employees', { memberIds: ids, reason: 'Staff reduction' }).expect(200);
      expect(res.body.data).toEqual({ removed: 5, skipped: [] });
      for (const id of ids) {
        expect(await historyOf(id)).toHaveLength(1);
        expect((await historyOf(id))[0]).toMatchObject({ reason: 'Left company', toTier: 'BRONZE', changedByUserId: users.agent });
        expect((await rowOf(id)).formerEmployerClientId).toBe(co.id);
      }
      expect((await rowOf(stays)).employerClientId).toBe(co.id);
    });

    it('FR-EMP-15 if one removal fails none is kept; a member no longer linked is reported and skipped', async () => {
      const co = await company('Atomic Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const ids = [await employee(co.id), await employee(co.id)];

      await members('agent').post('/remove-employees', { memberIds: [...ids, randomUUID()] }).expect(404);
      for (const id of ids) {
        expect((await rowOf(id)).employerClientId).toBe(co.id);
        expect(await historyOf(id)).toEqual([]);
      }

      await members('agent').post(`/${ids[0]}/remove-employer`, {}).expect(200);
      const res = await members('agent').post('/remove-employees', { memberIds: ids }).expect(200);
      expect(res.body.data).toEqual({ removed: 1, skipped: [ids[0]] });
      await members('agent').post('/remove-employees', { memberIds: [] }).expect(400);
      await members('viewer').post('/remove-employees', { memberIds: ids }).expect(403);
    });

    it('FR-EMP-14 a former employee can be linked to a new company again, and is then no longer a former employee', async () => {
      const first = await company('First Employer Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      const id = await employee(first.id);
      await members('agent').post(`/${id}/remove-employer`, {}).expect(200);
      expect((await rowOf(id)).formerEmployerClientId).toBe(first.id);

      await new PrismaMemberStore(prisma).setEmployer(tenantId, id, (await company('Second Employer Co', [])).id);
      expect(await rowOf(id)).toMatchObject({ formerEmployerClientId: null, leftCompanyAt: null });
    });
  });

  describe('the company tab', () => {
    it('FR-MEM-11 the tab of a company with 12 members and employee count 40 shows "12 members of 40 employees"', async () => {
      const co = await company('Tab Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }], 40);
      for (let i = 0; i < 9; i += 1) await employee(co.id, { startsOn: plusDays(today(), -30) });
      for (let i = 0; i < 2; i += 1) await employee(co.id, { tier: 'GOLD' });
      await employee(co.id, { tier: 'BRONZE' });
      const left = await employee(co.id);
      await members('agent').post(`/${left}/remove-employer`, {}).expect(200);

      const res = await tab('viewer', co.id).expect(200);
      const { summary, members: list, formerEmployees, sponsor, company: info } = res.body.data;
      expect(info).toMatchObject({ id: co.id, name: 'Tab Co', employeeCount: 40 });
      expect(summary).toMatchObject({ members: 12, employees: 40, formerEmployees: 1 });
      expect(summary.perTier).toEqual({ BRONZE: 1, SILVER: 9, GOLD: 2, VIP: 0 });
      expect(list).toHaveLength(12);
      expect(formerEmployees.map((m: { id: string }) => m.id)).toEqual([left]);
      expect(formerEmployees[0].leftCompanyAt).toBe(today());
      expect(sponsor).toEqual({ valid: true, endsOn: plusDays(today(), 300) });
    });

    it('FR-MEM-11 shows the upload history, and no personal contact field to a user who only holds "Members: view"', async () => {
      const co = await company('History Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      await employee(co.id);
      await prisma.employeeImport.create({
        data: { id: randomUUID(), tenantId, clientId: co.id, fileName: 'staff.xlsx', uploadedBy: users.admin, status: 'CONFIRMED', confirmToken: 'x', created: 3, linked: 1, confirmedAt: new Date() },
      });
      const res = await tab('viewer', co.id).expect(200);
      expect(res.body.data.uploads).toHaveLength(1);
      expect(res.body.data.uploads[0]).toMatchObject({ fileName: 'staff.xlsx', created: 3, linked: 1, uploadedByName: 'Ana Test' });
      expect(res.body.data.summary.employees).toBeNull();
      expect(JSON.stringify(res.body)).not.toContain('cardToken');
    });

    it('FR-RBAC-27 the tab is closed to a user with no Wellness+ permission and a missing company is a 404', async () => {
      const co = await company('Closed Co', []);
      await tab('sales', co.id).expect(403);
      await tab('reception', co.id).expect(403);
      await tab('viewer', randomUUID()).expect(404);
    });

    it('NFR-PERF-05 the tab uses a bounded number of queries however many employees the company has', async () => {
      const queries: string[] = [];
      const counting = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
      (counting as any).$on('query', (event: { query: string }) => queries.push(event.query));
      const useCase = new GetCompanyMembershipUseCase(new PrismaMemberStore(counting), new PrismaEmployeeImportStore(counting), new SponsorValidity(new PrismaMemberPaymentStore(counting)));
      const access = new AccessContext({ userId: users.admin, tenantId, roleKey: 'ADMINISTRATOR', permissions: { 'members.view': true }, isPlatformOperator: false });
      // Query events arrive a moment after the query, so let them settle before and after each measurement.
      const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
      const measure = async (clientId: string) => {
        await settle();
        queries.length = 0;
        const result = await useCase.execute({ access, tenantId, timezone: 'UTC', clientId });
        await settle();
        return { count: queries.length, members: result!.members.length };
      };

      const small = await company('Small Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      for (let i = 0; i < 3; i += 1) await employee(small.id);
      const big = await company('Big Co', [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }]);
      await prisma.member.createMany({
        data: Array.from({ length: 200 }, (_, i) => ({
          id: randomUUID(), tenantId, memberNumber: `WP-B${String(i).padStart(5, '0')}-${randomUUID().slice(0, 4)}`, firstName: `Big${i}`, lastName: 'Staff', startsOn: asDate('2027-01-01'),
          cardToken: randomUUID(), createdBy: users.admin, currentTier: 'SILVER', employerClientId: big.id,
        })),
      });

      const few = await measure(small.id);
      const many = await measure(big.id);
      await counting.$disconnect();
      expect(few.members).toBe(3);
      expect(many.members).toBe(200);
      expect(many.count).toBe(few.count);
      expect(many.count).toBeLessThanOrEqual(10);
    });
  });

  describe('UAT-2', () => {
    it('UAT-2 steps 1 to 5: Bronze while suspended and Silver after reinstating; Bronze with "Company contract ended" after the end date; Silver with the new expiry after a renewal; the removed employee is Bronze and a former employee', async () => {
      // Step 1-2: the live contract is suspended and reinstated through the real route.
      const live = await company('UAT Co', [{ startsAt: plusDays(today(), -100), endsAt: plusDays(today(), 200) }], 5);
      const stayer = await employee(live.id, { startsOn: plusDays(today(), -100) });
      const leaver = await employee(live.id, { startsOn: plusDays(today(), -100) });
      await contractStatus(live.contractIds[0], 'SUSPENDED', 'Unpaid').expect(200);
      expect((await rowOf(stayer)).currentTier).toBe('BRONZE');
      await contractStatus(live.contractIds[0], 'ACTIVE', 'Paid').expect(200);
      expect((await rowOf(stayer)).currentTier).toBe('SILVER');

      // Step 3-5: the contract chain on a fixed clock: it ends 28.02.2027, a renewal starts 01.03.2027.
      const chain = await company('UAT Chain Co', [
        { startsAt: '2026-03-01', endsAt: '2027-02-28' },
        { startsAt: '2027-03-01', endsAt: '2028-02-29' },
      ]);
      const ends = await company('UAT Ending Co', [{ startsAt: '2026-03-01', endsAt: '2027-02-28' }]);
      const renewed = await employee(chain.id);
      const ended = await employee(ends.id);

      await runAt('2027-03-01');
      expect(await shape(renewed)).toEqual({ tier: 'SILVER', history: [] });
      expect(await shape(ended)).toEqual({ tier: 'BRONZE', history: [['SILVER', 'BRONZE', 'Company contract ended', '2027-03-01', null]] });

      // The agent removes one employee: Bronze and a former employee, the others stay Silver.
      await members('agent').post(`/${leaver}/remove-employer`, { reason: 'Resigned' }).expect(200);
      expect(await rowOf(leaver)).toMatchObject({ currentTier: 'BRONZE', formerEmployerClientId: live.id });
      expect((await rowOf(stayer)).currentTier).toBe('SILVER');
      const res = await tab('viewer', live.id).expect(200);
      expect(res.body.data.members.map((m: { id: string }) => m.id)).toEqual([stayer]);
      expect(res.body.data.formerEmployees.map((m: { id: string }) => m.id)).toEqual([leaver]);
    });
  });
});
