import request from 'supertest';
import { createApp } from '../../../main/app';
import { prisma } from '../../../shared/infrastructure/prisma/client';
import { InvoiceStatus } from '../../domain/Invoice';
import { InvoiceOverdueJob } from '../../../scheduler/jobs/InvoiceOverdueJob';
import { PrismaSchedulerQueries } from '../../../scheduler/PrismaSchedulerQueries';
import { MarkInvoiceOverdueUseCase } from '../../application/use-cases/MarkInvoiceOverdueUseCase';
import { PrismaInvoiceWriteTransaction } from '../../infrastructure/PrismaInvoiceWriteTransaction';

let app: any;
let tokenStaff: string;
let tenantId: string;
let clientId: string;
let productId: string;
let warehouseId: string;
const tenantSlug = 'invoice-integ-test';

beforeAll(async () => {
  app = createApp();

  const tenant = await prisma.tenant.create({
    data: {
      id: 'tenant-inv-integ',
      name: 'Invoice Integration Test Tenant',
      urlSlug: tenantSlug,
      requiresQuotationApproval: false
    }
  });
  tenantId = tenant.id;

  const staff = await prisma.user.create({
    data: { id: 'user-inv-staff', tenantId, email: 'staff@invinteg.com', hashedPassword: 'hash', role: 'STAFF' }
  });

  const { JwtTokenService } = require('../../../auth/infrastructure/JwtTokenService');
  const tokenService = new JwtTokenService();
  tokenStaff = tokenService.sign({ userId: staff.id, role: staff.role, tenantId: staff.tenantId, tenantSlug });

  const client = await prisma.client.create({
    data: {
      id: 'client-inv-integ',
      tenantId,
      name: 'Client Inv Integration',
      // The Sales User's own company: quotations and invoices follow their
      // company (FR-RBAC-11), so staff can only quote for companies they hold.
      assignedUserId: staff.id,
      status: 'ACTIVE',
      customFieldValues: {},
      lastUpdatedByUserId: staff.id
    }
  });
  clientId = client.id;

  const category = await prisma.category.create({
    data: { id: 'cat-inv-integ', tenantId, name: 'Cat Inv Integration' }
  });

  const product = await prisma.product.create({
    data: {
      id: 'prod-inv-integ',
      tenantId,
      categoryId: category.id,
      name: 'Product Inv Integration',
      description: 'Test product for invoice integration',
      price: 100
    }
  });
  productId = product.id;

  const warehouse = await prisma.warehouse.create({
    data: { id: 'wh-inv-integ', tenantId, name: 'WH Inv Integration' }
  });
  warehouseId = warehouse.id;

  await prisma.stockLevel.create({
    data: {
      id: 'sl-inv-integ',
      tenantId,
      productId,
      productTenantId: tenantId,
      warehouseId,
      warehouseTenantId: tenantId,
      quantity: 50
    }
  });
});

afterAll(async () => {
  if (tenantId) {
    await prisma.invoiceStatusHistory.deleteMany({ where: { tenantId } });
    await prisma.invoiceLineItem.deleteMany({ where: { tenantId } });
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.quotationStatusHistory.deleteMany({ where: { tenantId } });
    await prisma.quotationLineItem.deleteMany({ where: { tenantId } });
    await prisma.quotation.deleteMany({ where: { tenantId } });
    await prisma.stockMovement.deleteMany({ where: { tenantId } });
    await prisma.stockLevel.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.warehouse.deleteMany({ where: { tenantId } });
    await prisma.category.deleteMany({ where: { tenantId } });
    await prisma.interaction.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  }
});

async function createAcceptedQuotation(quantity: number, unitPrice: number): Promise<string> {
  const createRes = await request(app)
    .post(`/api/${tenantSlug}/quotations`)
    .set('Authorization', `Bearer ${tokenStaff}`)
    .send({ clientId, lineItems: [{ productId, warehouseId, quantity, unitPrice }] });
  const quotationId = createRes.body.id;

  await request(app)
    .post(`/api/${tenantSlug}/quotations/${quotationId}/submit`)
    .set('Authorization', `Bearer ${tokenStaff}`);

  await request(app)
    .post(`/api/${tenantSlug}/quotations/${quotationId}/mark-accepted`)
    .set('Authorization', `Bearer ${tokenStaff}`);

  return quotationId;
}

