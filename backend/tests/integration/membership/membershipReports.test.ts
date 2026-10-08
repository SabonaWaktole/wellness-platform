import request from 'supertest';
import express from 'express';
import { randomBytes, randomUUID } from 'crypto';
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
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = () => day(new Date());
const plusDays = (iso: string, n: number) => day(addDays(asDate(iso), n));

/** The worked example of SRS 9.3 as March 2025, so the test stays in the past whatever day it runs. */
const MARCH = { preset: 'CUSTOM', from: '2025-03-01', to: '2025-03-31' };

/**
 * M4 Slice 14: Wellness+ reports (FR-RPT-01..10, FR-MEM-07, NFR-ACC-06,
 * FR-AUD-16, FR-RBAC-27, FR-DPR-02).
 */
describe('Wellness+ reports (M4 Slice 14)', () => {
  const tenantId = `t-wp-rpt-${randomUUID()}`;
  const otherTenantId = `t-wp-rpt2-${randomUUID()}`;
  const uid = (label: string) => `u-wpr-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), ceo: uid('ceo'), reception: uid('reception'), sales: uid('sales'), reportsOnly: uid('only'), noContact: uid('nocontact') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const report = (who: Who, query: Record<string, string> = {}) => authed(who)(request(app).get(`/api/${tenantId}/membership/reports`).query(query));
  const exportCsv = (who: Who, query: Record<string, string>) => authed(who)(request(app).get(`/api/${tenantId}/membership/reports/export.csv`).query(query));

  let counter = 0;
  const member = async (extra: Record<string, unknown> = {}) => {
    counter += 1;
    const id = randomUUID();
    await prisma.member.create({
      data: {
        id, tenantId, memberNumber: `WP-R${String(counter).padStart(5, '0')}`, firstName: 'Report', lastName: `Holder${counter}`, email: `rep${counter}@example.com`, phone: `+3556${String(counter).padStart(7, '0')}`,
        startsOn: asDate('2025-01-01'), cardToken: randomBytes(32).toString('base64url'), createdBy: users.admin, ...extra,
      } as any,
    });
    return id;
  };
  const term = (memberId: string, t: { tier: string; source: string; startsOn: string; endsOn: string | null; paymentId?: string }) =>
    prisma.memberTerm.create({ data: { id: randomUUID(), memberId, tier: t.tier, source: t.source, startsOn: asDate(t.startsOn), endsOn: t.endsOn ? asDate(t.endsOn) : null, paymentId: t.paymentId ?? null } });
  let receipts = 0;
  const payment = async (memberId: string, p: { kind: string; fromTier: string; toTier: string; amount: string; receivedOn: string; voided?: boolean }) => {
    receipts += 1;
    return prisma.memberPayment.create({
      data: {
        id: randomUUID(), tenantId, memberId, kind: p.kind, fromTier: p.fromTier, toTier: p.toTier, listFee: p.amount, discountPercent: 0, amount: p.amount, method: 'CASH',
        receivedOn: asDate(p.receivedOn), receiptNumber: `RCP-R-${receipts}`, recordedBy: users.admin, ...(p.voided ? { voidedAt: new Date(), voidedBy: users.admin, voidReason: 'Entered twice' } : {}),
      },
    });
  };
  const tierHistory = (memberId: string, h: { from: string; to: string; reason: string; at: string }) =>
    prisma.memberTierHistory.create({ data: { id: randomUUID(), memberId, fromTier: h.from, toTier: h.to, reason: h.reason, createdAt: new Date(`${h.at}T12:00:00.000Z`) } });
  const statusHistory = (memberId: string, h: { from: string | null; to: string; at: string }) =>
    prisma.memberStatusHistory.create({ data: { id: randomUUID(), memberId, fromStatus: h.from, toStatus: h.to, createdAt: new Date(`${h.at}T12:00:00.000Z`) } });

  const areaId = `area-${randomUUID()}`;
  const cityId = `city-${randomUUID()}`;
  const company = async (name: string, withLocation = true) => {
    const id = `c-${randomUUID()}`;
    await prisma.client.create({ data: { id, tenantId, name, status: 'CLIENT', ...(withLocation ? { areaId, cityId } : {}), customFieldValues: {}, lastUpdatedByUserId: users.admin } as any });
    return id;
  };

  beforeAll(async () => {
    app = createApp();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, name: 'Wellness Reports Test', urlSlug: id, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await seedSystemRoles(prisma, otherTenantId);
    await prisma.area.create({ data: { id: areaId, tenantId, nameSq: 'Tiranë' } });
    await prisma.city.create({ data: { id: cityId, tenantId, areaId, nameSq: 'Tiranë' } });
    const customRole = async (keys: string[]) => {
      const id = `r-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `k-${randomUUID()}`, nameSq: 'r', nameEn: 'r', isSystem: false, baseKey: RoleKey.Ceo, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    const onlyRole = await customRole(['members.reports.view']);
    const noContactRole = await customRole(['members.reports.view', 'members.payments.view']);
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.ceo, roles[RoleKey.Ceo], 'Dimitris'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reportsOnly, onlyRole, 'Rea'),
        user(users.noContact, noContactRole, 'Nora'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
    await new PrismaMembershipSeeder(prisma).seed(otherTenantId);

    // The worked example (SRS 9.3), March 2025: 17 payments, EUR 1,140.00.
    const pay = async (n: number, p: { kind: string; fromTier: string; toTier: string; amount: string }) => {
      for (let i = 0; i < n; i += 1) await payment(await member({ currentTier: p.toTier }), { ...p, receivedOn: `2025-03-${String(5 + i).padStart(2, '0')}` });
    };
    await pay(4, { kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', amount: '60.00' });
    await pay(1, { kind: 'NEW', fromTier: 'BRONZE', toTier: 'GOLD', amount: '100.00' });
    await pay(2, { kind: 'UPGRADE', fromTier: 'SILVER', toTier: 'GOLD', amount: '40.00' });
    await payment(await member(), { kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', amount: '60.00', receivedOn: '2025-03-20', voided: true });
    await payment(await member(), { kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', amount: '60.00', receivedOn: '2025-04-02' });

    // 10 Silver and 5 Gold paid terms end in March; 7 Silver and 3 Gold are renewed by a Renewal payment (also 17 payments above).
    const ending = async (tier: 'SILVER' | 'GOLD', index: number, renewed: boolean) => {
      const id = await member({ currentTier: renewed ? tier : 'BRONZE' });
      const endsOn = `2025-03-${String(10 + index).padStart(2, '0')}`;
      await term(id, { tier, source: 'PAID', startsOn: '2024-03-10', endsOn });
      if (renewed) {
        const paid = await payment(id, { kind: 'RENEWAL', fromTier: tier, toTier: tier, amount: tier === 'SILVER' ? '60.00' : '100.00', receivedOn: endsOn });
        await term(id, { tier, source: 'PAID', startsOn: plusDays(endsOn, 1), endsOn: plusDays(endsOn, 365), paymentId: paid.id });
      } else {
        await tierHistory(id, { from: tier, to: tier === 'SILVER' ? 'BRONZE' : 'SILVER', reason: 'NOT_RENEWED', at: plusDays(endsOn, 1) });
      }
    };
    for (let i = 0; i < 10; i += 1) await ending('SILVER', i, i < 7);
    for (let i = 0; i < 5; i += 1) await ending('GOLD', i, i < 3);
    // A downgrade Silver term ending in March is not a renewal due (D5); a correction is not a downgrade.
    const downgraded = await member();
    await term(downgraded, { tier: 'SILVER', source: 'DOWNGRADE', startsOn: '2024-12-01', endsOn: '2025-03-15' });
    await tierHistory(downgraded, { from: 'GOLD', to: 'SILVER', reason: 'CORRECTION', at: '2025-03-16' });
  }, 120_000);

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) await new PrismaTenantDeletionTransaction(prisma).run(id);
    await prisma.$disconnect();
  }, 120_000);

  describe('access', () => {
    it('FR-RPT-01 the CEO and the Administrator open the reports, Reception and Sales get 403, and without a login it is 401', async () => {
      await report('ceo').expect(200);
      await report('admin').expect(200);
      await report('reception').expect(403);
      await report('sales').expect(403);
      await exportCsv('reception', { report: 'active' }).expect(403);
      await exportCsv('sales', { report: 'active' }).expect(403);
      await request(app).get(`/api/${tenantId}/membership/reports`).expect(401);
    });

    it('FR-RPT-01 the location filter accepts only predefined Areas and Cities, and the employer only of this workspace', async () => {
      await report('admin', { areaId, cityId }).expect(200);
      await report('admin', { areaId: 'free-text-area' }).expect(400);
      await report('admin', { cityId: 'made-up-city' }).expect(400);
      await report('admin', { employerClientId: 'someone-elses-company' }).expect(400);
      await report('admin', { preset: 'CUSTOM', from: '2025-04-01', to: '2025-03-01' }).expect(400);
    });
  });

  describe('worked example (SRS 9.3)', () => {
    it('FR-RPT-08, NFR-ACC-06 March revenue is EUR 1,140.00 over 17 payments, a voided payment and an April payment excluded', async () => {
      const { data } = (await report('ceo', MARCH).expect(200)).body;
      expect(data.revenue).toMatchObject({ count: 17, total: '1140.00' });
      const row = (kind: string, tier: string) => data.revenue.rows.find((r: any) => r.kind === kind && r.tier === tier);
      expect(row('NEW', 'SILVER')).toMatchObject({ count: 4, total: '240.00' });
      expect(row('NEW', 'GOLD')).toMatchObject({ count: 1, total: '100.00' });
      expect(row('UPGRADE', 'GOLD')).toMatchObject({ count: 2, total: '80.00' });
      expect(row('RENEWAL', 'SILVER')).toMatchObject({ count: 7, total: '420.00' });
      expect(row('RENEWAL', 'GOLD')).toMatchObject({ count: 3, total: '300.00' });
    });

    it('FR-RPT-08, FR-RBAC-27 a viewer without "view payments" gets no revenue and no amount at all', async () => {
      const { data } = (await report('reportsOnly', MARCH).expect(200)).body;
      expect(data.revenue).toBeUndefined();
      expect(JSON.stringify(data)).not.toMatch(/"amount"|"revenue"|1140/);
      expect(data.upgrades.count).toBe(2);
    });

    it('FR-RPT-04, NFR-ACC-06 15 renewals due, 10 renewed, 66.67%, and a downgrade Silver term is not due', async () => {
      const { renewals } = (await report('ceo', MARCH).expect(200)).body.data;
      expect(renewals).toMatchObject({ due: 15, renewed: 10, notRenewed: 5, rate: '66.67' });
      expect(renewals.perTier).toEqual([
        { tier: 'SILVER', due: 10, renewed: 7, notRenewed: 3, rate: '70.00' },
        { tier: 'GOLD', due: 5, renewed: 3, notRenewed: 2, rate: '60.00' },
      ]);
    });

    it('FR-RPT-04 the rate is a dash when no renewal is due, and a voided renewal payment does not count as renewed', async () => {
      const none = (await report('ceo', { preset: 'CUSTOM', from: '2020-01-01', to: '2020-01-31' }).expect(200)).body.data.renewals;
      expect(none).toMatchObject({ due: 0, renewed: 0, rate: null });

      const id = await member();
      await term(id, { tier: 'GOLD', source: 'PAID', startsOn: '2024-06-01', endsOn: '2025-05-31' });
      const paid = await payment(id, { kind: 'RENEWAL', fromTier: 'GOLD', toTier: 'GOLD', amount: '100.00', receivedOn: '2025-05-30', voided: true });
      await term(id, { tier: 'GOLD', source: 'PAID', startsOn: '2025-06-01', endsOn: '2026-05-31', paymentId: paid.id });
      const may = (await report('ceo', { preset: 'CUSTOM', from: '2025-05-01', to: '2025-05-31' }).expect(200)).body.data.renewals;
      expect(may).toMatchObject({ due: 1, renewed: 0, rate: '0.00' });
    });

    it('FR-RPT-03, FR-RPT-05 five new paid memberships and two Silver to Gold upgrades of EUR 40.00 show count 2 and EUR 80.00', async () => {
      const { data } = (await report('ceo', MARCH).expect(200)).body;
      expect(data.newMembers.newPaidMemberships).toBe(5);
      expect(data.upgrades).toMatchObject({ count: 2, amount: '80.00', perPath: [{ path: 'SILVER>GOLD', count: 2, amount: '80.00' }] });
    });

    it('FR-RPT-06 three Silver to Bronze and two Gold to Silver not renewed show 5 with the reason, and a correction is not counted', async () => {
      const { downgrades } = (await report('ceo', MARCH).expect(200)).body.data;
      expect(downgrades.total).toBe(5);
      expect(downgrades.perPath).toEqual([{ path: 'GOLD>SILVER', count: 2 }, { path: 'SILVER>BRONZE', count: 3 }]);
      expect(downgrades.perReason).toEqual([{ reason: 'NOT_RENEWED', count: 5 }]);
    });
  });

  describe('as-of-now figures', () => {
    it('FR-RPT-01, FR-RPT-02 changing the period changes the period figures and not the as-of-now figures', async () => {
      const march = (await report('ceo', MARCH).expect(200)).body.data;
      const other = (await report('ceo', { preset: 'CUSTOM', from: '2020-01-01', to: '2020-01-31' }).expect(200)).body.data;
      expect(other.revenue.total).toBe('0.00');
      expect(march.revenue.total).toBe('1140.00');
      expect(other.active).toMatchObject({ basis: 'asOfNow', total: march.active.total, perTier: march.active.perTier });
      expect(other.segments).toEqual(march.segments);
    });

    it('FR-RPT-02 the counts per tier add up to the active members and the shares to a hundred', async () => {
      await prisma.member.updateMany({ where: { tenantId, memberNumber: 'WP-R00001' }, data: { status: 'SUSPENDED' } });
      const { active } = (await report('ceo', MARCH).expect(200)).body.data;
      const total = await prisma.member.count({ where: { tenantId, status: 'ACTIVE' } });
      expect(active.total).toBe(total);
      expect(active.perTier.reduce((sum: number, t: any) => sum + t.count, 0)).toBe(total);
      expect(active.perTier.reduce((sum: number, t: any) => sum + Number(t.share), 0)).toBeCloseTo(100, 1);
    });

    it('FR-RPT-02 the monthly series matches the tier and status history on a fixture with a suspension', async () => {
      const co = await company('History Co');
      const id = await member({ employerClientId: co, createdAt: new Date('2025-01-02T10:00:00Z') });
      await statusHistory(id, { from: null, to: 'ACTIVE', at: '2025-01-02' });
      await tierHistory(id, { from: 'BRONZE', to: 'SILVER', reason: 'PURCHASE', at: '2025-01-15' });
      await statusHistory(id, { from: 'ACTIVE', to: 'SUSPENDED', at: '2025-02-10' });
      await statusHistory(id, { from: 'SUSPENDED', to: 'ACTIVE', at: '2025-03-05' });
      await tierHistory(id, { from: 'SILVER', to: 'GOLD', reason: 'UPGRADE', at: '2025-03-20' });
      const other = await member({ employerClientId: co, createdAt: new Date('2025-02-20T10:00:00Z') });
      await statusHistory(other, { from: null, to: 'ACTIVE', at: '2025-02-20' });

      const { monthly } = (await report('ceo', { preset: 'CUSTOM', from: '2025-01-01', to: '2025-03-31', employerClientId: co }).expect(200)).body.data.active;
      const at = (month: string) => monthly.find((m: any) => m.month === month);
      const count = (month: string, tier: string) => at(month).perTier.find((t: any) => t.tier === tier).count;
      expect(monthly.map((m: any) => m.month)).toEqual(['2025-01', '2025-02', '2025-03']);
      expect([at('2025-01').total, count('2025-01', 'SILVER')]).toEqual([1, 1]);
      expect([at('2025-02').total, count('2025-02', 'SILVER'), count('2025-02', 'BRONZE')]).toEqual([1, 0, 1]);
      expect([at('2025-03').total, count('2025-03', 'GOLD'), count('2025-03', 'BRONZE')]).toEqual([2, 1, 1]);
    });
  });

  describe('corporate members and employers', () => {
    it('FR-RPT-03 an upload of 40 employees adds 40 corporate members and no paid membership', async () => {
      const co = await company('Upload Co');
      await prisma.member.createMany({
        data: Array.from({ length: 40 }, (_, i) => ({
          id: randomUUID(), tenantId, memberNumber: `WP-U${String(i).padStart(5, '0')}`, firstName: 'Upload', lastName: `Employee${i}`, startsOn: asDate(today()), employerClientId: co,
          currentTier: 'SILVER', cardToken: randomBytes(32).toString('base64url'), createdBy: users.admin,
        })),
      });
      const { data } = (await report('ceo', { preset: 'THIS_MONTH', employerClientId: co }).expect(200)).body;
      expect(data.newMembers).toMatchObject({ total: 40, corporate: 40, individual: 0, newPaidMemberships: 0 });
    });

    it('FR-RPT-07 the company table adds up to the corporate total, with sponsored Silver, upgraded and former employees per company', async () => {
      const a = await company('Alpha Co');
      const b = await company('Beta Co');
      const sponsored = await member({ employerClientId: a, currentTier: 'SILVER' });
      await term(sponsored, { tier: 'SILVER', source: 'SPONSORED', startsOn: '2025-01-01', endsOn: null });
      const upgraded = await member({ employerClientId: a, currentTier: 'GOLD' });
      await term(upgraded, { tier: 'SILVER', source: 'SPONSORED', startsOn: '2025-01-01', endsOn: null });
      await term(upgraded, { tier: 'GOLD', source: 'PAID', startsOn: plusDays(today(), -10), endsOn: plusDays(today(), 350) });
      await member({ employerClientId: b });
      await member({ formerEmployerClientId: b, leftCompanyAt: asDate(plusDays(today(), -3)) });

      const { segments, employers, active } = (await report('ceo').expect(200)).body.data;
      expect(employers.totals.members).toBe(segments.corporate.count);
      expect(segments.corporate.count + segments.individual.count).toBe(active.total);
      const alpha = employers.rows.find((r: any) => r.companyId === a);
      const beta = employers.rows.find((r: any) => r.companyId === b);
      expect(alpha).toMatchObject({ name: 'Alpha Co', members: 2, sponsoredSilver: 1, upgradedToPaid: 1, formerEmployees: 0 });
      expect(beta).toMatchObject({ name: 'Beta Co', members: 1, sponsoredSilver: 0, upgradedToPaid: 0, formerEmployees: 1 });

      const filtered = (await report('ceo', { areaId, cityId, segment: 'CORPORATE' }).expect(200)).body.data;
      expect(filtered.employers.totals.members).toBe(filtered.segments.corporate.count);
      expect(filtered.segments.individual.count).toBe(0);
    });
  });

  describe('working lists', () => {
    it('FR-RPT-09, FR-MEM-07 "Expiring memberships" lists exactly the members with the Expiring soon badge', async () => {
      const soon = await member({ currentTier: 'GOLD', employerClientId: await company('Soon Co') });
      await term(soon, { tier: 'GOLD', source: 'PAID', startsOn: plusDays(today(), -300), endsOn: plusDays(today(), 10) });
      const later = await member({ currentTier: 'SILVER' });
      await term(later, { tier: 'SILVER', source: 'PAID', startsOn: plusDays(today(), -100), endsOn: plusDays(today(), 200) });
      const renewedEarly = await member({ currentTier: 'SILVER' });
      await term(renewedEarly, { tier: 'SILVER', source: 'PAID', startsOn: plusDays(today(), -350), endsOn: plusDays(today(), 5) });
      await term(renewedEarly, { tier: 'SILVER', source: 'PAID', startsOn: plusDays(today(), 6), endsOn: plusDays(today(), 370) });

      const lists = (await report('ceo').expect(200)).body.data.lists;
      const badge = await authed('admin')(request(app).get(`/api/${tenantId}/membership/members`).query({ expiringSoon: 'true', limit: '100' })).expect(200);
      const badged = badge.body.data.filter((m: any) => m.expiringSoon && m.status === 'ACTIVE').map((m: any) => m.id).sort();
      expect(lists.expiring.map((r: any) => r.memberId).sort()).toEqual(badged);
      expect(lists.expiring.map((r: any) => r.memberId)).toContain(soon);
      expect(lists.expiring.map((r: any) => r.memberId)).not.toContain(later);
      expect(lists.expiring.find((r: any) => r.memberId === soon).date).toBe(plusDays(today(), 10));
    });

    it('FR-RPT-09 lists VIP reviews due and the former employees to contact', async () => {
      const vip = await member({ currentTier: 'VIP' });
      await term(vip, { tier: 'VIP', source: 'VIP', startsOn: plusDays(today(), -330), endsOn: plusDays(today(), 12) });
      const extended = await member({ currentTier: 'VIP' });
      await term(extended, { tier: 'VIP', source: 'VIP', startsOn: plusDays(today(), -330), endsOn: plusDays(today(), 12) });
      await term(extended, { tier: 'VIP', source: 'VIP', startsOn: plusDays(today(), 13), endsOn: plusDays(today(), 377) });
      const lists = (await report('ceo').expect(200)).body.data.lists;
      expect(lists.vipReviews.map((r: any) => r.memberId)).toContain(vip);
      expect(lists.vipReviews.map((r: any) => r.memberId)).not.toContain(extended);
      expect(lists.formerEmployees.length).toBeGreaterThan(0);
      expect(lists.formerEmployees[0]).toMatchObject({ employer: { name: 'Beta Co' } });
    });
  });

  describe('export', () => {
    const auditCount = () => prisma.auditEntry.count({ where: { tenantId, entityType: 'MembershipReport' } });

    it('FR-RPT-10, FR-AUD-16 the CSV is the table, it creates one audit entry with the filters, and opening the report creates none', async () => {
      const before = await auditCount();
      await report('ceo', MARCH).expect(200);
      expect(await auditCount()).toBe(before);

      const res = await exportCsv('ceo', { report: 'revenue', ...MARCH }).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.startsWith('﻿Kind,Tier,Count,Amount')).toBe(true);
      expect(res.text).toContain('NEW,SILVER,4,240.00');
      expect(res.text).toContain('Total,,17,1140.00');
      expect(await auditCount()).toBe(before + 1);

      const entry = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'MembershipReport' }, orderBy: { at: 'desc' } });
      expect(entry.action).toBe('EXPORT');
      expect(entry.userId).toBe(users.ceo);
      expect(JSON.stringify(entry.changes)).toContain('2025-03-01..2025-03-31');
    });

    it('FR-RPT-10 an unknown report is refused and not audited', async () => {
      const before = await auditCount();
      await exportCsv('ceo', { report: 'everything' }).expect(400);
      expect(await auditCount()).toBe(before);
    });

    it('FR-RPT-10 a name beginning with = opens as text, and revenue is empty without "view payments"', async () => {
      await prisma.member.create({
        data: {
          id: randomUUID(), tenantId, memberNumber: 'WP-RINJ', firstName: '=HYPERLINK("http://evil")', lastName: '+Injected', startsOn: asDate(today()), currentTier: 'BRONZE',
          formerEmployerClientId: (await prisma.client.findFirstOrThrow({ where: { tenantId, name: 'Beta Co' } })).id, leftCompanyAt: asDate(today()), cardToken: randomBytes(32).toString('base64url'), createdBy: users.admin,
        } as any,
      });
      const res = await exportCsv('ceo', { report: 'former-employees' }).expect(200);
      expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
      expect(res.text).toContain("'+Injected");

      const noMoney = await exportCsv('reportsOnly', { report: 'revenue', ...MARCH }).expect(200);
      expect(noMoney.text).not.toContain('1140');
    });

    it('FR-RPT-10, FR-RBAC-27 contact details are in an export only for users with "Members: view"', async () => {
      const withContact = await exportCsv('admin', { report: 'former-employees' }).expect(200);
      expect(withContact.text.split('\r\n')[0]).toContain('Phone,Email');
      const without = await exportCsv('noContact', { report: 'former-employees' }).expect(200);
      expect(without.text.split('\r\n')[0]).not.toMatch(/Phone|Email/);
      expect(without.text).not.toContain('@example.com');

      const json = JSON.stringify((await report('reportsOnly').expect(200)).body);
      expect(json).not.toContain('@example.com');
      expect(json).not.toContain('+3556');
    });
  });
});
