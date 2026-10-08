import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaMembershipSeeder } from '../../../src/membership/infrastructure/PrismaMembershipSeeder';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/** M4 Slice 4 end to end: register, search, edit, status and the member page. */
describe('Wellness+ member record (M4 Slice 4)', () => {
  const tenantId = `t-wp-members-${randomUUID()}`;
  const otherTenantId = `t-wp-members-other-${randomUUID()}`;
  const uid = (label: string) => `u-wpm-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'), ceo: uid('ceo'), manager: uid('manager'), sales: uid('sales'), reception: uid('reception'), manageOnly: uid('manage'), viewOnly: uid('view'),
  };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  let cityId = '';
  let employerId = '';

  const as = (who: Who, tenant = tenantId) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    const base = `/api/${tenant}/membership/members`;
    return {
      get: (p = '') => auth(request(app).get(base + p)),
      post: (p: string, body: object) => auth(request(app).post(base + p)).send(body),
      patch: (p: string, body: object) => auth(request(app).patch(base + p)).send(body),
      delete: (p: string) => auth(request(app).delete(base + p)),
    };
  };
  const person = (n: number, extra: object = {}) => ({ firstName: `Person${n}`, lastName: `Surname${n}`, email: `person${n}@example.com`, ...extra });
  const register = async (body: object, who: Who = 'admin') => (await as(who).post('', body).expect(201)).body.data;
  const today = () => new Date().toISOString().slice(0, 10);
  const audit = (entityId?: string) => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Member', ...(entityId ? { entityId } : {}) }, orderBy: { at: 'asc' } });

  beforeAll(async () => {
    app = createApp();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, name: id, urlSlug: id, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const custom = async (label: string, keys: string[]) => {
      const id = `r-${label}-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `${label}-${randomUUID()}`, nameSq: label, nameEn: label, isSystem: false, baseKey: RoleKey.Reception, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    const manageOnly = await custom('manage-only', ['members.manage']);
    const viewOnly = await custom('view-only', ['members.view']);
    const user = (id: string, roleId: string, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cem'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
        user(users.manageOnly, manageOnly, 'Mira'),
        user(users.viewOnly, viewOnly, 'Vera'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    }
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
    await new PrismaMembershipSeeder(prisma).seed(otherTenantId);
    const area = await prisma.area.create({ data: { id: randomUUID(), tenantId, nameSq: 'Tiranë', nameEn: 'Tirana', order: 1 } });
    cityId = (await prisma.city.create({ data: { id: randomUUID(), tenantId, areaId: area.id, nameSq: 'Tiranë', nameEn: 'Tirana', order: 1 } })).id;
    employerId = randomUUID();
    await prisma.client.create({ data: { id: employerId, tenantId, name: 'Employer Co', status: 'CLIENT', areaId: area.id, cityId, customFieldValues: {}, lastUpdatedByUserId: users.admin } as any });
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) await new PrismaTenantDeletionTransaction(prisma).run(id);
    await prisma.$disconnect();
  });

  describe('registering', () => {
    it('FR-MEM-01 refuses a missing last name, and a name with no date of birth, phone or email', async () => {
      const noLast = await as('admin').post('', { firstName: 'Ana', email: 'a@example.com' }).expect(400);
      expect(noLast.body.field).toBe('lastName');
      const noIdentifier = await as('admin').post('', { firstName: 'Ana', lastName: 'Hoxha' }).expect(400);
      expect(noIdentifier.body.field).toBe('identifier');
      expect(await prisma.member.count({ where: { tenantId } })).toBe(0);
    });

    it('FR-MEM-01, FR-MEM-02 a valid member is Bronze, Active, starting today, with the FR-MEM-02 fields and no token', async () => {
      const created = await register({
        firstName: 'Ana', lastName: 'Hoxha', dateOfBirth: '1990-05-17', phone: '+355 69 123 4567', email: 'Ana.Hoxha@Example.com', language: 'en', cityId, note: 'Prefers mornings',
      });
      expect(created).toEqual({
        id: expect.any(String), memberNumber: 'WP-000001', firstName: 'Ana', lastName: 'Hoxha', dateOfBirth: '1990-05-17', phone: '+355691234567',
        email: 'ana.hoxha@example.com', tier: 'BRONZE', status: 'ACTIVE', valid: true, source: 'INDIVIDUAL', startsOn: today(), employer: null, formerEmployee: false, expiringSoon: false,
      });
      const row = await prisma.member.findUniqueOrThrow({ where: { id: created.id } });
      expect(row).toMatchObject({ language: 'en', cityId, note: 'Prefers mornings', createdBy: users.admin, currentTier: 'BRONZE', status: 'ACTIVE' });
      expect(JSON.stringify(created)).not.toContain(row.cardToken);
      expect(row.cardToken.length).toBeGreaterThanOrEqual(43);
    });

    it('FR-TIR-08 a hand-registered Bronze member has no tier-history row and no term; the status history starts Active', async () => {
      const created = await register(person(2));
      expect(await prisma.memberTierHistory.count({ where: { memberId: created.id } })).toBe(0);
      expect(await prisma.memberTerm.count({ where: { memberId: created.id } })).toBe(0);
      const history = await prisma.memberStatusHistory.findMany({ where: { memberId: created.id } });
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ fromStatus: null, toStatus: 'ACTIVE', changedByUserId: users.admin });
    });

    it('FR-MEM-02 accepts only a predefined city of the workspace', async () => {
      const unknown = await as('admin').post('', person(3, { cityId: randomUUID() })).expect(400);
      expect(unknown.body.field).toBe('cityId');
      const ownCity = await register(person(3, { cityId }));
      expect(ownCity.memberNumber).toBeDefined();
    });

    it('FR-DPR-01, FR-DPR-03 the request accepts no field outside the FR-MEM-02 list', async () => {
      for (const extra of [{ diagnosis: 'x' }, { nationalId: 'J1' }, { address: 'Rruga 1' }, { photo: 'data:' }, { medicalNote: 'x' }]) {
        await as('admin').post('', person(4, extra)).expect(400);
      }
    });

    it('FR-MEM-09, NFR-SEC-07 no request can set the tier, expiry, number, status, token or creator', async () => {
      const forbidden = [{ tier: 'GOLD' }, { currentTier: 'GOLD' }, { expiresOn: '2030-01-01' }, { endsOn: '2030-01-01' }, { memberNumber: 'WP-999999' }, { status: 'CLOSED' }, { cardToken: 'abc' }, { createdBy: 'x' }, { startsOn: '2020-01-01' }];
      for (const extra of forbidden) await as('admin').post('', person(5, extra)).expect(400);
      const created = await register(person(5));
      for (const extra of forbidden) await as('admin').patch(`/${created.id}`, extra).expect(400);
      expect(await prisma.member.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ currentTier: 'BRONZE', status: 'ACTIVE', memberNumber: created.memberNumber });
    });

    it('FR-AUD-14, FR-AUD-16 the audit entry holds the fields and the number but never the card token', async () => {
      const created = await register(person(6, { note: 'secret note' }));
      const row = await prisma.member.findUniqueOrThrow({ where: { id: created.id } });
      const [entry] = await audit(created.id);
      expect(entry).toMatchObject({ action: 'CREATE', userId: users.admin, entityLabel: `${created.memberNumber} Person6 Surname6` });
      const serialised = JSON.stringify(entry.changes);
      expect(serialised).toContain('person6@example.com');
      expect(serialised).not.toContain(row.cardToken);
      expect(serialised).not.toContain('secret note');
      expect(serialised.toLowerCase()).not.toContain('token');
    });
  });

  describe('member numbers', () => {
    it('FR-MEM-03, NFR-DAT-02 two members created at the same moment get different consecutive numbers', async () => {
      const [a, b] = await Promise.all([as('admin').post('', person(10)), as('admin').post('', person(11))]);
      expect([a.status, b.status]).toEqual([201, 201]);
      const numbers = [a.body.data.memberNumber, b.body.data.memberNumber].map((n: string) => Number(n.slice(3))).sort((x, y) => x - y);
      expect(numbers[1]).toBe(numbers[0] + 1);
    });

    it('NFR-DAT-02 the database refuses a second member with the same number or the same card token', async () => {
      const [first] = await prisma.member.findMany({ where: { tenantId }, take: 1 });
      const copy = { ...first, id: randomUUID() };
      await expect(prisma.member.create({ data: { ...copy, cardToken: randomUUID() } })).rejects.toThrow(/Unique constraint/);
      await expect(prisma.member.create({ data: { ...copy, memberNumber: 'WP-777777' } })).rejects.toThrow(/Unique constraint/);
    });

    it('FR-MEM-03 uses the prefix setting for new numbers only, and the number cannot be edited', async () => {
      const before = await register(person(12));
      await prisma.membershipSettings.update({ where: { tenantId }, data: { memberPrefix: 'CARE' } });
      try {
        const after = await register(person(13));
        expect(after.memberNumber).toMatch(/^CARE-\d{6}$/);
        expect(Number(after.memberNumber.slice(5))).toBe(Number(before.memberNumber.slice(3)) + 1);
        expect((await as('admin').get(`/${before.id}`).expect(200)).body.data.memberNumber).toBe(before.memberNumber);
      } finally {
        await prisma.membershipSettings.update({ where: { tenantId }, data: { memberPrefix: 'WP' } });
      }
    });

    it('FR-MEM-03 the number is not reused after the member is closed', async () => {
      const closed = await register(person(14));
      await as('admin').post(`/${closed.id}/status`, { action: 'CLOSE' }).expect(200);
      const next = await register(person(15));
      expect(next.memberNumber).not.toBe(closed.memberNumber);
      expect((await as('admin').get(`/${closed.id}`).expect(200)).body.data.memberNumber).toBe(closed.memberNumber);
    });
  });

  describe('duplicates', () => {
    let original: any;
    beforeAll(async () => {
      original = await register({ firstName: 'Dora', lastName: 'Kola', dateOfBirth: '1985-03-02', phone: '+355 68 555 0101', email: 'dora.kola@example.com' });
    });

    it('FR-MEM-04 the same email, in any case, is refused with the existing member, and saved only when confirmed', async () => {
      const attempt = { firstName: 'Other', lastName: 'Person', email: ' DORA.KOLA@example.com ' };
      const refused = await as('admin').post('', attempt).expect(409);
      expect(refused.body.code).toBe('DUPLICATE_MEMBER');
      expect(refused.body.duplicates.map((d: any) => d.id)).toEqual([original.id]);
      expect(refused.body.duplicates[0]).toMatchObject({ memberNumber: original.memberNumber, firstName: 'Dora' });
      expect(await prisma.member.count({ where: { tenantId, firstName: 'Other' } })).toBe(0);
      const saved = await as('admin').post('', { ...attempt, confirmDifferentPerson: true }).expect(201);
      expect(saved.body.data.id).not.toBe(original.id);
    });

    it('FR-MEM-04 the same phone, however it is written, is refused', async () => {
      const refused = await as('admin').post('', { firstName: 'Phone', lastName: 'Twin', phone: '+355-68-555-0101' }).expect(409);
      expect(refused.body.duplicates[0].id).toBe(original.id);
    });

    it('FR-MEM-04 the same first name, last name and date of birth is refused, ignoring case and spacing', async () => {
      const refused = await as('admin').post('', { firstName: ' dora ', lastName: 'KOLA', dateOfBirth: '1985-03-02' }).expect(409);
      expect(refused.body.duplicates[0].id).toBe(original.id);
      await as('admin').post('', { firstName: 'Dora', lastName: 'Kola', dateOfBirth: '1986-03-02' }).expect(201);
    });

    it('FR-MEM-04 a closed member still counts: the record is kept', async () => {
      const closed = await register({ firstName: 'Gone', lastName: 'Member', email: 'gone.member@example.com' });
      await as('admin').post(`/${closed.id}/status`, { action: 'CLOSE' }).expect(200);
      await as('admin').post('', { firstName: 'Back', lastName: 'Again', email: 'gone.member@example.com' }).expect(409);
    });

    it('FR-MEM-04 editing a member onto another one email is refused until confirmed', async () => {
      const other = await register({ firstName: 'Edit', lastName: 'Target', email: 'edit.target@example.com' });
      await as('admin').patch(`/${other.id}`, { email: 'dora.kola@example.com' }).expect(409);
      await as('admin').patch(`/${other.id}`, { email: 'dora.kola@example.com', confirmDifferentPerson: true }).expect(200);
    });
  });

  describe('status', () => {
    it('FR-MEM-05 suspending needs a reason; reinstating restores validity with the same tier', async () => {
      const member = await register(person(20));
      await as('admin').post(`/${member.id}/status`, { action: 'SUSPEND' }).expect(400);
      await as('admin').post(`/${member.id}/status`, { action: 'SUSPEND', reason: 'Card lost' }).expect(200);
      const suspended = (await as('admin').get(`/${member.id}`).expect(200)).body.data;
      expect(suspended).toMatchObject({ status: 'SUSPENDED', validity: { valid: false, reason: 'SUSPENDED' }, effectiveTier: 'BRONZE' });
      await as('admin').post(`/${member.id}/status`, { action: 'REINSTATE' }).expect(200);
      const back = (await as('admin').get(`/${member.id}`).expect(200)).body.data;
      expect(back).toMatchObject({ status: 'ACTIVE', validity: { valid: true, reason: null }, effectiveTier: 'BRONZE' });
      expect(back.statusHistory.map((h: any) => [h.fromStatus, h.toStatus, h.reason])).toEqual([
        ['SUSPENDED', 'ACTIVE', null],
        ['ACTIVE', 'SUSPENDED', 'Card lost'],
        [null, 'ACTIVE', null],
      ]);
      expect(back.statusHistory[1].changedBy).toBe('Ana Test');
    });

    it('FR-MEM-05 closing keeps the record and the number, a closed member can be reopened, and a wrong move is 409', async () => {
      const member = await register(person(21));
      await as('admin').post(`/${member.id}/status`, { action: 'REINSTATE' }).expect(409);
      await as('admin').post(`/${member.id}/status`, { action: 'CLOSE', reason: 'Moved abroad' }).expect(200);
      const closed = (await as('admin').get(`/${member.id}`).expect(200)).body.data;
      expect(closed).toMatchObject({ status: 'CLOSED', memberNumber: member.memberNumber, validity: { valid: false, reason: 'CLOSED' } });
      expect(closed.closedAt).not.toBeNull();
      await as('admin').post(`/${member.id}/status`, { action: 'SUSPEND', reason: 'x' }).expect(409);
      await as('admin').post(`/${member.id}/status`, { action: 'REOPEN' }).expect(200);
      expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).closedAt).toBeNull();
    });

    it('FR-MEM-05 there is no delete route and no member is removed', async () => {
      const member = await register(person(22));
      await as('admin').delete(`/${member.id}`).expect(404);
      expect(await prisma.member.count({ where: { id: member.id } })).toBe(1);
    });

    it('FR-AUD-14 each status change is audited with the old and new status and the reason', async () => {
      const member = await register(person(23));
      await as('admin').post(`/${member.id}/status`, { action: 'SUSPEND', reason: 'Unpaid' }).expect(200);
      const entries = await audit(member.id);
      expect(entries.map((e) => e.action)).toEqual(['CREATE', 'STATUS_CHANGE']);
      expect(entries[1].changes).toEqual([
        { field: 'status', old: 'ACTIVE', new: 'SUSPENDED' },
        { field: 'reason', old: null, new: 'Unpaid' },
      ]);
    });

    it('FR-AUD-14 a status change that fails to write its audit entry leaves the status unchanged', async () => {
      const { PrismaMembershipWriteTransaction } = await import('../../../src/membership/infrastructure/PrismaMembershipWriteTransaction');
      const { ChangeMemberStatusUseCase } = await import('../../../src/membership/application/use-cases/MemberUseCases');
      const { administrator } = await import('../../support/access');
      const member = await register(person(24));
      const failing = new ChangeMemberStatusUseCase(
        new PrismaMembershipWriteTransaction(prisma, () => ({ record: async () => { throw new Error('audit down'); } }))
      );
      await expect(failing.execute({ access: administrator({ userId: users.admin, tenantId }), tenantId, id: member.id, action: 'CLOSE' })).rejects.toThrow('audit down');
      expect(await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({ status: 'ACTIVE', closedAt: null });
      expect(await prisma.memberStatusHistory.count({ where: { memberId: member.id } })).toBe(1);
    });
  });

  describe('the member page and edits', () => {
    it('FR-MEM-08 the page shows every field, the calculated tier with its terms, and the histories', async () => {
      const member = await register({ firstName: 'Page', lastName: 'Test', dateOfBirth: '1980-01-01', phone: '0691112222', email: 'page@example.com', cityId, note: 'A note' });
      const silver = await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: member.id, tier: 'SILVER', source: 'PAID', startsOn: new Date('2020-01-01'), endsOn: new Date('2099-12-31') } });
      await prisma.memberTierHistory.create({ data: { id: randomUUID(), memberId: member.id, fromTier: 'BRONZE', toTier: 'SILVER', reason: 'Purchase', changedByUserId: users.admin } });
      // The stored copy says Bronze; the page calculates from the terms (D2).
      const page = (await as('admin').get(`/${member.id}`).expect(200)).body.data;
      expect(page).toMatchObject({
        memberNumber: member.memberNumber, firstName: 'Page', lastName: 'Test', dateOfBirth: '1980-01-01', phone: '0691112222', email: 'page@example.com', language: 'sq', cityId,
        note: 'A note', status: 'ACTIVE', effectiveTier: 'SILVER', tier: 'SILVER', startsOn: today(), createdBy: { id: users.admin, name: 'Ana Test' },
        validity: { valid: true, reason: null }, currentTerm: { source: 'PAID', startsOn: '2020-01-01', endsOn: '2099-12-31' },
        family: { principalMemberId: null, relationshipId: null, dependants: [] },
      });
      expect(page.terms).toEqual([{ id: silver.id, tier: 'SILVER', source: 'PAID', startsOn: '2020-01-01', endsOn: '2099-12-31' }]);
      expect(page.tierHistory[0]).toMatchObject({ fromTier: 'BRONZE', toTier: 'SILVER', reason: 'Purchase', changedBy: 'Ana Test' });
      expect(page.statusHistory).toHaveLength(1);
      expect(JSON.stringify(page)).not.toMatch(/cardToken/);
    });

    it('FR-MEM-06 a term that ended yesterday leaves the member valid as Bronze before the daily job has run', async () => {
      const member = await register(person(30));
      const yesterday = new Date(Date.now() - 86_400_000);
      await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: member.id, tier: 'GOLD', source: 'PAID', startsOn: new Date('2020-01-01'), endsOn: new Date(yesterday.toISOString().slice(0, 10)) } });
      await prisma.member.update({ where: { id: member.id }, data: { currentTier: 'GOLD' } });
      const page = (await as('admin').get(`/${member.id}`).expect(200)).body.data;
      expect(page).toMatchObject({ effectiveTier: 'BRONZE', validity: { valid: true }, status: 'ACTIVE' });
    });

    it('FR-MEM-09 personal details are edited, a change of phone is audited with old and new, and the note is not written into the trail', async () => {
      const member = await register(person(31, { phone: '0691110000' }));
      const edited = await as('admin').patch(`/${member.id}`, { phone: '0692220000', firstName: 'Renamed', note: 'private words', language: 'it' }).expect(200);
      expect(edited.body.data).toMatchObject({ firstName: 'Renamed', phone: '0692220000' });
      const entries = await audit(member.id);
      const update = entries.find((e) => e.action === 'UPDATE')!;
      expect(update.changes).toEqual(expect.arrayContaining([
        { field: 'phone', old: '0691110000', new: '0692220000' },
        { field: 'firstName', old: 'Person31', new: 'Renamed' },
        { field: 'language', old: 'sq', new: 'it' },
        { field: 'note', old: 'changed', new: 'changed' },
      ]));
      expect(JSON.stringify(update.changes)).not.toContain('private words');
      expect(update.entityLabel).toBe(`${member.memberNumber} Person31 Surname31`);
    });

    it('FR-MEM-09 saving unchanged details writes no audit entry, and a record keeps at least one identifier', async () => {
      const member = await register(person(32));
      await as('admin').patch(`/${member.id}`, { firstName: 'Person32' }).expect(200);
      expect(await audit(member.id)).toHaveLength(1);
      const refused = await as('admin').patch(`/${member.id}`, { email: null }).expect(400);
      expect(refused.body.field).toBe('identifier');
    });

    it('FR-MEM-02 a city change must be a predefined city', async () => {
      const member = await register(person(33));
      await as('admin').patch(`/${member.id}`, { cityId: randomUUID() }).expect(400);
      expect((await as('admin').patch(`/${member.id}`, { cityId }).expect(200)).body.data.id).toBe(member.id);
    });
  });

  describe('search', () => {
    const ids: Record<string, string> = {};
    beforeAll(async () => {
      const make = async (key: string, body: object) => { ids[key] = (await register(body)).id; };
      await make('s1', { firstName: 'Zef', lastName: 'Searchable', phone: '+355 67 700 0001', email: 'zef@search.example' });
      await make('s2', { firstName: 'Zena', lastName: 'Searchable', phone: '+355 67 700 0002', email: 'zena@search.example' });
      await make('s3', { firstName: 'Zoi', lastName: 'Other', phone: '+355 67 700 0003', email: 'zoi@other.example' });
      await prisma.member.update({ where: { id: ids.s1 }, data: { currentTier: 'GOLD', employerClientId: employerId } });
      await prisma.member.update({ where: { id: ids.s2 }, data: { currentTier: 'SILVER', principalMemberId: ids.s1 } });
      await prisma.member.update({ where: { id: ids.s3 }, data: { status: 'SUSPENDED', formerEmployerClientId: employerId } });
    });
    const find = async (query: string) => (await as('admin').get(`?${query}`).expect(200)).body;
    const names = (body: any) => body.data.map((m: any) => m.firstName);

    it('FR-MEM-07 finds a member by member ID, name, phone and email', async () => {
      const s1 = await prisma.member.findUniqueOrThrow({ where: { id: ids.s1 } });
      expect(names(await find(`query=${s1.memberNumber}`))).toEqual(['Zef']);
      expect(names(await find('query=zef searchable'))).toEqual(['Zef']);
      expect(names(await find('query=SEARCHABLE&sortBy=name'))).toEqual(['Zef', 'Zena']);
      expect(names(await find(`query=${encodeURIComponent('+355 67 700 0003')}`))).toEqual(['Zoi']);
      expect(names(await find('query=zena@search'))).toEqual(['Zena']);
      expect(names(await find('query=WP-0000'))).toEqual(expect.arrayContaining(['Zef']));
    });

    it('FR-MEM-07 filters by tier, status, validity, source, employer, former employee and the employer company Area and City', async () => {
      const q = 'query=Z';
      expect(names(await find(`${q}&tier=GOLD`))).toEqual(['Zef']);
      expect(names(await find(`${q}&status=SUSPENDED`))).toEqual(['Zoi']);
      expect(names(await find(`${q}&validity=NOT_VALID`))).toEqual(['Zoi']);
      expect((await find(`${q}&validity=VALID`)).data.map((m: any) => m.firstName)).not.toContain('Zoi');
      expect(names(await find('source=CORPORATE'))).toEqual(['Zef']);
      expect(names(await find('source=FAMILY'))).toEqual(['Zena']);
      expect(names(await find(`${q}&source=INDIVIDUAL`))).toEqual(['Zoi']);
      expect(names(await find(`employerClientId=${employerId}`))).toEqual(['Zef']);
      expect(names(await find('formerEmployee=true'))).toEqual(['Zoi']);
      const area = (await prisma.city.findUniqueOrThrow({ where: { id: cityId } })).areaId;
      expect(names(await find(`cityId=${cityId}`))).toEqual(['Zef']);
      expect(names(await find(`areaId=${area}`))).toEqual(['Zef']);
    });

    it('FR-MEM-07 the filters that need later data return correct, empty results now', async () => {
      expect((await find('expiringSoon=true')).data).toEqual([]);
      expect((await find('vipReviewDue=true')).data).toEqual([]);
      const member = await prisma.member.findUniqueOrThrow({ where: { id: ids.s1 } });
      const soon = new Date(Date.now() + 10 * 86_400_000);
      await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: member.id, tier: 'GOLD', source: 'PAID', startsOn: new Date('2020-01-01'), endsOn: new Date(soon.toISOString().slice(0, 10)) } });
      expect(names(await find('expiringSoon=true'))).toEqual(['Zef']);
      await prisma.memberTerm.deleteMany({ where: { memberId: member.id } });
    });

    it('FR-MEM-07 sorts and pages, and caps the page size', async () => {
      const sorted = await find('query=Searchable&sortBy=name&sortDir=desc');
      expect(names(sorted)).toEqual(['Zena', 'Zef']);
      const page1 = await find('sortBy=memberNumber&sortDir=asc&limit=2&page=1');
      const page2 = await find('sortBy=memberNumber&sortDir=asc&limit=2&page=2');
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBeGreaterThan(4);
      expect(page2.data[0].memberNumber > page1.data[1].memberNumber).toBe(true);
      expect((await find('limit=100000')).limit).toBe(100);
    });

    it('FR-MEM-07 a page of 50 uses a bounded number of queries', async () => {
      const queries: string[] = [];
      const logging = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
      (logging as any).$on('query', (e: { query: string }) => queries.push(e.query));
      const { PrismaMemberStore } = await import('../../../src/membership/infrastructure/PrismaMemberStore');
      const result = await new PrismaMemberStore(logging).search(tenantId, { sortBy: 'name', sortDir: 'asc', page: 1, limit: 50 });
      await logging.$disconnect();
      expect(result.data.length).toBeGreaterThan(5);
      expect(queries.filter((q) => /SELECT/i.test(q)).length).toBeLessThanOrEqual(3);
    });

    it('FR-MEM-07 a member of another workspace is never listed or opened', async () => {
      const other = await prisma.member.create({
        data: { id: randomUUID(), tenantId: otherTenantId, memberNumber: 'WP-000001', firstName: 'Zed', lastName: 'Foreign', email: 'zed@foreign.example', startsOn: new Date(today()), cardToken: randomUUID(), createdBy: 'x' },
      });
      expect(names(await find('query=Foreign'))).toEqual([]);
      await as('admin').get(`/${other.id}`).expect(404);
      await as('admin').patch(`/${other.id}`, { firstName: 'Hijack' }).expect(404);
      await as('admin').post(`/${other.id}/status`, { action: 'CLOSE' }).expect(404);
      expect((await prisma.member.findUniqueOrThrow({ where: { id: other.id } })).firstName).toBe('Zed');
    });
  });

  describe('permissions', () => {
    let memberId = '';
    beforeAll(async () => {
      memberId = (await register({ firstName: 'Perm', lastName: 'Check', phone: '0693334444', email: 'perm@example.com', note: 'internal' })).id;
    });
    const routes = (id: string) => [
      (who: Who) => as(who).get(''),
      (who: Who) => as(who).get(`/${id}`),
      (who: Who) => as(who).post('', person(90)),
      (who: Who) => as(who).patch(`/${id}`, { firstName: 'X' }),
      (who: Who) => as(who).post(`/${id}/status`, { action: 'SUSPEND', reason: 'x' }),
    ];

    it('FR-RBAC-28, NFR-SEC-07 a Sales User, a Sales Manager and Reception (verify only) get 403 on every member route', async () => {
      for (const who of ['sales', 'manager', 'reception'] as Who[]) {
        for (const call of routes(memberId)) expect([who, (await call(who)).status]).toEqual([who, 403]);
      }
      expect(await prisma.member.count({ where: { tenantId, firstName: 'Person90' } })).toBe(0);
    });

    it('FR-RBAC-28 the CEO reads but cannot write; a view-only role cannot write; a manage-only role cannot read', async () => {
      await as('ceo').get('').expect(200);
      await as('ceo').get(`/${memberId}`).expect(200);
      for (const who of ['ceo', 'viewOnly'] as Who[]) {
        await as(who).post('', person(91)).expect(403);
        await as(who).patch(`/${memberId}`, { firstName: 'X' }).expect(403);
        await as(who).post(`/${memberId}/status`, { action: 'SUSPEND', reason: 'x' }).expect(403);
      }
      await as('manageOnly').get('').expect(403);
      await as('manageOnly').get(`/${memberId}`).expect(403);
    });

    it('FR-RBAC-27 a role that manages members but does not hold "view" gets no phone, email or note back', async () => {
      const created = (await as('manageOnly').post('', { firstName: 'Mo', lastName: 'Manage', phone: '0695556666', email: 'mo@example.com', note: 'hidden', dateOfBirth: '1990-01-01' }).expect(201)).body.data;
      expect(created).not.toHaveProperty('phone');
      expect(created).not.toHaveProperty('email');
      expect(created).not.toHaveProperty('note');
      expect(created.firstName).toBe('Mo');
      const duplicate = (await as('manageOnly').post('', { firstName: 'Mo', lastName: 'Manage', dateOfBirth: '1990-01-01' }).expect(409)).body;
      expect(JSON.stringify(duplicate)).not.toMatch(/mo@example|0695556666/);
    });

    it('FR-RBAC-27 a role with "view" sees phone, email, note and the verification log, and no payment field', async () => {
      const page = (await as('viewOnly').get(`/${memberId}`).expect(200)).body.data;
      expect(page).toMatchObject({ phone: '0693334444', email: 'perm@example.com', note: 'internal' });
      for (const key of ['payments', 'amount', 'receiptNumber', 'revenue']) expect(page).not.toHaveProperty(key);
      expect(page.verificationEvents).toEqual([]);
    });

    it('FR-RBAC-28 an unauthenticated request is 401', async () => {
      await request(app).get(`/api/${tenantId}/membership/members`).expect(401);
    });
  });
});
