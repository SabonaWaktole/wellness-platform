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
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const day = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (n: number) => day(addDays(new Date(`${day(new Date())}T00:00:00.000Z`), -n));
const today = () => daysAgo(0);
const plusDays = (iso: string, n: number) => day(addDays(new Date(`${iso}T00:00:00.000Z`), n));

describe('Wellness+ family members (M4 Slice 6)', () => {
  const tenantId = `t-wp-fam-${randomUUID()}`;
  const uid = (label: string) => `u-wpf-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), ceo: uid('ceo'), sales: uid('sales'), reception: uid('reception'), manageOnly: uid('manage') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;

  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const members = (who: Who) => ({
    get: (p: string) => authed(who)(request(app).get(`/api/${tenantId}/membership/members${p}`)),
    post: (p: string, body: object = {}) => authed(who)(request(app).post(`/api/${tenantId}/membership/members${p}`)).send(body),
  });

  let counter = 0;
  const newMember = async (extra: object = {}) => {
    counter += 1;
    const res = await members('admin').post('', { firstName: `Pay${counter}`, lastName: `Member${counter}`, email: `pay${counter}-${randomUUID()}@example.com`, ...extra }).expect(201);
    return res.body.data as { id: string; memberNumber: string };
  };
  const pay = (who: Who, memberId: string, body: object) => members(who).post(`/${memberId}/payments`, { method: 'CASH', receivedOn: today(), ...body });
  const record = async (memberId: string, body: object) => (await pay('admin', memberId, body).expect(201)).body.data;
  const detail = async (memberId: string, who: Who = 'admin') => (await members(who).get(`/${memberId}`).expect(200)).body.data;
  const rowOf = (id: string) => prisma.member.findUniqueOrThrow({ where: { id } });
  const termsOf = (memberId: string) => prisma.memberTerm.findMany({ where: { memberId }, orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }] });
  const audit = (entityId?: string) => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'MemberPayment', ...(entityId ? { entityId } : {}) }, orderBy: { at: 'asc' } });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Wellness Test', urlSlug: tenantId, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const manageRole = `r-manage-${randomUUID()}`;
    await prisma.role.create({
      data: {
        id: manageRole, tenantId, key: `manage-${randomUUID()}`, nameSq: 'm', nameEn: 'm', isSystem: false, baseKey: RoleKey.Reception,
        permissions: { create: ['members.view', 'members.manage'].map((permissionKey) => ({ permissionKey, scope: 'ALL' })) },
      },
    });
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cem'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
        user(users.manageOnly, manageRole, 'Mira'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  let relationships: Record<string, string>;
  const link = (who: Who, principalId: string, body: object) => members(who).post(`/${principalId}/family`, { confirmed: true, ...body });
  const addNew = async (principalId: string, relationship = 'Spouse or partner') => {
    counter += 1;
    const res = await link('admin', principalId, {
      relationshipId: relationships[relationship],
      member: { firstName: `Fam${counter}`, lastName: `Person${counter}`, email: `fam${counter}-${randomUUID()}@example.com` },
    }).expect(201);
    return res.body.data as { id: string; memberNumber: string };
  };
  const quote = async (memberId: string, kind: string, targetTier: string) => (await members('admin').get(`/${memberId}/payments/quote?kind=${kind}&targetTier=${targetTier}`).expect(200)).body.data;
  const makeGold = async () => {
    const principal = await newMember();
    await record(principal.id, { kind: 'NEW', targetTier: 'GOLD' });
    return principal;
  };

  beforeAll(async () => {
    relationships = Object.fromEntries((await prisma.familyRelationship.findMany({ where: { tenantId } })).map((r) => [r.nameEn, r.id]));
  });

  describe('adding and linking', () => {
    it('FR-FAM-01 saving without a relationship or without the confirmation is refused, and the page shows who confirmed and when', async () => {
      const principal = await newMember();
      const body = { member: { firstName: 'Lira', lastName: 'Kola', phone: '+355691112233' } };
      expect((await members('admin').post(`/${principal.id}/family`, { confirmed: true, ...body })).status).toBe(400);
      const noTick = await members('admin').post(`/${principal.id}/family`, { relationshipId: relationships['Child'], confirmed: false, ...body }).expect(400);
      expect(noTick.body.field).toBe('confirmation');
      expect(await prisma.member.count({ where: { tenantId, firstName: 'Lira' } })).toBe(0);

      const created = await link('admin', principal.id, { relationshipId: relationships['Child'], ...body }).expect(201);
      const page = await detail(created.body.data.id);
      expect(page.family.principal).toMatchObject({ id: principal.id, memberNumber: principal.memberNumber, relationship: { nameEn: 'Child' }, confirmedBy: 'Ana Test' });
      expect(page.family.principal.confirmedAt).toBeTruthy();
      const row = await rowOf(created.body.data.id);
      expect([row.principalMemberId, row.relationshipConfirmedBy]).toEqual([principal.id, users.admin]);
    });

    it('FR-FAM-01, FR-FAM-07, FR-AUD-14 an existing member can be linked, and the link and the confirmation are audited', async () => {
      const principal = await newMember();
      const existing = await newMember();
      await link('admin', principal.id, { relationshipId: relationships['Parent'], memberId: existing.id }).expect(201);
      const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Member', entityId: existing.id } });
      const linkEntry = entries.find((e) => JSON.stringify(e.changes).includes('relationshipConfirmed'))!;
      expect(JSON.stringify(linkEntry.changes)).toContain(principal.memberNumber);
      expect(JSON.stringify(linkEntry.changes)).toContain(users.admin);
    });

    it('FR-FAM-01 a new member that looks like an existing one is a duplicate, as on the member form', async () => {
      const principal = await newMember();
      const other = await newMember();
      const email = (await rowOf(other.id)).email!;
      await link('admin', principal.id, { relationshipId: relationships['Child'], member: { firstName: 'X', lastName: 'Y', email } }).expect(409);
    });

    it('FR-FAM-02 a deactivated relationship is refused for a new link and still shown on an existing one', async () => {
      const principal = await newMember();
      const child = await addNew(principal.id, 'Child');
      await prisma.familyRelationship.update({ where: { id: relationships['Child'] }, data: { active: false } });
      try {
        const another = await newMember();
        await link('admin', principal.id, { relationshipId: relationships['Child'], memberId: another.id }).expect(400);
        expect((await detail(child.id)).family.principal.relationship.nameEn).toBe('Child');
        expect((await detail(principal.id)).family.dependants[0].relationship.nameEn).toBe('Child');
      } finally {
        await prisma.familyRelationship.update({ where: { id: relationships['Child'] }, data: { active: true } });
      }
    });

    it('FR-FAM-03, NFR-DAT-02 self-link, a family member as principal, a second principal and a principal as family member are all refused', async () => {
      const principal = await newMember();
      const child = await addNew(principal.id);
      const rel = relationships['Parent'];
      expect((await link('admin', principal.id, { relationshipId: rel, memberId: principal.id }).expect(409)).body.reason).toBe('SELF_LINK');
      const third = await newMember();
      expect((await link('admin', child.id, { relationshipId: rel, memberId: third.id }).expect(409)).body.reason).toBe('PRINCIPAL_IS_FAMILY_MEMBER');
      const other = await newMember();
      expect((await link('admin', other.id, { relationshipId: rel, memberId: child.id }).expect(409)).body.reason).toBe('ALREADY_HAS_PRINCIPAL');
      expect((await link('admin', other.id, { relationshipId: rel, memberId: principal.id }).expect(409)).body.reason).toBe('MEMBER_IS_PRINCIPAL');
      expect((await rowOf(child.id)).principalMemberId).toBe(principal.id);
    });

    it('FR-RBAC-28 only Members: manage can add or remove a family member', async () => {
      const principal = await newMember();
      const body = { relationshipId: relationships['Child'], member: { firstName: 'A', lastName: 'B', phone: '+355691119999' } };
      await link('sales', principal.id, body).expect(403);
      await link('reception', principal.id, body).expect(403);
      await link('ceo', principal.id, body).expect(403);
      await link('manageOnly', principal.id, body).expect(201);
    });
  });

  it('FR-FAM-02 the add dialog lists only the active relationships, for Members: manage', async () => {
    await prisma.familyRelationship.update({ where: { id: relationships['Parent'] }, data: { active: false } });
    try {
      const names = (await members('manageOnly').get('/family/relationships').expect(200)).body.data.map((r: any) => r.nameEn);
      expect(names).toEqual(expect.arrayContaining(['Child', 'Spouse or partner']));
      expect(names).not.toContain('Parent');
      await members('sales').get('/family/relationships').expect(403);
    } finally {
      await prisma.familyRelationship.update({ where: { id: relationships['Parent'] }, data: { active: true } });
    }
  });

  describe('family pricing', () => {
    it('FR-FAM-04, FR-FAM-05 principal Gold: family Silver is 60.00 less 50% = 30.00, stored with the list fee and the percent, and the quote carries the reason line', async () => {
      const principal = await makeGold();
      const spouse = await addNew(principal.id);
      const q = await quote(spouse.id, 'NEW', 'SILVER');
      expect([q.listFee, q.discountPercent, q.amount]).toEqual(['60.00', '50.00', '30.00']);
      expect(q.family).toMatchObject({ principalMemberId: principal.id, relationshipNameEn: 'Spouse or partner' });
      const paid = await record(spouse.id, { kind: 'NEW', targetTier: 'SILVER' });
      expect([paid.listFee, paid.discountPercent, paid.amount]).toEqual(['60.00', '50.00', '30.00']);
    });

    it('FR-FAM-04 family Silver to Gold is 20.00, and a principal upgraded later does not change an earlier payment', async () => {
      const principal = await newMember();
      const spouse = await addNew(principal.id);
      await record(principal.id, { kind: 'NEW', targetTier: 'SILVER' });
      const first = await record(spouse.id, { kind: 'NEW', targetTier: 'SILVER' });
      await record(principal.id, { kind: 'UPGRADE', targetTier: 'GOLD' });
      expect((await quote(spouse.id, 'UPGRADE', 'GOLD')).amount).toBe('20.00');
      const again = (await detail(spouse.id)).payments.find((p: any) => p.id === first.id);
      expect(again.amount).toBe('30.00');
    });

    it('FR-FAM-04 principal Bronze or Suspended: the family member pays the full price', async () => {
      const bronze = await newMember();
      const a = await addNew(bronze.id);
      expect((await quote(a.id, 'NEW', 'SILVER')).amount).toBe('60.00');
      expect((await quote(a.id, 'NEW', 'SILVER')).family).toBeNull();

      const suspended = await makeGold();
      const b = await addNew(suspended.id);
      expect((await quote(b.id, 'NEW', 'SILVER')).amount).toBe('30.00');
      await members('admin').post(`/${suspended.id}/status`, { action: 'SUSPEND', reason: 'test' }).expect(200);
      expect((await quote(b.id, 'NEW', 'SILVER')).amount).toBe('60.00');
    });

    it('FR-FAM-06 after removal the next Silver purchase is 60.00, the terms remain, and the removal is on the history and the audit trail', async () => {
      const principal = await makeGold();
      const spouse = await addNew(principal.id);
      await record(spouse.id, { kind: 'NEW', targetTier: 'SILVER' });
      const termsBefore = await termsOf(spouse.id);

      await members('admin').post(`/${spouse.id}/family/remove`, {}).expect(400);
      await members('admin').post(`/${spouse.id}/family/remove`, { reason: '   ' }).expect(400);
      await members('admin').post(`/${spouse.id}/family/remove`, { reason: 'Divorced' }).expect(200);
      expect((await members('admin').post(`/${spouse.id}/family/remove`, { reason: 'again' }).expect(409)).body.reason).toBe('NOT_A_FAMILY_MEMBER');

      expect(await termsOf(spouse.id)).toEqual(termsBefore);
      expect((await quote(spouse.id, 'RENEWAL', 'SILVER')).amount).toBe('60.00');
      const page = await detail(spouse.id);
      expect(page.family.principal).toBeNull();
      expect(page.family.history.map((h: any) => `${h.kind}:${h.reason ?? ''}`)).toEqual(['REMOVED:Divorced', 'LINKED:']);
      expect((await detail(principal.id)).family.dependants).toEqual([]);
      const removal = (await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Member', entityId: spouse.id } })).find((e) => JSON.stringify(e.changes).includes('Divorced'));
      expect(removal).toBeTruthy();
      // The member can be linked again later.
      await link('admin', principal.id, { relationshipId: relationships['Spouse or partner'], memberId: spouse.id }).expect(201);
    });
  });

  describe('the group on both pages', () => {
    it('FR-FAM-07, FR-MEM-08 the principal lists the group with relationship, tier and validity, and each member shows the principal', async () => {
      const principal = await makeGold();
      const spouse = await addNew(principal.id);
      const child = await addNew(principal.id, 'Child');
      await record(spouse.id, { kind: 'NEW', targetTier: 'SILVER' });
      await members('admin').post(`/${child.id}/status`, { action: 'SUSPEND', reason: 'x' }).expect(200);

      const group = (await detail(principal.id)).family;
      expect(group.principal).toBeNull();
      const byId = Object.fromEntries(group.dependants.map((d: any) => [d.id, d]));
      expect(byId[spouse.id]).toMatchObject({ relationship: { nameEn: 'Spouse or partner' }, tier: 'SILVER', valid: true, confirmedBy: 'Ana Test' });
      expect(byId[child.id]).toMatchObject({ relationship: { nameEn: 'Child' }, tier: 'BRONZE', valid: false });
      expect((await detail(spouse.id)).family.principal).toMatchObject({ id: principal.id, memberNumber: principal.memberNumber });
    });

    it('FR-RBAC-27 a user who may view members but not payments gets the group with no payment field', async () => {
      const principal = await makeGold();
      const spouse = await addNew(principal.id);
      await record(spouse.id, { kind: 'NEW', targetTier: 'SILVER' });
      const asManager = await detail(spouse.id, 'manageOnly');
      expect(asManager.family.principal).toBeTruthy();
      expect(JSON.stringify(asManager)).not.toMatch(/discountPercent|receiptNumber|"amount"/);
      expect(asManager.payments).toBeUndefined();
    });
  });

  describe('sponsored employees', () => {
    it('FR-FAM-08 a spouse of a sponsored Silver employee has no sponsored term, is Bronze, and pays 30.00 for Silver', async () => {
      const area = await prisma.area.create({ data: { id: randomUUID(), tenantId, nameSq: 'T', nameEn: 'T', order: 1 } });
      const city = await prisma.city.create({ data: { id: randomUUID(), tenantId, areaId: area.id, nameSq: 'T', nameEn: 'T', order: 1 } });
      const employerId = randomUUID();
      await prisma.client.create({ data: { id: employerId, tenantId, name: 'Employer Co', status: 'CLIENT', areaId: area.id, cityId: city.id, customFieldValues: {}, lastUpdatedByUserId: users.admin } as any });
      await prisma.contract.create({
        data: {
          id: randomUUID(), tenantId, clientId: employerId, planName: 'Plan', status: 'ACTIVE', amount: '1000.00', billingPeriod: 'ANNUAL',
          startsAt: new Date(`${daysAgo(60)}T00:00:00.000Z`), endsAt: new Date(`${plusDays(today(), 300)}T00:00:00.000Z`), createdByUserId: users.admin,
        },
      });
      const employee = await newMember();
      await prisma.member.update({ where: { id: employee.id }, data: { employerClientId: employerId, currentTier: 'SILVER' } });
      await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: employee.id, tier: 'SILVER', source: 'SPONSORED', startsOn: new Date(`${daysAgo(30)}T00:00:00.000Z`), endsOn: null } });

      const spouse = await addNew(employee.id);
      expect(await termsOf(spouse.id)).toEqual([]);
      const page = await detail(spouse.id);
      expect([page.effectiveTier, page.currentTerm]).toEqual(['BRONZE', null]);
      expect((await quote(spouse.id, 'NEW', 'SILVER')).amount).toBe('30.00');
    });
  });
});