describe('Invoices Integration Tests', () => {
  describe('Convert -> Send -> Mark Paid', () => {
    let quotationId: string;
    let invoiceId: string;

    it('0. Set up an accepted quotation', async () => {
      quotationId = await createAcceptedQuotation(5, 100);
      const detail = await request(app)
        .get(`/api/${tenantSlug}/quotations/${quotationId}`)
        .set('Authorization', `Bearer ${tokenStaff}`);
      expect(detail.body.quotation.status).toBe('ACCEPTED');
    });

    it('1. Convert accepted quotation to a Draft invoice', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/invoices/from-quotation/${quotationId}`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(InvoiceStatus.Draft);
      expect(res.body.quotationId).toBe(quotationId);
      expect(res.body.grandTotal).toBe(500);
      invoiceId = res.body.id;
    });

    it('2. Converting the same quotation again is refused', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/invoices/from-quotation/${quotationId}`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('3. Quotation detail now reports the invoiceId', async () => {
      const res = await request(app)
        .get(`/api/${tenantSlug}/quotations/${quotationId}`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.body.invoiceId).toBe(invoiceId);
    });

    it('4. Send the invoice', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/invoices/${invoiceId}/send`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(InvoiceStatus.Sent);
      expect(res.body.sentAt).not.toBeNull();
    });

    it('5. Mark the invoice paid', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/invoices/${invoiceId}/mark-paid`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(InvoiceStatus.Paid);
      expect(res.body.paidAt).not.toBeNull();
    });

    it('6. Invoice detail lists the full status history', async () => {
      const res = await request(app)
        .get(`/api/${tenantSlug}/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.status).toBe(200);
      expect(res.body.history.length).toBe(3); // NONE->DRAFT, DRAFT->SENT, SENT->PAID
    });

    it('7. Invoice PDF downloads as an attachment', async () => {
      const res = await request(app)
        .get(`/api/${tenantSlug}/invoices/${invoiceId}/pdf`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
    });
  });

  describe('Convert -> Send -> overdue sweep -> Mark Paid', () => {
    let quotationId: string;
    let invoiceId: string;

    it('sets up a Sent invoice with a due date already in the past', async () => {
      quotationId = await createAcceptedQuotation(2, 50);

      const convertRes = await request(app)
        .post(`/api/${tenantSlug}/invoices/from-quotation/${quotationId}`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({ dueDate: new Date(Date.now() - 24 * 60 * 60_000).toISOString() });
      invoiceId = convertRes.body.id;

      const sendRes = await request(app)
        .post(`/api/${tenantSlug}/invoices/${invoiceId}/send`)
        .set('Authorization', `Bearer ${tokenStaff}`);
      expect(sendRes.body.status).toBe(InvoiceStatus.Sent);
    });

    it('the overdue sweep flips it to Overdue', async () => {
      const queries = new PrismaSchedulerQueries(prisma);
      const markOverdue = new MarkInvoiceOverdueUseCase(new PrismaInvoiceWriteTransaction(prisma));
      const job = new InvoiceOverdueJob(queries, markOverdue);

      await job.run(new Date());

      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      expect(invoice!.status).toBe(InvoiceStatus.Overdue);
    });

    it('an overdue invoice can still be marked paid', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/invoices/${invoiceId}/mark-paid`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(InvoiceStatus.Paid);
    });
  });

  describe('Converting a non-accepted quotation is refused', () => {
    it('rejects converting a Draft quotation', async () => {
      const createRes = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({ clientId, lineItems: [{ productId, warehouseId, quantity: 1, unitPrice: 10 }] });
      const draftQuotationId = createRes.body.id;

      const res = await request(app)
        .post(`/api/${tenantSlug}/invoices/from-quotation/${draftQuotationId}`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
