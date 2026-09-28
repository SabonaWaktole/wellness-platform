import request from 'supertest';
import { createApp } from '../../../main/app';
import { prisma } from '../../../shared/infrastructure/prisma/client';
import { QuotationStatus } from '../../domain/Quotation';

let app: any;
let tokenStaff: string;
let tokenOwner: string;
let tenantId: string;
let clientId: string;
let productId: string;
let warehouseId: string;
const tenantSlug = 'quotation-integ-test';

beforeAll(async () => {
  app = createApp();

  // Create Tenant
  const tenant = await prisma.tenant.create({
    data: {
      id: 'tenant-q-integ',
      name: 'Quotation Integration Test Tenant',
      urlSlug: tenantSlug,
      requiresQuotationApproval: false
    }
  });
  tenantId = tenant.id;

  // Create Users (field is hashedPassword in Prisma schema)
  const owner = await prisma.user.create({
    data: { id: 'user-q-owner', tenantId, email: 'owner@qinteg.com', hashedPassword: 'hash', role: 'BUSINESS_OWNER' }
  });
  const staff = await prisma.user.create({
    data: { id: 'user-q-staff', tenantId, email: 'staff@qinteg.com', hashedPassword: 'hash', role: 'STAFF' }
  });

  // Tokens
  const { JwtTokenService } = require('../../../auth/infrastructure/JwtTokenService');
  const tokenService = new JwtTokenService();
  tokenOwner = tokenService.sign({ userId: owner.id, role: owner.role, tenantId: owner.tenantId, tenantSlug });
  tokenStaff = tokenService.sign({ userId: staff.id, role: staff.role, tenantId: staff.tenantId, tenantSlug });

  // Client (requires customFieldValues and lastUpdatedByUserId)
  const client = await prisma.client.create({
    data: {
      id: 'client-q-integ',
      tenantId,
      name: 'Client Q Integration',
      // The Sales User's own company: quotations and invoices follow their
      // company (FR-RBAC-11), so staff can only quote for companies they hold.
      assignedUserId: staff.id,
      status: 'ACTIVE',
      customFieldValues: {},
      lastUpdatedByUserId: owner.id
    }
  });
  clientId = client.id;

  // Category
  const category = await prisma.category.create({
    data: { id: 'cat-q-integ', tenantId, name: 'Cat Q Integration' }
  });

  // Product (no sku or requiresStockTracking in schema, description required)
  const product = await prisma.product.create({
    data: {
      id: 'prod-q-integ',
      tenantId,
      categoryId: category.id,
      name: 'Product Q Integration',
      description: 'Test product for quotation integration',
      price: 100
    }
  });
  productId = product.id;

  // Warehouse
  const warehouse = await prisma.warehouse.create({
    data: { id: 'wh-q-integ', tenantId, name: 'WH Q Integration' }
  });
  warehouseId = warehouse.id;

  // Stock Level (requires productTenantId and warehouseTenantId)
  await prisma.stockLevel.create({
    data: {
      id: 'sl-q-integ',
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
    // Clean up in reverse dependency order
    await prisma.quotationStatusHistory.deleteMany({ where: { tenantId: tenantId } });
    await prisma.quotationLineItem.deleteMany({ where: { tenantId: tenantId } });
    await prisma.quotation.deleteMany({ where: { tenantId: tenantId } });
    await prisma.stockMovement.deleteMany({ where: { tenantId: tenantId } });
    await prisma.stockLevel.deleteMany({ where: { tenantId: tenantId } });
    await prisma.product.deleteMany({ where: { tenantId: tenantId } });
    await prisma.warehouse.deleteMany({ where: { tenantId: tenantId } });
    await prisma.category.deleteMany({ where: { tenantId: tenantId } });
    await prisma.interaction.deleteMany({ where: { tenantId: tenantId } });
    await prisma.client.deleteMany({ where: { tenantId: tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId: tenantId } });
    await prisma.user.deleteMany({ where: { tenantId: tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  }
});

describe('Quotations Integration Tests', () => {
  let quotationId: string;

  it('1. Create Quotation (Draft)', async () => {
    const res = await request(app)
      .post(`/api/${tenantSlug}/quotations`)
      .set('Authorization', `Bearer ${tokenStaff}`)
      .send({
        clientId,
        lineItems: [
          { productId, warehouseId, quantity: 10, unitPrice: 100 }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe(QuotationStatus.Draft);
    quotationId = res.body.id;
  });

  it('2. Update Quotation (Draft)', async () => {
    const res = await request(app)
      .put(`/api/${tenantSlug}/quotations/${quotationId}`)
      .set('Authorization', `Bearer ${tokenStaff}`)
      .send({
        lineItems: [
          { productId, warehouseId, quantity: 20, unitPrice: 100 }
        ]
      });

    expect(res.status).toBe(200);
  });

  it('3. Submit Quotation (Approval OFF -> Sent)', async () => {
    const res = await request(app)
      .post(`/api/${tenantSlug}/quotations/${quotationId}/submit`)
      .set('Authorization', `Bearer ${tokenStaff}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(QuotationStatus.Sent);
    expect(res.body.sentAt).not.toBeNull();
  });

  it('4. Accept Quotation (Deducts Stock)', async () => {
    const res = await request(app)
      .post(`/api/${tenantSlug}/quotations/${quotationId}/mark-accepted`)
      .set('Authorization', `Bearer ${tokenStaff}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(QuotationStatus.Accepted);

    // Verify stock was deducted
    const stock = await prisma.stockLevel.findFirst({ where: { productId, warehouseId } });
    expect(stock!.quantity).toBe(30); // Started with 50, deducted 20
  });

  it('5. Search Quotations', async () => {
    const res = await request(app)
      .get(`/api/${tenantSlug}/quotations`)
      .set('Authorization', `Bearer ${tokenStaff}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('6. Get Quotation Detail', async () => {
    const res = await request(app)
      .get(`/api/${tenantSlug}/quotations/${quotationId}`)
      .set('Authorization', `Bearer ${tokenStaff}`);

    expect(res.status).toBe(200);
    expect(res.body.quotation).toBeDefined();
    expect(res.body.lineItems).toBeDefined();
    expect(res.body.history).toBeDefined();
  });

  describe('Approval ON Flow', () => {
    let qId: string;

    beforeAll(async () => {
      // Toggle approval setting ON
      const res = await request(app)
        .put(`/api/${tenantSlug}/settings`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ requiresQuotationApproval: true });
      
      expect(res.status).toBe(200);
    });

    it('Submit goes to PendingApproval when approval required', async () => {
      // Create new quotation
      const createRes = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({
          clientId,
          lineItems: [{ productId, warehouseId, quantity: 5, unitPrice: 100 }]
        });
      expect(createRes.status).toBe(201);
      qId = createRes.body.id;

      // Submit
      const subRes = await request(app)
        .post(`/api/${tenantSlug}/quotations/${qId}/submit`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(subRes.status).toBe(200);
      expect(subRes.body.status).toBe(QuotationStatus.PendingApproval);
    });

    it('Pending Approvals endpoint returns it', async () => {
      const res = await request(app)
        .get(`/api/${tenantSlug}/quotations/pending-approvals`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('Owner can Approve (moves to Sent)', async () => {
      const appRes = await request(app)
        .post(`/api/${tenantSlug}/quotations/${qId}/approve`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(appRes.status).toBe(200);
      expect(appRes.body.status).toBe(QuotationStatus.Sent);
    });

    it('Owner can Return to Draft', async () => {
      // Create + Submit another quotation
      const createRes = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({
          clientId,
          lineItems: [{ productId, warehouseId, quantity: 2, unitPrice: 50 }]
        });
      const q2Id = createRes.body.id;

      await request(app)
        .post(`/api/${tenantSlug}/quotations/${q2Id}/submit`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      const returnRes = await request(app)
        .post(`/api/${tenantSlug}/quotations/${q2Id}/return-to-draft`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ reason: 'Needs correction' });

      expect(returnRes.status).toBe(200);
      expect(returnRes.body.status).toBe(QuotationStatus.Draft);
    });
  });

  describe('Settings endpoint', () => {
    it('GET returns current settings', async () => {
      const res = await request(app)
        .get(`/api/${tenantSlug}/settings`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.requiresQuotationApproval).toBeDefined();
    });

    it('Staff cannot update settings', async () => {
      const res = await request(app)
        .put(`/api/${tenantSlug}/settings`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({ requiresQuotationApproval: false });

      expect(res.status).toBe(403);
    });
  });
});
