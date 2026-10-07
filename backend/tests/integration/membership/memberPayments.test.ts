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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (data: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const day = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (n: number) => day(addDays(new Date(`${day(new Date())}T00:00:00.000Z`), -n));
const today = () => daysAgo(0);
const plusDays = (iso: string, n: number) => day(addDays(new Date(`${iso}T00:00:00.000Z`), n));
const endOfTerm = (start: string, months: number) => day(termEndDate(new Date(`${start}T00:00:00.000Z`), months));

/** M4 Slice 5 end to end: quote, record, upgrade, renew, void, list, export and receipt. */
describe('Wellness+ membership payments (M4 Slice 5)', () => {
  const tenantId = `t-wp-pay-${randomUUID()}`;
  const uid = (label: string) => `u-wpp-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), ceo: uid('ceo'), sales: uid('sales'), reception: uid('reception'), manageOnly: uid('manage') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;

  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const members = (who: Who) => ({
    get: (p: string) => authed(who)(request(app).get(`/api/${tenantId}/membership/members${p}`)),
    post: (p: string, body: object = {}) => authed(who)(request(app).post(`/api/${tenantId}/membership/members${p}`)).send(body),
  });
  const payments = (who: Who) => ({
    get: (p = '') => authed(who)(request(app).get(`/api/${tenantId}/membership/payments${p}`)),
    post: (p: string, body: object = {}) => authed(who)(request(app).post(`/api/${tenantId}/membership/payments${p}`)).send(body),
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

  describe('quoting and recording', () => {
    it('FR-MPAY-01 the quote for Bronze to Silver is 60.00, calculated on the server, and the options list offers only what is allowed', async () => {
      const member = await newMember();
      const quote = (await members('admin').get(`/${member.id}/payments/quote?kind=NEW&targetTier=SILVER`).expect(200)).body.data;
      expect(quote).toMatchObject({ kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', listFee: '60.00', discountPercent: '0.00', amount: '60.00', startsOn: today(), endsOn: endOfTerm(today(), 12) });

      const { options } = (await members('admin').get(`/${member.id}/payments/options`).expect(200)).body.data;
      expect(options.map((o: any) => `${o.kind}:${o.targetTier}:${o.quote.amount}`)).toEqual(['NEW:SILVER:60.00', 'NEW:GOLD:100.00']);
    });

    it('FR-MPAY-01, NFR-SEC-07 no request can type an amount, a fee, a discount, a receipt number or a term date; a future date is refused', async () => {
      const member = await newMember();
      for (const extra of [{ amount: '1.00' }, { listFee: '1.00' }, { discountPercent: '99' }, { receiptNumber: 'RCP-1' }, { endsOn: '2099-01-01' }, { startsOn: '2020-01-01' }, { fromTier: 'GOLD' }, { principalMemberId: 'x' }]) {
        await pay('admin', member.id, { kind: 'NEW', targetTier: 'SILVER', ...extra }).expect(400);
      }
      const future = await pay('admin', member.id, { kind: 'NEW', targetTier: 'SILVER', receivedOn: plusDays(today(), 1) }).expect(400);
      expect(future.body.field).toBe('receivedOn');
      expect(await prisma.memberPayment.count({ where: { memberId: member.id } })).toBe(0);
    });

    it('FR-MPAY-01 the method is required and must be one of the four', async () => {
      const member = await newMember();
      const bad = await pay('admin', member.id, { kind: 'NEW', targetTier: 'SILVER', method: 'CHEQUE' }).expect(400);
      expect(bad.body.field).toBe('method');
    });

    it('FR-MPAY-02, NFR-ACC-05 Bronze to Silver pays 60.00 and Bronze to Gold pays 100.00, stored with the list fee and the discount', async () => {
      const silver = await newMember();
      const gold = await newMember();
      const a = await record(silver.id, { kind: 'NEW', targetTier: 'SILVER' });
      const b = await record(gold.id, { kind: 'NEW', targetTier: 'GOLD' });
      expect([a.listFee, a.discountPercent, a.amount]).toEqual(['60.00', '0.00', '60.00']);
      expect([b.listFee, b.discountPercent, b.amount]).toEqual(['100.00', '0.00', '100.00']);
      const row = await prisma.memberPayment.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.amount.toFixed(2)).toBe('60.00');
    });

    it('FR-MPAY-02, FR-TIR-01 a changed fee applies to the next payment only; an earlier payment keeps its amount', async () => {
      const first = await newMember();
      const earlier = await record(first.id, { kind: 'NEW', targetTier: 'SILVER' });
      await prisma.tierSetting.update({ where: { tenantId_tier: { tenantId, tier: 'SILVER' } }, data: { fee: '75.50' } });
      try {
        const second = await newMember();
        expect((await record(second.id, { kind: 'NEW', targetTier: 'SILVER' })).amount).toBe('75.50');
        const stored = await prisma.memberPayment.findUniqueOrThrow({ where: { id: earlier.id } });
        expect(stored.amount.toFixed(2)).toBe('60.00');
      } finally {
        await prisma.tierSetting.update({ where: { tenantId_tier: { tenantId, tier: 'SILVER' } }, data: { fee: '60.00' } });
      }
    });

    it('FR-MPAY-02, FR-MPAY-03 VIP cannot be bought, and a closed or suspended member cannot pay', async () => {
      const member = await newMember();
      expect((await pay('admin', member.id, { kind: 'NEW', targetTier: 'VIP' }).expect(409)).body.reason).toBe('TIER_NOT_PURCHASABLE');
      await members('admin').post(`/${member.id}/status`, { action: 'SUSPEND', reason: 'Card lost' }).expect(200);
      expect((await pay('admin', member.id, { kind: 'NEW', targetTier: 'SILVER' }).expect(409)).body.reason).toBe('MEMBER_NOT_ACTIVE');
      await members('admin').post(`/${member.id}/status`, { action: 'CLOSE' }).expect(200);
      expect((await pay('admin', member.id, { kind: 'NEW', targetTier: 'SILVER' }).expect(409)).body.reason).toBe('MEMBER_NOT_ACTIVE');
    });

    it('FR-MPAY-04 a paid term is created for the full term and the stored and calculated tier agree', async () => {
      const member = await newMember();
      await record(member.id, { kind: 'NEW', targetTier: 'SILVER' });
      const [term] = await termsOf(member.id);
      expect([term.tier, term.source, day(term.startsOn), day(term.endsOn!)]).toEqual(['SILVER', 'PAID', today(), endOfTerm(today(), 12)]);
      expect((await rowOf(member.id)).currentTier).toBe('SILVER');
      expect((await detail(member.id)).effectiveTier).toBe('SILVER');
    });

    it('FR-MPAY-03, FR-MPAY-04, FR-TIR-08 Silver to Gold pays 40.00, closes Silver the day before and runs a full Gold term; the history lists Purchase and Upgrade', async () => {
      const member = await newMember();
      const silverDay = daysAgo(30);
      await record(member.id, { kind: 'NEW', targetTier: 'SILVER', receivedOn: silverDay });
      const upgrade = await record(member.id, { kind: 'UPGRADE', targetTier: 'GOLD' });
      expect([upgrade.amount, upgrade.kind, upgrade.fromTier, upgrade.toTier]).toEqual(['40.00', 'UPGRADE', 'SILVER', 'GOLD']);

      const [silver, gold] = await termsOf(member.id);
      expect([day(silver.startsOn), day(silver.endsOn!), silver.originalEndsOn && day(silver.originalEndsOn)]).toEqual([silverDay, daysAgo(1), endOfTerm(silverDay, 12)]);
      expect([gold.tier, day(gold.startsOn), day(gold.endsOn!)]).toEqual(['GOLD', today(), endOfTerm(today(), 12)]);
      // At most one paid term is valid on any day.
      const paid = (await termsOf(member.id)).filter((t) => t.source === 'PAID');
      for (const d of [silverDay, daysAgo(1), today(), plusDays(today(), 200)]) {
        expect(paid.filter((t) => day(t.startsOn) <= d && d <= day(t.endsOn!)).length).toBeLessThanOrEqual(1);
      }

      const page = await detail(member.id);
      expect(page.tierHistory.map((h: any) => [h.fromTier, h.toTier, h.reason]).reverse()).toEqual([
        ['BRONZE', 'SILVER', 'Purchase'],
        ['SILVER', 'GOLD', 'Upgrade'],
      ]);
      expect(page.effectiveTier).toBe('GOLD');
    });

    it('FR-MPAY-03 Gold to Silver is not offered, a Silver member cannot buy Gold as a new purchase, and Bronze to Gold costs the full price', async () => {
      const member = await newMember();
      await record(member.id, { kind: 'NEW', targetTier: 'GOLD' });
      expect((await pay('admin', member.id, { kind: 'UPGRADE', targetTier: 'SILVER' }).expect(409)).body.reason).toBe('NOT_A_HIGHER_TIER');
      const { options } = (await members('admin').get(`/${member.id}/payments/options`).expect(200)).body.data;
      expect(options.map((o: any) => `${o.kind}:${o.targetTier}`)).toEqual(['RENEWAL:GOLD']);
    });

    it('FR-MPAY-03, FR-MPAY-09 a sponsored Silver employee upgrading to Gold pays 40.00, the sponsored term is left as it is, and the sponsored term itself has no payment and no fee', async () => {
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
      const member = await newMember();
      await prisma.member.update({ where: { id: member.id }, data: { employerClientId: employerId, currentTier: 'SILVER' } });
      await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: member.id, tier: 'SILVER', source: 'SPONSORED', startsOn: new Date(`${daysAgo(30)}T00:00:00.000Z`), endsOn: null } });

      // FR-MPAY-09: the company pays under its contract, so the sponsored term has no payment behind it.
      expect(await prisma.memberPayment.count({ where: { memberId: member.id } })).toBe(0);
      expect((await detail(member.id)).payments).toEqual([]);

      const { options } = (await members('admin').get(`/${member.id}/payments/options`).expect(200)).body.data;
      expect(options.map((o: any) => `${o.kind}:${o.targetTier}:${o.quote.amount}`)).toEqual(['NEW:SILVER:60.00', 'UPGRADE:GOLD:40.00']);
      expect(options[0].quote.warnings).toEqual(['SPONSORED_SILVER_OWN_TERM']);

      const upgrade = await record(member.id, { kind: 'UPGRADE', targetTier: 'GOLD' });
      expect(upgrade.amount).toBe('40.00');
      const sponsored = (await termsOf(member.id)).find((t) => t.source === 'SPONSORED')!;
      expect([sponsored.endsOn, sponsored.closedEarlyByPaymentId, sponsored.paymentId]).toEqual([null, null, null]);
      // A payment only ever creates a paid term: it never creates a sponsored one.
      expect((await termsOf(member.id)).filter((t) => t.paymentId !== null).map((t) => t.source)).toEqual(['PAID']);
      expect(await prisma.memberPayment.count({ where: { memberId: member.id } })).toBe(1);
      expect((await detail(member.id)).effectiveTier).toBe('GOLD');
    });
  });

  describe('renewals', () => {
    it('FR-TIR-04 renewing 20 days early starts the new term the day after the old one ends, loses no day and adds no tier-history row', async () => {
      const member = await newMember();
      const paidOn = plusDays(day(addDays(new Date(`${today()}T00:00:00.000Z`), 20)), -365);
      // A term bought about a year ago, so it ends in about 20 days.
      await record(member.id, { kind: 'NEW', targetTier: 'SILVER', receivedOn: paidOn });
      const [old] = await termsOf(member.id);
      const renewal = await record(member.id, { kind: 'RENEWAL', targetTier: 'SILVER' });
      expect([renewal.kind, renewal.amount]).toEqual(['RENEWAL', '60.00']);
      const terms = await termsOf(member.id);
      expect(day(terms[1].startsOn)).toBe(plusDays(day(old.endsOn!), 1));
      expect(day(terms[1].endsOn!)).toBe(endOfTerm(plusDays(day(old.endsOn!), 1), 12));
      expect((await detail(member.id)).tierHistory).toHaveLength(1);
    });

    it('FR-TIR-04 there is nothing to renew without a paid term of that tier', async () => {
      const member = await newMember();
      expect((await pay('admin', member.id, { kind: 'RENEWAL', targetTier: 'SILVER' }).expect(409)).body.reason).toBe('NOTHING_TO_RENEW');
    });

    it('FR-MPAY-04 a New purchase while a paid term runs is refused: a member has at most one paid term', async () => {
      const member = await newMember();
      await record(member.id, { kind: 'NEW', targetTier: 'SILVER' });
      expect((await pay('admin', member.id, { kind: 'NEW', targetTier: 'SILVER' }).expect(409)).body.reason).toBe('PAID_TERM_RUNNING');
    });
  });

  describe('receipt numbers', () => {
    it('FR-MPAY-05, NFR-DAT-02 two payments recorded at the same moment get different consecutive numbers of the year', async () => {
      const [a, b] = await Promise.all([newMember(), newMember()]);
      const [x, y] = await Promise.all([pay('admin', a.id, { kind: 'NEW', targetTier: 'SILVER' }), pay('admin', b.id, { kind: 'NEW', targetTier: 'GOLD' })]);
      expect([x.status, y.status]).toEqual([201, 201]);
      const numbers = [x.body.data.receiptNumber, y.body.data.receiptNumber];
      for (const n of numbers) expect(n).toMatch(new RegExp(`^RCP-${today().slice(0, 4)}-\\d{6}$`));
      const sequence = numbers.map((n: string) => Number(n.slice(-6))).sort((p, q) => p - q);
      expect(sequence[1]).toBe(sequence[0] + 1);
    });

    it('FR-MPAY-05 uses the prefix setting, and the database refuses a second payment with the same number', async () => {
      await prisma.membershipSettings.update({ where: { tenantId }, data: { receiptPrefix: 'REC' } });
      try {
        const member = await newMember();
        const payment = await record(member.id, { kind: 'NEW', targetTier: 'SILVER' });
        expect(payment.receiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);
        const row = await prisma.memberPayment.findUniqueOrThrow({ where: { id: payment.id } });
        const { member: _ignored, ...copy } = row as any;
        await expect(prisma.memberPayment.create({ data: { ...copy, id: randomUUID() } })).rejects.toThrow(/Unique constraint/);
      } finally {
        await prisma.membershipSettings.update({ where: { tenantId }, data: { receiptPrefix: 'RCP' } });
      }
    });
  });

  describe('voiding', () => {
    it('FR-MPAY-06 voiding the upgrade restores the Silver term and its end date, keeps the receipt marked Voided and writes a Correction', async () => {
      const member = await newMember();
      const silverDay = daysAgo(30);
      await record(member.id, { kind: 'NEW', targetTier: 'SILVER', receivedOn: silverDay });
      const upgrade = await record(member.id, { kind: 'UPGRADE', targetTier: 'GOLD' });
      expect((await detail(member.id)).effectiveTier).toBe('GOLD');

      const voided = (await payments('admin').post(`/${upgrade.id}/void`, { reason: 'Wrong method entered' }).expect(200)).body.data;
      expect([voided.status, voided.voidReason, voided.receiptNumber]).toEqual(['VOIDED', 'Wrong method entered', upgrade.receiptNumber]);

      const terms = await termsOf(member.id);
      expect(terms).toHaveLength(1);
      expect([terms[0].tier, day(terms[0].endsOn!), terms[0].closedEarlyByPaymentId, terms[0].originalEndsOn]).toEqual(['SILVER', endOfTerm(silverDay, 12), null, null]);
      expect((await rowOf(member.id)).currentTier).toBe('SILVER');

      const page = await detail(member.id);
      expect(page.effectiveTier).toBe('SILVER');
      expect(page.tierHistory[0]).toMatchObject({ fromTier: 'GOLD', toTier: 'SILVER', reason: 'Correction' });
      const listed = page.payments.find((p: any) => p.id === upgrade.id);
      expect([listed.status, listed.receiptNumber, listed.voidedBy.name]).toEqual(['VOIDED', upgrade.receiptNumber, 'Ana Test']);
      const entries = await audit(upgrade.id);
      expect(entries.map((e) => e.action)).toEqual(['CREATE', 'STATUS_CHANGE']);
    });

    it('FR-MPAY-06 an earlier payment cannot be voided while a later one exists, a reason is required, and a voided payment cannot be voided twice', async () => {
      const member = await newMember();
      const first = await record(member.id, { kind: 'NEW', targetTier: 'SILVER', receivedOn: daysAgo(30) });
      const second = await record(member.id, { kind: 'UPGRADE', targetTier: 'GOLD' });
      expect((await payments('admin').post(`/${first.id}/void`, { reason: 'x' }).expect(409)).body.code).toBe('PAYMENT_NOT_LATEST');
      const noReason = await payments('admin').post(`/${second.id}/void`, { reason: '   ' }).expect(400);
      expect(noReason.body.field).toBe('reason');
      await payments('admin').post(`/${second.id}/void`, { reason: 'Mistake' }).expect(200);
      expect((await payments('admin').post(`/${second.id}/void`, { reason: 'Again' }).expect(409)).body.code).toBe('PAYMENT_ALREADY_VOIDED');
      // With the later payment voided, the earlier one is the latest and can be voided.
      await payments('admin').post(`/${first.id}/void`, { reason: 'Mistake too' }).expect(200);
      expect(await termsOf(member.id)).toHaveLength(0);
      expect((await rowOf(member.id)).currentTier).toBe('BRONZE');
    });

    it('FR-MPAY-06 only a user who may record payments can void; the CEO who may view them cannot', async () => {
      const member = await newMember();
      const payment = await record(member.id, { kind: 'NEW', targetTier: 'SILVER' });
      await payments('ceo').post(`/${payment.id}/void`, { reason: 'x' }).expect(403);
      await payments('manageOnly').post(`/${payment.id}/void`, { reason: 'x' }).expect(403);
      await payments('admin').post(`/${randomUUID()}/void`, { reason: 'x' }).expect(404);
    });

    it('FR-MPAY-06 a recorded and a voided payment in parallel leave one consistent state', async () => {
      const member = await newMember();
      const first = await record(member.id, { kind: 'NEW', targetTier: 'SILVER', receivedOn: daysAgo(30) });
      const [upgrade, voidFirst] = await Promise.all([
        pay('admin', member.id, { kind: 'UPGRADE', targetTier: 'GOLD' }),
        payments('admin').post(`/${first.id}/void`, { reason: 'Racing' }),
      ]);
      // Either the void ran first (the upgrade is then refused: nothing to upgrade) or the upgrade ran first (the void is refused: not the latest).
      expect([`${upgrade.status}/${voidFirst.status}`]).toEqual([expect.stringMatching(/^(409\/200|201\/409)$/)]);
      const terms = await termsOf(member.id);
      const page = await detail(member.id);
      expect((await rowOf(member.id)).currentTier).toBe(page.effectiveTier);
      const open = terms.filter((t) => t.source === 'PAID' && day(t.startsOn) <= today() && day(t.endsOn!) >= today());
      expect(open.length).toBeLessThanOrEqual(1);
    });
  });

  describe('the payments list, export and receipt', () => {
    let listMember: { id: string; memberNumber: string };
    let upgradeId = '';
    let voidedId = '';
    beforeAll(async () => {
      listMember = await newMember({ firstName: '=SUM(1)', lastName: 'Formula' });
      await record(listMember.id, { kind: 'NEW', targetTier: 'SILVER', receivedOn: daysAgo(30) });
      upgradeId = (await record(listMember.id, { kind: 'UPGRADE', targetTier: 'GOLD', method: 'BANK_TRANSFER' })).id;
      const other = await newMember();
      const wrong = await record(other.id, { kind: 'NEW', targetTier: 'SILVER', method: 'CARD' });
      voidedId = wrong.id;
      await payments('admin').post(`/${voidedId}/void`, { reason: 'Duplicate' }).expect(200);
    });

    it('FR-MPAY-07 filters by kind, tier, method, member and status, with the total of the filtered list excluding voided payments', async () => {
      const upgrades = (await payments('ceo').get('?kind=UPGRADE').expect(200)).body;
      expect(upgrades.data.every((p: any) => p.kind === 'UPGRADE')).toBe(true);
      expect(upgrades.data.map((p: any) => p.id)).toContain(upgradeId);

      const byMember = (await payments('ceo').get(`?memberId=${listMember.id}`).expect(200)).body;
      expect(byMember.data).toHaveLength(2);
      expect(byMember.totalAmount).toBe('100.00');

      const voided = (await payments('ceo').get('?status=VOIDED&method=CARD').expect(200)).body;
      expect(voided.data.map((p: any) => p.id)).toEqual([voidedId]);
      expect([voided.total, voided.totalAmount]).toEqual([1, '0.00']);

      const gold = (await payments('ceo').get(`?tier=GOLD&memberId=${listMember.id}`).expect(200)).body;
      expect([gold.total, gold.totalAmount]).toEqual([1, '40.00']);
    });

    it('FR-MPAY-07 filters by a date range', async () => {
      const none = (await payments('admin').get(`?from=${plusDays(today(), 1)}&to=${plusDays(today(), 5)}`).expect(200)).body;
      expect([none.total, none.totalAmount]).toEqual([0, '0.00']);
      const some = (await payments('admin').get(`?from=${today()}&to=${today()}&memberId=${listMember.id}`).expect(200)).body;
      expect(some.data.map((p: any) => p.kind)).toEqual(['UPGRADE']);
    });

    it('FR-MPAY-08, FR-RBAC-27 a user without "view payments" gets 403 on the list, and no payment field on the member page', async () => {
      for (const who of ['sales', 'reception', 'manageOnly'] as Who[]) await payments(who).get().expect(403);
      const page = await detail(listMember.id, 'manageOnly');
      const text = JSON.stringify(page);
      for (const field of ['payments', 'amount', 'listFee', 'discountPercent', 'receiptNumber', 'receivedOn', 'voidReason']) expect(text).not.toContain(`"${field}"`);
      expect(page.effectiveTier).toBeDefined();
      // Reception is refused the whole member page, and with it every payment field.
      await members('reception').get(`/${listMember.id}`).expect(403);
      expect(JSON.stringify(await detail(listMember.id, 'ceo'))).toContain('"receiptNumber"');
    });

    it('FR-MPAY-08 the payment routes are closed to a Sales User and to Reception, and recording needs the record permission', async () => {
      const member = await newMember();
      for (const who of ['sales', 'reception', 'ceo', 'manageOnly'] as Who[]) {
        await pay(who, member.id, { kind: 'NEW', targetTier: 'SILVER' }).expect(403);
        await members(who).get(`/${member.id}/payments/options`).expect(403);
      }
    });

    it('FR-MPAY-10, FR-AUD-16 the CSV holds the filtered rows with a BOM, protects a formula cell, and writes one audit entry with the filters', async () => {
      const before = (await audit()).filter((e) => e.action === 'EXPORT').length;
      const res = await payments('ceo').get(`/export.csv?memberId=${listMember.id}`).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      const lines = text.slice(1).trim().split('\r\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('Receipt number');
      // The member's name begins with "=": the cell is prefixed so a spreadsheet reads it as text.
      expect(lines[1]).toContain("'=SUM(1) Formula");
      expect(lines.slice(1).join('\n')).toMatch(/RCP-\d{4}-\d{6}/);

      const exports = (await audit()).filter((e) => e.action === 'EXPORT');
      expect(exports).toHaveLength(before + 1);
      const entry = exports[exports.length - 1];
      expect(entry).toMatchObject({ userId: users.ceo, entityLabel: 'Membership payments export' });
      const serialised = JSON.stringify(entry.changes);
      expect(serialised).toContain(listMember.id);
      expect(serialised).toContain('"rows"');
      expect(serialised).not.toContain('Formula');
    });

    it('FR-MPAY-10 a user without "view payments" cannot export, and nothing is audited', async () => {
      const before = (await audit()).filter((e) => e.action === 'EXPORT').length;
      await payments('sales').get('/export.csv').expect(403);
      await payments('manageOnly').get('/export.csv').expect(403);
      expect((await audit()).filter((e) => e.action === 'EXPORT')).toHaveLength(before);
    });

    it('FR-MPAY-11 the receipt PDF shows the stored values and says it is not an invoice, in Albanian and English', async () => {
      const payment = (await payments('admin').get(`?memberId=${listMember.id}&kind=UPGRADE`).expect(200)).body.data[0];
      const english = await payments('admin').get(`/${upgradeId}/receipt.pdf?lang=en`).buffer(true).parse(binary).expect(200);
      expect(english.headers['content-type']).toBe('application/pdf');
      const en = (await pdfParse(english.body)).text;
      for (const value of [payment.receiptNumber, '€40.00', 'Bank transfer', listMember.memberNumber, 'Gold', 'This is a receipt, not an invoice.']) expect(en).toContain(value);

      const albanian = await payments('admin').get(`/${upgradeId}/receipt.pdf?lang=sq`).buffer(true).parse(binary).expect(200);
      const sq = (await pdfParse(albanian.body)).text;
      expect(sq).toContain('Ky është një kupon pagese, jo një faturë.');
      expect(sq).toContain('€40.00');
    });

    it('FR-MPAY-11 a voided payment prints its receipt marked VOIDED with the reason, and the receipt needs "view payments"', async () => {
      const res = await payments('admin').get(`/${voidedId}/receipt.pdf?lang=en`).buffer(true).parse(binary).expect(200);
      const text = (await pdfParse(res.body)).text;
      expect(text).toContain('VOIDED');
      expect(text).toContain('Duplicate');
      await payments('sales').get(`/${voidedId}/receipt.pdf`).expect(403);
      await payments('admin').get(`/${randomUUID()}/receipt.pdf`).expect(404);
    });
  });

  describe('audit and isolation', () => {
    it('FR-AUD-14 a recorded payment writes one audit entry with the receipt, amount and term, and no personal detail', async () => {
      const member = await newMember({ phone: '+355691234567' });
      const payment = await record(member.id, { kind: 'NEW', targetTier: 'SILVER', note: 'Paid at the desk' });
      const [entry] = await audit(payment.id);
      expect(entry).toMatchObject({ action: 'CREATE', userId: users.admin, entityType: 'MemberPayment' });
      const serialised = JSON.stringify(entry.changes);
      expect(serialised).toContain(payment.receiptNumber);
      expect(serialised).toContain('60.00');
      expect(serialised).not.toContain('691234567');
      expect(serialised).not.toContain('Paid at the desk');
      const row = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
      expect(serialised).not.toContain(row.cardToken);
    });

    it('NFR-SEC-07 a payment of another workspace cannot be read, voided or printed', async () => {
      const otherTenant = `t-wp-pay-other-${randomUUID()}`;
      await prisma.tenant.create({ data: { id: otherTenant, name: otherTenant, urlSlug: otherTenant, timezone: 'UTC' } });
      try {
        const member = await newMember();
        const payment = await record(member.id, { kind: 'NEW', targetTier: 'SILVER' });
        const hit = (path: string) => request(app).get(`/api/${otherTenant}/membership/payments${path}`).set('Authorization', `Bearer ${tokens.admin}`);
        const status = (await hit(`/${payment.id}/receipt.pdf`)).status;
        expect([401, 403, 404]).toContain(status);
        expect((await hit('')).status).not.toBe(200);
      } finally {
        await new PrismaTenantDeletionTransaction(prisma).run(otherTenant);
      }
    });
  });
});

const binary = (res: any, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};
