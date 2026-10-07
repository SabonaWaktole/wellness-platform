import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { addDays } from '../../../src/contracts/domain/calendarDay';
import { termEndDate } from '../../../src/membership/domain/termDates';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaMembershipSeeder } from '../../../src/membership/infrastructure/PrismaMembershipSeeder';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const day = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = () => day(new Date());
const plusDays = (iso: string, n: number) => day(addDays(asDate(iso), n));

describe('Wellness+ VIP requests and approval (M4 Slice 7)', () => {
  const tenantId = `t-wp-vip-${randomUUID()}`;
  const uid = (label: string) => `u-wpv-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), approver: uid('approver'), agent: uid('agent'), sales: uid('sales'), reception: uid('reception'), ceo: uid('ceo') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;

  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const members = (who: Who) => ({
    get: (p: string) => authed(who)(request(app).get(`/api/${tenantId}/membership/members${p}`)),
    post: (p: string, body: object = {}) => authed(who)(request(app).post(`/api/${tenantId}/membership/members${p}`)).send(body),
  });

  let counter = 0;
  const newMember = async () => {
    counter += 1;
    const res = await members('admin').post('', { firstName: `Vip${counter}`, lastName: `Member${counter}`, email: `vip${counter}-${randomUUID()}@example.com` }).expect(201);
    return res.body.data as { id: string; memberNumber: string };
  };
  const requestVip = (who: Who, memberId: string, reason: unknown = 'Strategic client') => members(who).post(`/${memberId}/vip/request`, { reason });
  const decide = (who: Who, requestId: string, body: object) => members(who).post(`/vip/requests/${requestId}/decision`, body);
  const endVip = (who: Who, memberId: string, reason: unknown = 'Partnership ended') => members(who).post(`/${memberId}/vip/end`, { reason });
  const openRequest = async (memberId: string, who: Who = 'agent') => (await requestVip(who, memberId).expect(201)).body.data.id as string;
  const approve = async (requestId: string, who: Who = 'approver') => (await decide(who, requestId, { decision: 'APPROVE' }).expect(200)).body.data;
  const detail = async (memberId: string) => (await members('admin').get(`/${memberId}`).expect(200)).body.data;
  const rowOf = (id: string) => prisma.member.findUniqueOrThrow({ where: { id } });
  const vipTerms = (memberId: string) => prisma.memberTerm.findMany({ where: { memberId, source: 'VIP' }, orderBy: { startsOn: 'asc' } });
  const history = (memberId: string) => prisma.memberTierHistory.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } });
  const audit = (memberId: string) => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Member', entityId: memberId }, orderBy: { at: 'asc' } });
  const makeGold = async (memberId: string) =>
    members('admin').post(`/${memberId}/payments`, { kind: 'NEW', targetTier: 'GOLD', method: 'CASH', receivedOn: today() }).expect(201);

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Wellness Test', urlSlug: tenantId, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const customRole = async (keys: string[]) => {
      const id = `r-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `k-${randomUUID()}`, nameSq: 'r', nameEn: 'r', isSystem: false, baseKey: RoleKey.Reception, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    // The Membership Agent preset (D17): Reception plus manage, but no approval.
    const agentRole = await customRole(['members.view', 'members.manage']);
    const approverRole = await customRole(['members.view', 'members.vip.approve']);
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.approver, approverRole, 'Dea'),
        user(users.agent, agentRole, 'Mira'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cem'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('requesting', () => {
    it('FR-VIP-01 a request without a reason is refused; with one it is Pending and shown on the member page', async () => {
      const member = await newMember();
      expect((await requestVip('agent', member.id, '  ').expect(400)).body.field).toBe('reason');
      await members('agent').post(`/${member.id}/vip/request`, {}).expect(400);
      expect(await prisma.vipRequest.count({ where: { memberId: member.id } })).toBe(0);

      const created = (await requestVip('agent', member.id, ' Key partner ').expect(201)).body.data;
      expect(created).toMatchObject({ status: 'PENDING', reason: 'Key partner', requestedBy: { id: users.agent, name: 'Mira Test' } });
      const page = await detail(member.id);
      expect(page.vip.requests).toHaveLength(1);
      expect(page.vip.requests[0]).toMatchObject({ id: created.id, status: 'PENDING' });
      expect(page.tier).toBe('BRONZE');
    });

    it('FR-VIP-01 a second open request is refused, and a new one is allowed once the first is decided', async () => {
      const member = await newMember();
      const first = await openRequest(member.id);
      expect((await requestVip('agent', member.id).expect(409)).body.reason).toBe('OPEN_REQUEST');
      await decide('approver', first, { decision: 'REJECT', note: 'Not now' }).expect(200);
      await requestVip('agent', member.id).expect(201);
    });

    it('FR-VIP-01, NFR-DAT-02 two parallel requests create one and refuse the other', async () => {
      const member = await newMember();
      const results = await Promise.all([requestVip('agent', member.id, 'A'), requestVip('admin', member.id, 'B')]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.vipRequest.count({ where: { memberId: member.id, status: 'PENDING' } })).toBe(1);
    });

    it('NFR-DAT-02 the database itself refuses a second pending request on PostgreSQL', async () => {
      const member = await newMember();
      await openRequest(member.id);
      const insert = () => prisma.vipRequest.create({ data: { id: randomUUID(), tenantId, memberId: member.id, requestedBy: users.agent, reason: 'again' } });
      // The partial unique index exists only on PostgreSQL; MySQL relies on the use case.
      const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM pg_indexes WHERE indexname = 'VipRequest_one_pending_per_member'`;
      if (Number(count) > 0) await expect(insert()).rejects.toThrow();
    });

    it('FR-VIP-01 a closed member cannot be requested', async () => {
      const member = await newMember();
      await members('admin').post(`/${member.id}/status`, { action: 'CLOSE', reason: 'Left' }).expect(200);
      expect((await requestVip('agent', member.id).expect(409)).body.reason).toBe('MEMBER_CLOSED');
    });

    it('FR-RBAC-28 only Members: manage can request; a Sales User, Reception and the CEO get 403', async () => {
      const member = await newMember();
      for (const who of ['sales', 'reception', 'ceo'] as const) await requestVip(who, member.id).expect(403);
      await requestVip('agent', 'nonexistent').expect(404);
    });
  });

  describe('deciding', () => {
    it('FR-VIP-02 a user cannot decide a request they made, even holding the permission; a second approver can', async () => {
      const member = await newMember();
      const own = (await requestVip('admin', member.id).expect(201)).body.data.id as string;
      expect((await decide('admin', own, { decision: 'APPROVE' }).expect(409)).body.reason).toBe('OWN_REQUEST');
      expect((await decide('admin', own, { decision: 'REJECT', note: 'no' }).expect(409)).body.reason).toBe('OWN_REQUEST');
      expect((await prisma.vipRequest.findUniqueOrThrow({ where: { id: own } })).status).toBe('PENDING');
      expect(await vipTerms(member.id)).toHaveLength(0);
      expect((await approve(own)).status).toBe('APPROVED');
    });

    it('FR-VIP-02 a user without the approval permission gets 403, the Membership Agent preset included', async () => {
      const member = await newMember();
      const id = await openRequest(member.id, 'admin');
      for (const who of ['agent', 'sales', 'reception', 'ceo'] as const) {
        await decide(who, id, { decision: 'APPROVE' }).expect(403);
        await members(who).get('/vip/requests').expect(403);
        await endVip(who, member.id).expect(403);
      }
      expect((await prisma.vipRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    });

    it('FR-VIP-02 a rejection needs a reason and creates no term', async () => {
      const member = await newMember();
      const id = await openRequest(member.id);
      expect((await decide('approver', id, { decision: 'REJECT' }).expect(400)).body.field).toBe('reason');
      await decide('approver', id, { decision: 'MAYBE' }).expect(400);
      const rejected = (await decide('approver', id, { decision: 'REJECT', note: 'Not strategic' }).expect(200)).body.data;
      expect(rejected).toMatchObject({ status: 'REJECTED', decisionNote: 'Not strategic', decidedBy: { id: users.approver, name: 'Dea Test' } });
      expect(await vipTerms(member.id)).toHaveLength(0);
      expect((await rowOf(member.id)).currentTier).toBe('BRONZE');
      expect((await decide('admin', id, { decision: 'APPROVE' }).expect(409)).body.reason).toBe('NOT_PENDING');
    });

    it('FR-VIP-02, NFR-DAT-02 two parallel approvals create one term', async () => {
      const member = await newMember();
      const id = await openRequest(member.id);
      const results = await Promise.all([decide('approver', id, { decision: 'APPROVE' }), decide('admin', id, { decision: 'APPROVE' })]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await vipTerms(member.id)).toHaveLength(1);
    });

    it('FR-VIP-02 an unknown request is a 404', async () => {
      await decide('approver', 'nonexistent', { decision: 'APPROVE' }).expect(404);
    });

    it('FR-VIP-02 the approvers see the requests, newest first, filtered by status', async () => {
      const member = await newMember();
      const id = await openRequest(member.id);
      const pending = (await members('approver').get('/vip/requests?status=PENDING').expect(200)).body;
      expect(pending.data.map((r: any) => r.id)).toContain(id);
      expect(pending.data.find((r: any) => r.id === id).member).toMatchObject({ id: member.id, memberNumber: member.memberNumber });
      await approve(id);
      const stillPending = (await members('approver').get('/vip/requests?status=PENDING&limit=100').expect(200)).body.data;
      expect(stillPending.map((r: any) => r.id)).not.toContain(id);
    });
  });

  describe('approval', () => {
    it('FR-VIP-03, FR-TIR-08 an approval creates a free 12-month VIP term with the review date, history "VIP approved" and no payment', async () => {
      const member = await newMember();
      await approve(await openRequest(member.id));
      const [term] = await vipTerms(member.id);
      const expectedEnd = day(termEndDate(asDate(today()), 12));
      expect([day(term.startsOn), day(term.endsOn!), term.paymentId]).toEqual([today(), expectedEnd, null]);
      expect((await rowOf(member.id)).currentTier).toBe('VIP');
      const [row] = await history(member.id);
      expect(row).toMatchObject({ fromTier: 'BRONZE', toTier: 'VIP', reason: 'VIP approved', changedByUserId: users.approver });
      expect(row.comment).toContain(expectedEnd);
      expect(await prisma.memberPayment.count({ where: { memberId: member.id } })).toBe(0);

      const page = await detail(member.id);
      expect(page).toMatchObject({ tier: 'VIP', currentTerm: { source: 'VIP', startsOn: today(), endsOn: expectedEnd }, vip: { reviewDate: expectedEnd } });
      expect(page.vip.requests[0]).toMatchObject({ status: 'APPROVED', decidedBy: { name: 'Dea Test' } });
    });

    it('FR-VIP-03 a Gold member becomes VIP and keeps the Gold term', async () => {
      const member = await newMember();
      await makeGold(member.id);
      await approve(await openRequest(member.id));
      expect((await history(member.id)).map((h) => [h.fromTier, h.toTier, h.reason])).toEqual([
        ['BRONZE', 'GOLD', 'Purchase'],
        ['GOLD', 'VIP', 'VIP approved'],
      ]);
      expect(await prisma.memberTerm.count({ where: { memberId: member.id, source: 'PAID' } })).toBe(1);
    });

    it('FR-VIP-04 an approval before the end extends VIP from the next day and adds no tier change', async () => {
      const member = await newMember();
      await approve(await openRequest(member.id));
      await approve(await openRequest(member.id));
      const [first, second] = await vipTerms(member.id);
      const firstEnd = day(first.endsOn!);
      expect(day(second.startsOn)).toBe(plusDays(firstEnd, 1));
      expect(day(second.endsOn!)).toBe(day(termEndDate(asDate(plusDays(firstEnd, 1)), 12)));
      expect(await history(member.id)).toHaveLength(1);
      expect((await detail(member.id)).vip.reviewDate).toBe(day(second.endsOn!));
    });

    it('FR-VIP-04 a new approval after the VIP ended starts today', async () => {
      const member = await newMember();
      await prisma.memberTerm.create({
        data: { id: randomUUID(), memberId: member.id, tier: 'VIP', source: 'VIP', startsOn: asDate(plusDays(today(), -400)), endsOn: asDate(plusDays(today(), -35)) },
      });
      await approve(await openRequest(member.id));
      const terms = await vipTerms(member.id);
      expect(day(terms[1].startsOn)).toBe(today());
    });

    it('FR-VIP-04 the "VIP review due" filter lists a member 30 days before the end, and not 31, and not once extended', async () => {
      const due = await newMember();
      const later = await newMember();
      const extended = await newMember();
      const vip = (memberId: string, startOffset: number, endOffset: number) =>
        prisma.memberTerm.create({
          data: { id: randomUUID(), memberId, tier: 'VIP', source: 'VIP', startsOn: asDate(plusDays(today(), startOffset)), endsOn: asDate(plusDays(today(), endOffset)) },
        });
      await vip(due.id, -335, 30);
      await vip(later.id, -334, 31);
      await vip(extended.id, -335, 30);
      await vip(extended.id, 31, 395);
      const ids = (await members('admin').get('/?vipReviewDue=true&limit=100').expect(200)).body.data.map((m: any) => m.id);
      expect(ids).toContain(due.id);
      expect(ids).not.toContain(later.id);
      expect(ids).not.toContain(extended.id);
    });

    it('FR-VIP-03 a VIP buys nothing: the payment is refused', async () => {
      const member = await newMember();
      await approve(await openRequest(member.id));
      await members('admin').post(`/${member.id}/payments`, { kind: 'NEW', targetTier: 'GOLD', method: 'CASH', receivedOn: today() }).expect(409);
      expect(await prisma.memberPayment.count({ where: { memberId: member.id } })).toBe(0);
    });

    it('FR-VIP-02 a request for a member closed after the request cannot be approved', async () => {
      const member = await newMember();
      const id = await openRequest(member.id);
      await members('admin').post(`/${member.id}/status`, { action: 'CLOSE', reason: 'Left' }).expect(200);
      expect((await decide('approver', id, { decision: 'APPROVE' }).expect(409)).body.reason).toBe('MEMBER_CLOSED');
    });
  });

  describe('ending', () => {
    it('FR-VIP-05 ending VIP makes the member Bronze the same day, with the reason in the history', async () => {
      const member = await newMember();
      await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: member.id, tier: 'VIP', source: 'VIP', startsOn: asDate(plusDays(today(), -10)), endsOn: asDate(plusDays(today(), 355)) } });
      await prisma.member.update({ where: { id: member.id }, data: { currentTier: 'VIP' } });
      const ended = (await endVip('approver', member.id, 'Partnership ended').expect(200)).body.data;
      expect(ended.endedOn).toBe(today());
      expect(await detail(member.id)).toMatchObject({ tier: 'BRONZE', vip: { reviewDate: null } });
      expect((await rowOf(member.id)).currentTier).toBe('BRONZE');
      const [term] = await vipTerms(member.id);
      expect([day(term.endsOn!), day(term.originalEndsOn!)]).toEqual([plusDays(today(), -1), plusDays(today(), 355)]);
      expect(await history(member.id)).toEqual([expect.objectContaining({ fromTier: 'VIP', toTier: 'BRONZE', reason: 'VIP ended', comment: 'Partnership ended', changedByUserId: users.approver })]);
    });

    it('FR-VIP-05 a member who also holds Gold falls to Gold, and an approval made today is removed', async () => {
      const member = await newMember();
      await makeGold(member.id);
      const id = await openRequest(member.id);
      await approve(id);
      await endVip('admin', member.id).expect(200);
      expect(await vipTerms(member.id)).toHaveLength(0);
      expect((await rowOf(member.id)).currentTier).toBe('GOLD');
      expect((await history(member.id)).map((h) => h.reason)).toEqual(['Purchase', 'VIP approved', 'VIP ended']);
      const request = await prisma.vipRequest.findUniqueOrThrow({ where: { id } });
      expect([request.endedBy, request.endReason]).toEqual([users.admin, 'Partnership ended']);
      expect((await detail(member.id)).vip.requests[0]).toMatchObject({ endedBy: { name: 'Ana Test' }, endReason: 'Partnership ended' });
    });

    it('FR-VIP-05 ending needs a reason, and a member who is not VIP is refused', async () => {
      const member = await newMember();
      expect((await endVip('admin', member.id, 'x').expect(409)).body.reason).toBe('NOT_VIP');
      await approve(await openRequest(member.id));
      expect((await endVip('admin', member.id, ' ').expect(400)).body.field).toBe('reason');
      expect((await rowOf(member.id)).currentTier).toBe('VIP');
      await endVip('admin', 'nonexistent').expect(404);
    });

    it('FR-VIP-05 ending a VIP whose extension has not started removes both terms', async () => {
      const member = await newMember();
      await approve(await openRequest(member.id));
      await approve(await openRequest(member.id));
      await endVip('admin', member.id).expect(200);
      expect(await vipTerms(member.id)).toHaveLength(0);
      expect((await rowOf(member.id)).currentTier).toBe('BRONZE');
    });
  });

  describe('audit', () => {
    it('FR-AUD-14 the request, the decision and the ending each write one audit entry, with old and new values', async () => {
      const member = await newMember();
      const before = (await audit(member.id)).length;
      const id = await openRequest(member.id);
      expect(await audit(member.id)).toHaveLength(before + 1);
      await approve(id);
      expect(await audit(member.id)).toHaveLength(before + 2);
      await endVip('admin', member.id, 'Partnership ended').expect(200);
      const entries = (await audit(member.id)).slice(before);
      expect(entries).toHaveLength(3);
      expect(JSON.stringify(entries[0].changes)).toContain('Strategic client');
      expect(JSON.stringify(entries[1].changes)).toEqual(expect.stringContaining('APPROVED'));
      expect(JSON.stringify(entries[1].changes)).toContain('vipReviewDate');
      expect(JSON.stringify(entries[2].changes)).toContain('Partnership ended');
      expect(entries.map((e) => e.userId)).toEqual([users.agent, users.approver, users.admin]);
    });

    it('FR-AUD-14 a rejection is audited too', async () => {
      const member = await newMember();
      const before = (await audit(member.id)).length;
      await decide('approver', await openRequest(member.id), { decision: 'REJECT', note: 'Not now' }).expect(200);
      const entries = (await audit(member.id)).slice(before);
      expect(entries).toHaveLength(2);
      expect(JSON.stringify(entries[1].changes)).toContain('REJECTED');
    });

    it('FR-AUD-14 a failed audit write rolls the approval back', async () => {
      const { PrismaMembershipWriteTransaction } = await import('../../../src/membership/infrastructure/PrismaMembershipWriteTransaction');
      const { DecideVipRequestUseCase } = await import('../../../src/membership/application/use-cases/VipUseCases');
      const { PrismaAuditTrail } = await import('../../../src/audit/infrastructure/PrismaAuditTrail');
      const member = await newMember();
      const id = await openRequest(member.id);
      const failing = new PrismaMembershipWriteTransaction(prisma, (client) => {
        const real = new PrismaAuditTrail(client);
        return { ...real, record: async () => { throw new Error('audit down'); } } as any;
      });
      const useCase = new DecideVipRequestUseCase(failing);
      const access = { ensure: () => undefined, userId: users.approver, auditRole: 'x' } as any;
      await expect(useCase.execute({ access, tenantId, timezone: 'UTC', requestId: id, decision: 'APPROVE' })).rejects.toThrow('audit down');
      expect(await vipTerms(member.id)).toHaveLength(0);
      expect((await prisma.vipRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
      expect((await rowOf(member.id)).currentTier).toBe('BRONZE');
    });
  });

  it('UAT-5 steps 1 and 2: approving one\'s own request is refused; approving the agent\'s creates a free 12-month VIP with a review date', async () => {
    const member = await newMember();
    const ownRequest = (await requestVip('admin', member.id, 'Key partner').expect(201)).body.data.id as string;
    await decide('admin', ownRequest, { decision: 'APPROVE' }).expect(409);
    await decide('approver', ownRequest, { decision: 'REJECT', note: 'Requested by an approver; re-submit by an agent' }).expect(200);

    const agentRequest = await openRequest(member.id, 'agent');
    const approved = await approve(agentRequest, 'admin');
    expect(approved.status).toBe('APPROVED');
    const page = await detail(member.id);
    const expectedEnd = day(termEndDate(asDate(today()), 12));
    expect(page).toMatchObject({ tier: 'VIP', vip: { reviewDate: expectedEnd } });
    expect(page.payments ?? []).toEqual([]);
  });
});
