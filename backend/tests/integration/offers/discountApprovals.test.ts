import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaPricingSeeder } from '../../../src/pricing/infrastructure/PrismaPricingSeeder';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaDiscountApprovalStore } from '../../../src/discounts/infrastructure/PrismaDiscountApprovalStore';
import { PrismaNotificationRepository } from '../../../src/notifications/infrastructure/PrismaNotificationRepository';
import { PrismaPermissionHolderDirectory } from '../../../src/notifications/infrastructure/PrismaPermissionHolderDirectory';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { PrismaTeamRoster } from '../../../src/access/infrastructure/PrismaTeamRoster';
import { PrismaNotificationSettingsRepository } from '../../../src/notifications/infrastructure/PrismaNotificationSettingsRepository';
import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { DiscountApprovalReminderJob } from '../../../src/scheduler/jobs/DiscountApprovalReminderJob';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * M2 Slice 10 end to end: a discount above the cap waits for approval
 * (FR-DSC-03..12). The salesperson requests with a reason, the Sales Manager
 * is notified and approves (possibly lower) or rejects with a comment, and
 * the salesperson is notified. Withdrawing, the audit trail, the reminder
 * and the server-side refusals are covered too.
 */
describe('Discounts above the cap and approval (M2 Slice 10)', () => {
  const tenantId = `t-discount-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-dsc-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    manager: uid('manager'),
    ceo: uid('ceo'),
    reception: uid('reception'),
  };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens: Record<Who, string> = {} as any;

  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object = {}) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
    };
  };

  const companyId = randomUUID();

  const businessTypeId = async (nameSq: string) => (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const frequencyId = async (nameSq: string) => (await prisma.visitFrequency.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const zoneId = async (nameSq: string) => (await prisma.priceZone.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const cityId = async (nameSq: string) => (await prisma.city.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const defaultPackage = async () => (await prisma.servicePackage.findFirstOrThrow({ where: { tenantId, isDefault: true } })).id;

  const newDeal = async (who: Who = 'salesA') => {
    const res = await as(who).post('/deals', { clientId: companyId, type: 'NEW_CONTRACT' });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };

  /** Example A of the SRS: 2 employees, Medium, 2 visits a year, Tirana centre → list 49.40. */
  const exampleA = async (overrides: object = {}) => ({
    employees: 2,
    businessTypeId: await businessTypeId('Restorant'),
    zoneId: await zoneId('Tirana qendër'),
    frequencyId: await frequencyId('2 herë në vit'),
    packageId: await defaultPackage(),
    ...overrides,
  });
  const saveOffer = (who: Who, dealId: string, body: object) => as(who).put(`/deals/${dealId}/offer`, body);
  const offersOf = async (dealId: string, who: Who = 'salesA') =>
    (await as(who).get(`/deals/${dealId}/offers`).expect(200)).body.data as any[];
  const notificationsOf = async (userId: string) =>
    prisma.notification.findMany({ where: { tenantId, recipientUserId: userId }, orderBy: { createdAt: 'desc' } });
  const auditsOf = async (entityType: string, entityId: string) =>
    prisma.auditEntry.findMany({ where: { tenantId, entityType, entityId }, orderBy: { at: 'asc' } });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Discount tenant', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq' },
    });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);

    const user = (id: string, roleId: string, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.ceo, roles[RoleKey.Ceo], 'Ceka'),
        user(users.reception, roles[RoleKey.Reception], 'Fatos'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    await prisma.client.create({
      data: {
        id: companyId, tenantId, name: 'Restorant Tirana', assignedUserId: users.salesA,
        customFieldValues: {}, lastUpdatedByUserId: users.admin,
        employeeCount: 2, businessTypeId: await businessTypeId('Restorant'), cityId: await cityId('Tiranë'),
      },
    });
  }, 30_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-DSC-03 15% with a 10% cap and a reason waits for approval, and the manager is notified', async () => {
    const dealId = await newDeal();
    const { body } = await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Loyal customer' }).expect(201);
    expect(body.data).toMatchObject({ status: 'PENDING_APPROVAL', discountPercent: '15.00' });
    expect(body.data.pendingApproval).toMatchObject({ requestedPercent: '15.00', reason: 'Loyal customer' });
    // Inline: the requester withdraws, the manager decides.
    expect(body.data.permittedActions).toEqual(['WITHDRAW_APPROVAL']);

    const pending = (await as('manager').get('/discount-approvals/pending').expect(200)).body;
    expect(pending.total).toBeGreaterThanOrEqual(1);
    const row = pending.data.find((item: any) => item.offerId === body.data.id);
    expect(row).toMatchObject({ requestedPercent: '15.00', listPriceAtRequest: '49.40', reason: 'Loyal customer' });

    const managerNotes = await notificationsOf(users.manager);
    const note = managerNotes.find((item) => item.type === 'DISCOUNT_APPROVAL_REQUESTED');
    expect(note).toMatchObject({ entityType: 'OFFER', entityId: dealId });
    // FR-DSC-05: the company, the salesperson, the list price, the requested % and the reason.
    expect(note?.params).toMatchObject({
      kind: 'DISCOUNT',
      clientName: 'Restorant Tirana',
      salespersonName: 'Besa Test',
      listPrice: '49.40',
      requestedPercent: '15.00',
      reason: 'Loyal customer',
      offerId: body.data.id,
      dealId,
    });
    // The requester is never notified about their own request.
    expect((await notificationsOf(users.salesA)).find((item) => item.type === 'DISCOUNT_APPROVAL_REQUESTED')).toBeUndefined();

    const managerView = (await offersOf(dealId, 'manager')).find((offer: any) => offer.id === body.data.id);
    expect(managerView.permittedActions).toEqual(['APPROVE_DISCOUNT', 'REJECT_DISCOUNT']);
  });

  it('FR-DSC-03 a pending offer cannot be downloaded as final, marked as sent, or edited', async () => {
    const dealId = await newDeal();
    const { body } = await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Loyal' }).expect(201);
    await as('salesA').get(`/offers/${body.data.id}/pdf?lang=sq&disposition=attachment`).expect(409);
    // The preview still renders, with the draft watermark.
    await as('salesA').get(`/offers/${body.data.id}/pdf?lang=sq&disposition=inline`).expect(200);
    await as('salesA').post(`/offers/${body.data.id}/mark-sent`, { sentDate: '2026-10-03' }).expect(409);
    const res = await saveOffer('salesA', dealId, await exampleA({ discountPercent: '5' }));
    expect(res.status).toBe(409);
  });

  it('FR-DSC-06 approving 12% of 15% makes the offer ready at 12% and notifies the salesperson', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Loyal customer' }).expect(201)
    ).body.data;
    const approvalId = saved.pendingApproval.id;
    const { body } = await as('manager').post(`/discount-approvals/${approvalId}/approve`, { approvedPercent: '12' }).expect(200);
    expect(body.data).toMatchObject({ status: 'READY', discountPercent: '12.00', discountAmount: '5.93', netMonthlyPrice: '43.47' });

    const salesNotes = await notificationsOf(users.salesA);
    expect(salesNotes.find((item) => item.type === 'DISCOUNT_APPROVED')).toMatchObject({
      entityType: 'OFFER',
      entityId: dealId,
    });
    const audits = await auditsOf('DiscountApproval', approvalId);
    expect(audits.map((entry) => entry.action)).toEqual(['CREATE', 'STATUS_CHANGE']);
  });

  it('FR-DSC-07 rejection returns the offer to draft at the cap with the comment shown', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '20' })), reason: 'Tough negotiation' }).expect(201)
    ).body.data;
    const { body } = await as('manager')
      .post(`/discount-approvals/${saved.pendingApproval.id}/reject`, { comment: 'Too much for this size' })
      .expect(200);
    expect(body.data).toMatchObject({ status: 'DRAFT', discountPercent: '10.00', discountAmount: '4.94', netMonthlyPrice: '44.46' });
    expect(body.data.statusNote).toBe('Too much for this size');
    expect((await notificationsOf(users.salesA)).find((item) => item.type === 'DISCOUNT_REJECTED')).toBeDefined();
  });

  it('FR-DSC-05 a Sales Manager’s own request goes to the CEO, not back to them', async () => {
    const res = await as('manager').post('/deals', { clientId: companyId, type: 'NEW_CONTRACT' });
    expect(res.status).toBe(201);
    const dealId = res.body.data.id as string;
    const saved = (
      await saveOffer('manager', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'My own deal' }).expect(201)
    ).body.data;
    // No self-notification, and the CEO is in the loop.
    const ceoNotes = await notificationsOf(users.ceo);
    expect(ceoNotes.find((item) => item.type === 'DISCOUNT_APPROVAL_REQUESTED' && (item.params as any)?.offerId === saved.id)).toBeDefined();
    // The manager sees no approve button on their own request.
    const ownView = (await offersOf(dealId, 'manager')).find((offer: any) => offer.id === saved.id);
    expect(ownView.permittedActions).not.toContain('APPROVE_DISCOUNT');
  });

  it('FR-DSC-09 self-approval is refused', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Loyal' }).expect(201)
    ).body.data;
    await as('salesA').post(`/discount-approvals/${saved.pendingApproval.id}/approve`, { approvedPercent: '12' }).expect(403);
  });

  it('FR-DSC-08 lowering the discount keeps the approval; raising it needs a new one', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'First ask' }).expect(201)
    ).body.data;
    await as('manager').post(`/discount-approvals/${saved.pendingApproval.id}/approve`, { approvedPercent: '15' }).expect(200);

    // 13% is still above the 10% cap, but below the approved 15% on the same list price:
    // no reason, no new request, and the offer can be made ready again.
    const lowered = (await saveOffer('salesA', dealId, await exampleA({ discountPercent: '13' })).expect(200)).body.data;
    expect(lowered).toMatchObject({ status: 'DRAFT', discountPercent: '13.00', pendingApproval: null });
    expect(lowered.approvedDiscount).toEqual({ listPriceAtRequest: '49.40', approvedPercent: '15.00' });
    await as('salesA').post(`/offers/${lowered.id}/mark-ready`, {}).expect(200);

    // Raising to 20% asks again, with a reason.
    const bare = await saveOffer('salesA', dealId, await exampleA({ discountPercent: '20' }));
    expect(bare.status).toBe(400);
    expect(bare.body).toMatchObject({ field: 'reason' });
    const raised = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '20' })), reason: 'Second ask' }).expect(200)
    ).body.data;
    expect(raised).toMatchObject({ status: 'PENDING_APPROVAL', discountPercent: '20.00' });
    expect(raised.pendingApproval.id).not.toBe(saved.pendingApproval.id);
  });

  it('FR-DSC-08 changing the frequency after approval changes the list price and needs a new approval', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'First ask' }).expect(201)
    ).body.data;
    await as('manager').post(`/discount-approvals/${saved.pendingApproval.id}/approve`, {}).expect(200);

    const otherFrequency = { discountPercent: '15', frequencyId: await frequencyId('1 herë në vit') };
    const bare = await saveOffer('salesA', dealId, await exampleA(otherFrequency));
    expect(bare.status).toBe(400);
    expect(bare.body).toMatchObject({ field: 'reason' });
    const again = (
      await saveOffer('salesA', dealId, { ...(await exampleA(otherFrequency)), reason: 'New frequency' }).expect(200)
    ).body.data;
    expect(again.status).toBe('PENDING_APPROVAL');
    expect(again.listPrice).not.toBe('49.40');
    expect(again.pendingApproval).toMatchObject({ kind: 'DISCOUNT', requestedPercent: '15.00', listPriceAtRequest: again.listPrice });
  });

  it('FR-DSC-10 the salesperson can withdraw a pending request', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Changed my mind' }).expect(201)
    ).body.data;
    const { body } = await as('salesA').post(`/discount-approvals/${saved.pendingApproval.id}/withdraw`, {}).expect(200);
    expect(body.data.status).toBe('DRAFT');
    const pending = (await as('manager').get('/discount-approvals/pending').expect(200)).body;
    expect(pending.data.find((item: any) => item.id === saved.pendingApproval.id)).toBeUndefined();
    const audits = await auditsOf('DiscountApproval', saved.pendingApproval.id);
    expect(audits.map((entry) => entry.action)).toEqual(['CREATE', 'STATUS_CHANGE']);
  });

  it('FR-DSC-12 a pending request older than the configured hours reminds its approvers once', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Waiting long' }).expect(201)
    ).body.data;
    await prisma.discountApproval.update({
      where: { id: saved.pendingApproval.id },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    const directory = new PrismaPermissionHolderDirectory(prisma, new PrismaTeamRoster());
    const job = new DiscountApprovalReminderJob(
      new PrismaDiscountApprovalStore(prisma),
      new PrismaNotificationSettingsRepository(prisma),
      new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository(prisma), undefined, directory)
    );
    const before = (await notificationsOf(users.manager)).filter((item) => item.type === 'DISCOUNT_APPROVAL_REMINDER').length;
    await job.run(new Date());
    const after = (await notificationsOf(users.manager)).filter((item) => item.type === 'DISCOUNT_APPROVAL_REMINDER').length;
    expect(after).toBe(before + 1);
    // Exactly once: the second sweep finds nothing to remind.
    await job.run(new Date());
    expect((await notificationsOf(users.manager)).filter((item) => item.type === 'DISCOUNT_APPROVAL_REMINDER').length).toBe(after);
  });

  it('FR-DSC-12 a Sales Manager is never reminded of their own request; the CEO is', async () => {
    const res = await as('manager').post('/deals', { clientId: companyId, type: 'NEW_CONTRACT' });
    const dealId = res.body.data.id as string;
    const saved = (
      await saveOffer('manager', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Own deal, waiting' }).expect(201)
    ).body.data;
    await prisma.discountApproval.update({
      where: { id: saved.pendingApproval.id },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    const directory = new PrismaPermissionHolderDirectory(prisma, new PrismaTeamRoster());
    await new DiscountApprovalReminderJob(
      new PrismaDiscountApprovalStore(prisma),
      new PrismaNotificationSettingsRepository(prisma),
      new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository(prisma), undefined, directory)
    ).run(new Date());
    const remindedAbout = async (userId: string) =>
      (await notificationsOf(userId)).filter(
        (item) => item.type === 'DISCOUNT_APPROVAL_REMINDER' && (item.params as any)?.offerId === saved.id
      );
    expect(await remindedAbout(users.manager)).toHaveLength(0);
    const [ceoReminder] = await remindedAbout(users.ceo);
    expect(ceoReminder.params).toMatchObject({ salespersonName: 'Erion Test', listPrice: '49.40', reason: 'Own deal, waiting' });
  });

  it('FR-DSC-11 requests, approvals, rejections and withdrawals are written to the audit log', async () => {
    const approvedDeal = await newDeal();
    const approved = (
      await saveOffer('salesA', approvedDeal, { ...(await exampleA({ discountPercent: '15' })), reason: 'Audit me' }).expect(201)
    ).body.data;
    await as('manager').post(`/discount-approvals/${approved.pendingApproval.id}/approve`, { approvedPercent: '12' }).expect(200);

    const rejectedDeal = await newDeal();
    const rejected = (
      await saveOffer('salesA', rejectedDeal, { ...(await exampleA({ discountPercent: '20' })), reason: 'Audit me' }).expect(201)
    ).body.data;
    await as('manager').post(`/discount-approvals/${rejected.pendingApproval.id}/reject`, { comment: 'Audit me' }).expect(200);

    const withdrawnDeal = await newDeal();
    const withdrawn = (
      await saveOffer('salesA', withdrawnDeal, { ...(await exampleA({ discountPercent: '15' })), reason: 'Audit me' }).expect(201)
    ).body.data;
    await as('salesA').post(`/discount-approvals/${withdrawn.pendingApproval.id}/withdraw`, {}).expect(200);

    for (const [id, status, requested] of [
      [approved.pendingApproval.id, 'APPROVED', '15.00'],
      [rejected.pendingApproval.id, 'REJECTED', '20.00'],
      [withdrawn.pendingApproval.id, 'WITHDRAWN', '15.00'],
    ] as const) {
      const entries = await auditsOf('DiscountApproval', id);
      expect(entries.map((entry) => entry.action)).toEqual(['CREATE', 'STATUS_CHANGE']);
      const decided = entries[1];
      expect(decided.changes).toEqual(
        expect.arrayContaining([
          { field: 'status', old: 'PENDING', new: status },
          { field: 'requestedPercent', old: null, new: requested },
          { field: 'listPriceAtRequest', old: null, new: '49.40' },
        ])
      );
    }
  });

  it('FR-RBAC-18 an offer at the cap never waits for approval, whatever the quotation switch says', async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { requiresQuotationApproval: true } });
    const dealId = await newDeal();
    const { body } = await saveOffer('salesA', dealId, await exampleA({ discountPercent: '5' })).expect(201);
    expect(body.data.status).toBe('DRAFT');
    expect(body.data.pendingApproval).toBeNull();
  });

  it('NFR-SEC-04 direct calls are refused: mark-ready above the cap, out-of-scope and unknown approvals', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Direct' }).expect(201)
    ).body.data;
    // No approval, no ready.
    await as('salesA').post(`/offers/${saved.id}/mark-ready`, {}).expect(409);
    // A Sales User without the grant cannot decide.
    await as('salesB').post(`/discount-approvals/${saved.pendingApproval.id}/approve`, { approvedPercent: '12' }).expect(403);
    // Reception sees nothing of the flow.
    await as('reception').get('/discount-approvals/pending').expect(403);
    // An unknown request is not found, even for an approver.
    await as('manager').post(`/discount-approvals/${randomUUID()}/approve`, {}).expect(404);
  });

  /** Example A at 40 employees: no band covers it, so "Price on request" (FR-PRC-07). */
  const priceOnRequest = async (overrides: object = {}) =>
    exampleA({ employees: 40, businessTypeId: await businessTypeId('Kafene'), ...overrides });

  it('FR-PRC-09 a Sales User\'s manual price cannot be marked ready until approved', async () => {
    const dealId = await newDeal();
    const { body } = await saveOffer('salesA', dealId, {
      ...(await priceOnRequest()),
      manualMonthlyPrice: '300',
      reason: 'Large site, priced by hand',
    }).expect(201);
    expect(body.data).toMatchObject({
      status: 'PENDING_APPROVAL',
      manualMonthlyPrice: '300.00',
      manualPriceReason: 'Large site, priced by hand',
      listPrice: '300.00',
      netMonthlyPrice: '300.00',
      discountPercent: '0.00',
    });
    expect(body.data.pendingApproval).toMatchObject({ kind: 'MANUAL_PRICE', requestedMonthlyPrice: '300.00', requestedPercent: null });
    await as('salesA').post(`/offers/${body.data.id}/mark-ready`, {}).expect(409);

    const note = (await notificationsOf(users.manager)).find(
      (item) => item.type === 'DISCOUNT_APPROVAL_REQUESTED' && (item.params as any)?.offerId === body.data.id
    );
    expect(note?.params).toMatchObject({ kind: 'MANUAL_PRICE', requestedMonthlyPrice: '300.00', reason: 'Large site, priced by hand' });

    const pending = (await as('manager').get('/discount-approvals/pending').expect(200)).body.data;
    expect(pending.find((row: any) => row.offerId === body.data.id)).toMatchObject({ kind: 'MANUAL_PRICE', requestedMonthlyPrice: '300.00' });

    // The approver may set another price.
    const approved = (
      await as('manager').post(`/discount-approvals/${body.data.pendingApproval.id}/approve`, { approvedMonthlyPrice: '320' }).expect(200)
    ).body.data;
    expect(approved).toMatchObject({ status: 'READY', manualMonthlyPrice: '320.00', netMonthlyPrice: '320.00', annualValue: '3840.00' });
    const decided = (await notificationsOf(users.salesA)).find(
      (item) => item.type === 'DISCOUNT_APPROVED' && (item.params as any)?.offerId === body.data.id
    );
    expect(decided?.params).toMatchObject({ kind: 'MANUAL_PRICE', approvedMonthlyPrice: '320.00' });
  });

  it('FR-PRC-09 a rejected manual price returns the offer to "Price on request"', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await priceOnRequest()), manualMonthlyPrice: '250', reason: 'Guess' }).expect(201)
    ).body.data;
    const { body } = await as('manager')
      .post(`/discount-approvals/${saved.pendingApproval.id}/reject`, { comment: 'Ask the CEO for a quote' })
      .expect(200);
    expect(body.data).toMatchObject({ status: 'DRAFT', manualMonthlyPrice: null, listPrice: null, netMonthlyPrice: null });
    expect(body.data.statusNote).toBe('Ask the CEO for a quote');
  });

  it('FR-PRC-09 with discounts.approve the price is set directly and audited', async () => {
    const res = await as('manager').post('/deals', { clientId: companyId, type: 'NEW_CONTRACT' });
    const dealId = res.body.data.id as string;
    const set = (
      await saveOffer('manager', dealId, { ...(await priceOnRequest()), manualMonthlyPrice: '300', reason: 'Agreed with the CEO' }).expect(201)
    ).body.data;
    expect(set).toMatchObject({ status: 'DRAFT', manualMonthlyPrice: '300.00', pendingApproval: null });
    const [entry] = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'DiscountApproval', userId: users.manager } , orderBy: { at: 'desc' }, take: 1 });
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: 'kind', old: null, new: 'MANUAL_PRICE' },
        { field: 'status', old: null, new: 'APPROVED' },
        { field: 'requestedMonthlyPrice', old: null, new: '300.00' },
      ])
    );
    await as('manager').post(`/offers/${set.id}/mark-ready`, {}).expect(200);

    // Saved again at the same price, the approval still covers it and keeps its reason.
    const same = (await saveOffer('manager', dealId, { ...(await priceOnRequest()), manualMonthlyPrice: '300' }).expect(200)).body.data;
    expect(same).toMatchObject({ status: 'DRAFT', manualPriceReason: 'Agreed with the CEO' });
    await as('manager').post(`/offers/${same.id}/mark-ready`, {}).expect(200);
  });

  it('FR-PRC-09 a Sales User changing an approved manual price asks again', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await priceOnRequest()), manualMonthlyPrice: '300', reason: 'By hand' }).expect(201)
    ).body.data;
    await as('manager').post(`/discount-approvals/${saved.pendingApproval.id}/approve`, {}).expect(200);
    const same = (await saveOffer('salesA', dealId, { ...(await priceOnRequest()), manualMonthlyPrice: '300' }).expect(200)).body.data;
    expect(same).toMatchObject({ status: 'DRAFT', pendingApproval: null });
    const other = (
      await saveOffer('salesA', dealId, { ...(await priceOnRequest()), manualMonthlyPrice: '280', reason: 'Lower' }).expect(200)
    ).body.data;
    expect(other).toMatchObject({ status: 'PENDING_APPROVAL', manualMonthlyPrice: '280.00' });
    expect(other.pendingApproval).toMatchObject({ kind: 'MANUAL_PRICE', requestedMonthlyPrice: '280.00' });
  });

  it('FR-PRC-09 a manual price is only for "Price on request", needs a reason and takes no discount', async () => {
    const dealId = await newDeal();
    const priced = await saveOffer('salesA', dealId, { ...(await exampleA()), manualMonthlyPrice: '300', reason: 'x' });
    expect(priced.status).toBe(400);
    expect(priced.body).toMatchObject({ field: 'manualMonthlyPrice' });
    const noReason = await saveOffer('salesA', dealId, { ...(await priceOnRequest()), manualMonthlyPrice: '300' });
    expect(noReason.status).toBe(400);
    expect(noReason.body).toMatchObject({ field: 'reason' });
    const discounted = await saveOffer('salesA', dealId, {
      ...(await priceOnRequest({ discountPercent: '5' })),
      manualMonthlyPrice: '300',
      reason: 'x',
    });
    expect(discounted.status).toBe(400);
    expect(discounted.body).toMatchObject({ field: 'discountPercent' });
    expect(await offersOf(dealId)).toEqual([]);
  });

  it('NFR-SEC-04 an approver whose scope does not reach the salesperson is refused', async () => {
    // A copy of Sales User that edits every offer but approves only its own deals' discounts.
    const salesRole = await prisma.role.findFirstOrThrow({ where: { tenantId, key: RoleKey.SalesUser } });
    const grants = await prisma.rolePermission.findMany({ where: { roleId: salesRole.id } });
    const roleId = `role-own-approver-${randomUUID()}`;
    await prisma.role.create({
      data: { id: roleId, tenantId, key: `own-approver-${randomUUID()}`, nameSq: 'Aprovues', nameEn: 'Own approver', baseKey: RoleKey.SalesUser },
    });
    await prisma.rolePermission.createMany({
      data: [
        ...grants
          .filter((grant) => grant.permissionKey !== 'offers.edit')
          .map((grant) => ({ roleId, permissionKey: grant.permissionKey, scope: grant.scope })),
        { roleId, permissionKey: 'offers.edit', scope: 'ALL' },
        { roleId, permissionKey: 'discounts.approve', scope: 'OWN' },
      ],
    });
    const ownApprover = uid('own-approver');
    await prisma.user.create({
      data: { id: ownApprover, email: `${ownApprover}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName: 'Gent', lastName: 'Test' },
    });
    const token = tokenService.sign({ userId: ownApprover, role: 'STAFF', tenantId, tenantSlug: slug } as any);

    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'Scope' }).expect(201)
    ).body.data;
    const res = await request(app)
      .post(`/api/${slug}/discount-approvals/${saved.pendingApproval.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ permissionKey: 'discounts.approve' });
  });

  it('FR-RBAC-18 the old quotation approval queue and return-to-draft are refused under the sales process', async () => {
    const queue = await as('admin').get('/quotations/pending-approvals');
    expect(queue.status).toBe(409);
    expect(queue.body).toMatchObject({ code: 'USE_DEAL_OFFERS' });
    const back = await as('admin').post(`/quotations/${randomUUID()}/return-to-draft`, { reason: 'x' });
    expect(back.status).toBe(409);
  });
});
