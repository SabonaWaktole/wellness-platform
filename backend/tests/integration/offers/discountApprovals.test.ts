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
    expect(note?.params).toMatchObject({ requestedPercent: '15.00', offerId: body.data.id, dealId });
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

  it('FR-DSC-08 raising the discount after approval needs a new approval; lowering keeps the draft priceable', async () => {
    const dealId = await newDeal();
    const saved = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '15' })), reason: 'First ask' }).expect(201)
    ).body.data;
    await as('manager').post(`/discount-approvals/${saved.pendingApproval.id}/approve`, { approvedPercent: '15' }).expect(200);
    // Raising to 20% sends the offer back to pending with a new request.
    const raised = (
      await saveOffer('salesA', dealId, { ...(await exampleA({ discountPercent: '20' })), reason: 'Second ask' }).expect(200)
    ).body.data;
    expect(raised).toMatchObject({ status: 'PENDING_APPROVAL', discountPercent: '20.00' });
    expect(raised.pendingApproval.id).not.toBe(saved.pendingApproval.id);
    await as('manager').post(`/discount-approvals/${raised.pendingApproval.id}/approve`, { approvedPercent: '18' }).expect(200);
    // Lowering to 5% is a normal draft again.
    const lowered = (await saveOffer('salesA', dealId, await exampleA({ discountPercent: '5' })).expect(200)).body.data;
    expect(lowered).toMatchObject({ status: 'DRAFT', discountPercent: '5.00' });
    await as('salesA').post(`/offers/${lowered.id}/mark-ready`, {}).expect(200);
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
});
