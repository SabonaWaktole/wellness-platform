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
import { PrismaMembershipSettingsStore } from '../../../src/membership/infrastructure/PrismaMembershipSettingsStore';
import { PrismaMembershipWriteTransaction } from '../../../src/membership/infrastructure/PrismaMembershipWriteTransaction';
import { PrismaMemberTermJobStore } from '../../../src/membership/infrastructure/PrismaMemberTermJobStore';
import { ExpireMemberTermsUseCase } from '../../../src/membership/application/use-cases/MemberTermUseCases';
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

type TermSpec = { tier: string; source: string; startsOn: string; endsOn: string | null };

/**
 * M4 Slice 8: the daily member job (FR-TIR-05..07, FR-TIR-09..11, FR-VIP-04,
 * NFR-REL-02, NFR-DAT-02). Members are written straight to the database with
 * fixed dates and the job is run with a moving clock, as the M3 job tests do.
 */
describe('Wellness+ daily member job (M4 Slice 8)', () => {
  const tenantId = `t-wp-job-${randomUUID()}`;
  const uid = (label: string) => `u-wpj-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), approver: uid('approver'), recorder: uid('recorder'), agent: uid('agent'), sales: uid('sales'), reception: uid('reception') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;

  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const members = (who: Who) => ({
    get: (p: string) => authed(who)(request(app).get(`/api/${tenantId}/membership/members${p}`)),
    post: (p: string, body: object = {}) => authed(who)(request(app).post(`/api/${tenantId}/membership/members${p}`)).send(body),
  });

  /** Only this tenant: the database is shared with other suites whose members must not move. */
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
  /** A member written directly: the stored tier and terms of the scenario, no payment. */
  const seedMember = async (currentTier: string, terms: TermSpec[], startsOn = '2027-01-01') => {
    counter += 1;
    const id = randomUUID();
    await prisma.member.create({
      data: {
        id, tenantId, memberNumber: `WP-J${String(counter).padStart(5, '0')}-${randomUUID().slice(0, 4)}`, firstName: `Job${counter}`, lastName: 'Member', startsOn: asDate(startsOn),
        cardToken: randomUUID(), createdBy: users.admin, currentTier,
      },
    });
    for (const t of terms) await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: id, tier: t.tier, source: t.source, startsOn: asDate(t.startsOn), endsOn: t.endsOn ? asDate(t.endsOn) : null } });
    return id;
  };
  const gold = (startsOn = '2027-01-01', endsOn = '2027-12-31') => seedMember('GOLD', [{ tier: 'GOLD', source: 'PAID', startsOn, endsOn }], startsOn);
  const rowOf = (id: string) => prisma.member.findUniqueOrThrow({ where: { id } });
  const termsOf = (id: string) => prisma.memberTerm.findMany({ where: { memberId: id }, orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }] });
  const historyOf = (id: string) => prisma.memberTierHistory.findMany({ where: { memberId: id }, orderBy: [{ createdAt: 'asc' }] });
  const auditOf = (id: string) => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Member', entityId: id }, orderBy: { at: 'asc' } });
  const setSettings = (data: object) => prisma.membershipSettings.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
  const notificationsOf = (type: string, userId?: string) => prisma.notification.findMany({ where: { tenantId, type, ...(userId ? { recipientUserId: userId } : {}) } });
  const summarise = async (id: string) => ({
    tier: (await rowOf(id)).currentTier,
    terms: (await termsOf(id)).map((t) => [t.tier, t.source, day(t.startsOn), t.endsOn ? day(t.endsOn) : null]),
    history: (await historyOf(id)).map((h) => [h.fromTier, h.toTier, h.reason, day(h.createdAt), h.changedByUserId]),
  });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Wellness Job Test', urlSlug: tenantId, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const customRole = async (keys: string[]) => {
      const id = `r-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `k-${randomUUID()}`, nameSq: 'r', nameEn: 'r', isSystem: false, baseKey: RoleKey.Reception, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    const approverRole = await customRole(['members.view', 'members.vip.approve']);
    const recorderRole = await customRole(['members.view', 'members.payments.record']);
    const agentRole = await customRole(['members.view', 'members.manage']);
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.approver, approverRole, 'Dea'),
        user(users.recorder, recorderRole, 'Rea'),
        user(users.agent, agentRole, 'Mira'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('stepping down', () => {
    it('FR-TIR-06 a Gold member not renewed is Silver for twelve months from the next day, then Bronze, each on its own run', async () => {
      const id = await gold();

      await runAt('2027-12-31');
      expect((await rowOf(id)).currentTier).toBe('GOLD');
      expect(await termsOf(id)).toHaveLength(1);

      await runAt('2028-01-01');
      const [, downgrade] = await termsOf(id);
      expect(downgrade).toMatchObject({ tier: 'SILVER', source: 'DOWNGRADE', paymentId: null });
      expect([day(downgrade.startsOn), day(downgrade.endsOn!)]).toEqual(['2028-01-01', '2028-12-31']);
      expect(downgrade.followsTermId).not.toBeNull();
      expect((await rowOf(id)).currentTier).toBe('SILVER');

      await runAt('2028-12-31');
      expect((await rowOf(id)).currentTier).toBe('SILVER');
      await runAt('2029-01-01');
      expect((await rowOf(id)).currentTier).toBe('BRONZE');
      expect(await termsOf(id)).toHaveLength(2);
    });

    it('FR-TIR-06 a Silver member whose paid term ended is Bronze, with no new term', async () => {
      const id = await seedMember('SILVER', [{ tier: 'SILVER', source: 'PAID', startsOn: '2027-03-01', endsOn: '2028-02-29' }], '2027-03-01');
      await runAt('2028-03-01');
      expect((await rowOf(id)).currentTier).toBe('BRONZE');
      expect(await termsOf(id)).toHaveLength(1);
      expect((await historyOf(id)).map((h) => [h.fromTier, h.toTier, h.reason])).toEqual([['SILVER', 'BRONZE', 'Not renewed']]);
    });

    it('FR-TIR-05 with 14 grace days a Gold term ending 31.12 is Gold on 10.01 and Silver from 15.01', async () => {
      await setSettings({ graceDays: 14 });
      try {
        const id = await gold();
        await runAt('2028-01-10');
        expect((await rowOf(id)).currentTier).toBe('GOLD');
        expect(await termsOf(id)).toHaveLength(1);
        await runAt('2028-01-15');
        const [, downgrade] = await termsOf(id);
        expect(day(downgrade.startsOn)).toBe('2028-01-15');
        expect((await rowOf(id)).currentTier).toBe('SILVER');
      } finally {
        await setSettings({ graceDays: 0 });
      }
    });

    it('FR-TIR-07 a member who renewed in time is not stepped down, and a member already Bronze is left alone', async () => {
      const renewed = await seedMember('GOLD', [
        { tier: 'GOLD', source: 'PAID', startsOn: '2027-01-01', endsOn: '2027-12-31' },
        { tier: 'GOLD', source: 'PAID', startsOn: '2028-01-01', endsOn: '2028-12-31' },
      ]);
      const bronze = await seedMember('BRONZE', []);
      await runAt('2028-06-01');
      expect((await rowOf(renewed)).currentTier).toBe('GOLD');
      expect(await termsOf(renewed)).toHaveLength(2);
      expect(await historyOf(renewed)).toEqual([]);
      expect(await auditOf(bronze)).toEqual([]);
    });

    it('FR-TIR-07, FR-TIR-08 the step-down is written by the system: a downgrade term, a history row, an audit entry with no user', async () => {
      const id = await gold();
      await runAt('2028-01-01');
      const [row] = await historyOf(id);
      expect(row).toMatchObject({ fromTier: 'GOLD', toTier: 'SILVER', reason: 'Not renewed', changedByUserId: null });
      expect(day(row.createdAt)).toBe('2028-01-01');
      const audit = await auditOf(id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ userId: null, userRole: 'SYSTEM', action: 'STATUS_CHANGE' });
    });

    it('FR-TIR-08 the history of a member lists Silver (Purchase), Gold (Upgrade), Silver (Not renewed) with dates', async () => {
      const created = await members('admin').post('', { firstName: 'Hist', lastName: 'Ory', email: `h-${randomUUID()}@example.com` }).expect(201);
      const id = created.body.data.id as string;
      const pay = (kind: string, targetTier: string) => members('admin').post(`/${id}/payments`, { kind, targetTier, method: 'CASH', receivedOn: today() }).expect(201);
      await pay('NEW', 'SILVER');
      await pay('UPGRADE', 'GOLD');
      const goldEnd = (await termsOf(id)).find((t) => t.tier === 'GOLD')!.endsOn!;
      await runAt(plusDays(day(goldEnd), 1));
      const history = await historyOf(id);
      expect(history.map((h) => [h.fromTier, h.toTier, h.reason])).toEqual([
        ['BRONZE', 'SILVER', 'Purchase'],
        ['SILVER', 'GOLD', 'Upgrade'],
        ['GOLD', 'SILVER', 'Not renewed'],
      ]);
      expect(day(history[2].createdAt)).toBe(plusDays(day(goldEnd), 1));
    });
  });

  describe('NFR-REL-02 idempotent and catching up', () => {
    it('FR-TIR-07 a second run on the same day changes nothing: no term, no history, no audit entry, no notification', async () => {
      const id = await gold();
      await runAt('2028-01-01');
      const before = { summary: await summarise(id), audit: (await auditOf(id)).length, notices: await prisma.notification.count({ where: { tenantId } }) };
      await runAt('2028-01-01');
      await runAt('2028-01-01');
      expect({ summary: await summarise(id), audit: (await auditOf(id)).length, notices: await prisma.notification.count({ where: { tenantId } }) }).toEqual(before);
    });

    it('FR-TIR-07 after a two-day gap the result equals two daily runs', async () => {
      const daily = await gold();
      const gap = await gold();
      await runAt('2028-01-01', jobWith());
      await runAt('2028-01-02', jobWith());
      await runAt('2028-01-02', jobWith());
      // The gap member is only reached on the second day, by a run that skipped the first.
      expect(await summarise(gap)).toMatchObject({ tier: 'SILVER' });
      const strip = async (id: string) => {
        const s = await summarise(id);
        return { ...s, history: s.history };
      };
      expect(await strip(daily)).toEqual(await strip(gap));
    });

    it('NFR-REL-02 after a long gap the member steps down twice in one run, each step with its own date', async () => {
      const id = await gold();
      await runAt('2029-03-01');
      expect((await rowOf(id)).currentTier).toBe('BRONZE');
      const [, downgrade] = await termsOf(id);
      expect([day(downgrade.startsOn), day(downgrade.endsOn!)]).toEqual(['2028-01-01', '2028-12-31']);
      expect((await historyOf(id)).map((h) => [h.fromTier, h.toTier, h.reason, day(h.createdAt)])).toEqual([
        ['GOLD', 'SILVER', 'Not renewed', '2028-01-01'],
        ['SILVER', 'BRONZE', 'Not renewed', '2029-01-01'],
      ]);
      await runAt('2029-03-02');
      expect(await termsOf(id)).toHaveLength(2);
      expect(await historyOf(id)).toHaveLength(2);
    });

    it('NFR-DAT-02, NFR-REL-02 two runs at the same time create one downgrade term and one history row per ended term', async () => {
      const id = await gold();
      await Promise.all([runAt('2028-01-01', jobWith()), runAt('2028-01-01', jobWith()), runAt('2028-01-01', jobWith())]);
      expect(await prisma.memberTerm.count({ where: { memberId: id, source: 'DOWNGRADE' } })).toBe(1);
      expect(await historyOf(id)).toHaveLength(1);
    });

    it('NFR-DAT-02 the database refuses a second downgrade term for the same ended term', async () => {
      const id = await gold();
      await runAt('2028-01-01');
      const [ended, downgrade] = await termsOf(id);
      await expect(
        prisma.memberTerm.create({ data: { id: randomUUID(), memberId: id, tier: 'SILVER', source: 'DOWNGRADE', startsOn: asDate('2028-01-01'), endsOn: asDate('2028-12-31'), followsTermId: ended.id } })
      ).rejects.toThrow();
      expect(downgrade.followsTermId).toBe(ended.id);
    });

    it('NFR-REL-01 the workspace day decides: Europe/Tirane at 23:30 and 00:30 around the date change', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { timezone: 'Europe/Tirane' } });
      try {
        const id = await gold();
        // Winter: Tirane is UTC+1, so 22:30Z is 23:30 on 31.12 and 23:30Z is 00:30 on 01.01.
        await jobWith().run(new Date('2027-12-31T22:30:00.000Z'));
        expect((await rowOf(id)).currentTier).toBe('GOLD');
        await jobWith().run(new Date('2027-12-31T23:30:00.000Z'));
        expect((await rowOf(id)).currentTier).toBe('SILVER');
      } finally {
        await prisma.tenant.update({ where: { id: tenantId }, data: { timezone: 'UTC' } });
      }
    });
  });

  describe('expiring soon', () => {
    const expiringMember = (endsOn: string) => seedMember('GOLD', [{ tier: 'GOLD', source: 'PAID', startsOn: plusDays(endsOn, -364), endsOn }], plusDays(endsOn, -364));
    const listed = async (id: string) => {
      const res = await members('admin').get(`?query=${(await rowOf(id)).memberNumber}`).expect(200);
      return res.body.data.find((m: any) => m.id === id);
    };

    it('FR-TIR-10 a term ending in 30 days is Expiring soon and one ending in 31 days is Valid, on the list, the filter and the member page', async () => {
      const soon = await expiringMember(plusDays(today(), 30));
      const later = await expiringMember(plusDays(today(), 31));
      expect((await listed(soon)).expiringSoon).toBe(true);
      expect((await listed(later)).expiringSoon).toBe(false);
      expect((await members('admin').get(`/${soon}`).expect(200)).body.data.expiringSoon).toBe(true);
      expect((await members('admin').get(`/${later}`).expect(200)).body.data.expiringSoon).toBe(false);
      const filtered = (await members('admin').get('?expiringSoon=true&limit=100').expect(200)).body.data.map((m: any) => m.id);
      expect(filtered).toContain(soon);
      expect(filtered).not.toContain(later);
    });

    it('FR-TIR-10 a renewed member is not Expiring soon: the badge follows the latest paid term', async () => {
      const id = await seedMember('GOLD', [
        { tier: 'GOLD', source: 'PAID', startsOn: plusDays(today(), -335), endsOn: plusDays(today(), 10) },
        { tier: 'GOLD', source: 'PAID', startsOn: plusDays(today(), 11), endsOn: plusDays(today(), 375) },
      ]);
      expect((await listed(id)).expiringSoon).toBe(false);
    });

    it('FR-TIR-11 one summary notification per workspace goes to the users who can record payments, and nobody else', async () => {
      await prisma.memberTerm.updateMany({ where: { member: { tenantId } }, data: { expiringNotifiedAt: new Date() } });
      await prisma.notification.deleteMany({ where: { tenantId, type: 'MEMBERSHIP_EXPIRING' } });
      const a = await expiringMember(plusDays(today(), 5));
      const b = await expiringMember(plusDays(today(), 20));
      await expiringMember(plusDays(today(), 45));
      await runAt(today());

      const recorder = await notificationsOf('MEMBERSHIP_EXPIRING', users.recorder);
      expect(recorder).toHaveLength(1);
      expect(recorder[0].params).toMatchObject({ count: 2, windowDays: 30 });
      expect(recorder[0].actorUserId).toBeNull();
      for (const who of ['approver', 'agent', 'sales', 'reception'] as const) expect(await notificationsOf('MEMBERSHIP_EXPIRING', users[who])).toHaveLength(0);
      expect((await prisma.memberTerm.findMany({ where: { memberId: { in: [a, b] } } })).every((t) => t.expiringNotifiedAt !== null)).toBe(true);

      await runAt(today());
      expect(await notificationsOf('MEMBERSHIP_EXPIRING', users.recorder)).toHaveLength(1);
    });

    it('FR-TIR-11 a term that enters the window later is announced then, once', async () => {
      await prisma.memberTerm.updateMany({ where: { member: { tenantId } }, data: { expiringNotifiedAt: new Date() } });
      await prisma.notification.deleteMany({ where: { tenantId, type: 'MEMBERSHIP_EXPIRING' } });
      const id = await expiringMember(plusDays(today(), 40));
      await runAt(today());
      expect(await notificationsOf('MEMBERSHIP_EXPIRING')).toHaveLength(0);
      await runAt(plusDays(today(), 10));
      expect(await notificationsOf('MEMBERSHIP_EXPIRING', users.recorder)).toHaveLength(1);
      await runAt(plusDays(today(), 11));
      expect(await notificationsOf('MEMBERSHIP_EXPIRING', users.recorder)).toHaveLength(1);
      expect((await prisma.memberTerm.findFirstOrThrow({ where: { memberId: id } })).expiringNotifiedAt).not.toBeNull();
    });

    it('FR-TIR-11 a failing notification leaves no marker and is retried on the next run', async () => {
      await prisma.memberTerm.updateMany({ where: { member: { tenantId } }, data: { expiringNotifiedAt: new Date() } });
      await prisma.notification.deleteMany({ where: { tenantId, type: 'MEMBERSHIP_EXPIRING' } });
      const id = await expiringMember(plusDays(today(), 3));
      const failing = realNotifications();
      jest.spyOn(failing, 'emitStrict').mockRejectedValueOnce(new Error('mail down'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await runAt(today(), jobWith(failing));
      expect((await prisma.memberTerm.findFirstOrThrow({ where: { memberId: id } })).expiringNotifiedAt).toBeNull();
      expect(await notificationsOf('MEMBERSHIP_EXPIRING')).toHaveLength(0);

      await runAt(today(), jobWith(failing));
      expect(await notificationsOf('MEMBERSHIP_EXPIRING', users.recorder)).toHaveLength(1);
      jest.restoreAllMocks();
    });
  });

  describe('VIP', () => {
    const newVip = async () => {
      const created = await members('admin').post('', { firstName: 'Vip', lastName: `J${++counter}`, email: `v-${randomUUID()}@example.com` }).expect(201);
      const memberId = created.body.data.id as string;
      const requestId = (await members('agent').post(`/${memberId}/vip/request`, { reason: 'Strategic' }).expect(201)).body.data.id as string;
      await members('approver').post(`/vip/requests/${requestId}/decision`, { decision: 'APPROVE' }).expect(200);
      const term = await prisma.memberTerm.findFirstOrThrow({ where: { memberId, source: 'VIP' } });
      return { memberId, requestId, reviewDate: day(term.endsOn!) };
    };

    it('FR-VIP-04 the approvers are notified once, 30 days before the review date, and not 31 days before', async () => {
      await prisma.notification.deleteMany({ where: { tenantId, type: 'VIP_REVIEW_DUE' } });
      const vip = await newVip();
      await runAt(plusDays(vip.reviewDate, -31));
      expect(await notificationsOf('VIP_REVIEW_DUE')).toHaveLength(0);

      await runAt(plusDays(vip.reviewDate, -30));
      const forApprover = await notificationsOf('VIP_REVIEW_DUE', users.approver);
      expect(forApprover).toHaveLength(1);
      expect(forApprover[0]).toMatchObject({ entityType: 'MEMBER', entityId: vip.memberId, actorUserId: null });
      expect(forApprover[0].params).toMatchObject({ reviewDate: vip.reviewDate });
      for (const who of ['agent', 'sales', 'reception', 'recorder'] as const) expect(await notificationsOf('VIP_REVIEW_DUE', users[who])).toHaveLength(0);
      expect((await prisma.vipRequest.findUniqueOrThrow({ where: { id: vip.requestId } })).reviewNotifiedAt).not.toBeNull();

      await runAt(plusDays(vip.reviewDate, -29));
      await runAt(plusDays(vip.reviewDate, -30));
      expect(await notificationsOf('VIP_REVIEW_DUE', users.approver)).toHaveLength(1);
    });

    it('FR-VIP-04 a VIP re-approved before the end is not announced for the old review date', async () => {
      await prisma.notification.deleteMany({ where: { tenantId, type: 'VIP_REVIEW_DUE' } });
      const vip = await newVip();
      const again = (await members('agent').post(`/${vip.memberId}/vip/request`, { reason: 'Renew' }).expect(201)).body.data.id as string;
      await members('approver').post(`/vip/requests/${again}/decision`, { decision: 'APPROVE' }).expect(200);
      await runAt(plusDays(vip.reviewDate, -30));
      expect(await notificationsOf('VIP_REVIEW_DUE')).toHaveLength(0);
    });

    it('FR-VIP-04, FR-TIR-08 a VIP term that ended is Bronze the next day, by the system, with the reason VIP ended', async () => {
      const vip = await newVip();
      await runAt(vip.reviewDate);
      expect((await rowOf(vip.memberId)).currentTier).toBe('VIP');
      await runAt(plusDays(vip.reviewDate, 1));
      expect((await rowOf(vip.memberId)).currentTier).toBe('BRONZE');
      const history = await historyOf(vip.memberId);
      expect(history.map((h) => [h.fromTier, h.toTier, h.reason, h.changedByUserId])).toEqual([
        ['BRONZE', 'VIP', 'VIP approved', users.approver],
        ['VIP', 'BRONZE', 'VIP ended', null],
      ]);
      await runAt(plusDays(vip.reviewDate, 1));
      expect(await historyOf(vip.memberId)).toHaveLength(2);
    });
  });

  describe('correcting a tier', () => {
    const correct = (who: Who, id: string, body: object) => members(who).post(`/${id}/correct-tier`, body);
    const future = () => plusDays(today(), 400);

    it('FR-TIR-09 correcting a member to Gold until a date appears in the history and in the audit log', async () => {
      const id = await seedMember('BRONZE', [], today());
      const res = await correct('admin', id, { tier: 'GOLD', endsOn: future(), reason: 'Wrong tier entered' }).expect(200);
      expect(res.body.data).toMatchObject({ memberId: id, tier: 'GOLD', endsOn: future() });

      expect((await rowOf(id)).currentTier).toBe('GOLD');
      const [term] = await termsOf(id);
      expect(term).toMatchObject({ tier: 'GOLD', source: 'CORRECTION', paymentId: null });
      expect([day(term.startsOn), day(term.endsOn!)]).toEqual([today(), future()]);
      expect((await historyOf(id)).map((h) => [h.fromTier, h.toTier, h.reason, h.comment, h.changedByUserId])).toEqual([['BRONZE', 'GOLD', 'Correction', 'Wrong tier entered', users.admin]]);
      const audit = await auditOf(id);
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0].changes)).toContain('Wrong tier entered');
      expect((await members('admin').get(`/${id}`).expect(200)).body.data.tier).toBe('GOLD');
    });

    it('FR-TIR-09 the corrected tier ends with the term: the job records it as Correction ended', async () => {
      const id = await seedMember('BRONZE', [], today());
      await correct('admin', id, { tier: 'SILVER', endsOn: plusDays(today(), 10), reason: 'Goodwill' }).expect(200);
      await runAt(plusDays(today(), 11));
      expect((await rowOf(id)).currentTier).toBe('BRONZE');
      expect((await historyOf(id)).map((h) => h.reason)).toEqual(['Correction', 'Correction ended']);
    });

    it('FR-TIR-09 a reason, a valid tier and a date that is not in the past are required', async () => {
      const id = await seedMember('BRONZE', [], today());
      expect((await correct('admin', id, { tier: 'GOLD', endsOn: future(), reason: '  ' }).expect(400)).body.field).toBe('reason');
      expect((await correct('admin', id, { tier: 'GOLD', endsOn: plusDays(today(), -1), reason: 'x' }).expect(400)).body.field).toBe('endsOn');
      expect((await correct('admin', id, { tier: 'GOLD', endsOn: 'soon', reason: 'x' }).expect(400)).body.field).toBe('endsOn');
      expect((await correct('admin', id, { tier: 'VIP', endsOn: future(), reason: 'x' }).expect(400)).body.field).toBe('tier');
      await correct('admin', id, { tier: 'GOLD', endsOn: future() }).expect(400);
      await correct('admin', id, { tier: 'GOLD', endsOn: future(), reason: 'x', memberId: 'other' }).expect(400);
      await correct('admin', 'nonexistent', { tier: 'GOLD', endsOn: future(), reason: 'x' }).expect(404);
      expect(await termsOf(id)).toEqual([]);
    });

    it('FR-TIR-09, FR-RBAC-28 a user without "Wellness+ settings: manage" gets 403', async () => {
      const id = await seedMember('BRONZE', [], today());
      for (const who of ['approver', 'recorder', 'agent', 'sales', 'reception'] as const) await correct(who, id, { tier: 'GOLD', endsOn: future(), reason: 'x' }).expect(403);
      expect(await termsOf(id)).toEqual([]);
    });
  });
});
