import request from 'supertest';
import { createApp } from '../../../src/main/app';
import { prisma } from '../../../src/shared/infrastructure/prisma/client';
import { QuotationStatus } from '../../../src/quotations/domain/Quotation';

/**
 * E2E Lifecycle Tests for Quotations
 * 
 * Tests the full lifecycle paths through the real HTTP layer + real database:
 *   1. Create → Submit → Reject
 *   2. Create → Submit → Expire
 *   3. Zod validation rejection (malformed payloads)
 *
 * The primary "happy path" (Create → Submit → Accept + stock deduction) and
 * the approval flow (Create → Submit → PendingApproval → Approve/ReturnToDraft)
 * are covered in Quotations.integration.test.ts.
 */

let app: any;
let tokenOwner: string;
let tokenStaff: string;
let tenantId: string;
let clientId: string;
let productId: string;
let warehouseId: string;
const tenantSlug = 'quotation-e2e-test';

beforeAll(async () => {
  app = createApp();

  const tenant = await prisma.tenant.create({
    data: {
      id: 'tenant-q-e2e',
      name: 'Quotation E2E Tenant',
      urlSlug: tenantSlug,
      requiresQuotationApproval: false
    }
  });
  tenantId = tenant.id;

  const owner = await prisma.user.create({
    data: { id: 'user-q-e2e-owner', tenantId, email: 'owner@qe2e.com', hashedPassword: 'hash', role: 'BUSINESS_OWNER' }
  });
  const staff = await prisma.user.create({
    data: { id: 'user-q-e2e-staff', tenantId, email: 'staff@qe2e.com', hashedPassword: 'hash', role: 'STAFF' }
  });

  const { JwtTokenService } = require('../../../src/auth/infrastructure/JwtTokenService');
  const tokenService = new JwtTokenService();
  tokenOwner = tokenService.sign({ userId: owner.id, role: owner.role, tenantId: owner.tenantId, tenantSlug });
  tokenStaff = tokenService.sign({ userId: staff.id, role: staff.role, tenantId: staff.tenantId, tenantSlug });

  const client = await prisma.client.create({
    data: {
      id: 'client-q-e2e',
      tenantId,
      name: 'Client Q E2E',
      // The Sales User's own company: quotations and invoices follow their
      // company (FR-RBAC-11), so staff can only quote for companies they hold.
      assignedUserId: staff.id,
      status: 'ACTIVE',
      customFieldValues: {},
      lastUpdatedByUserId: owner.id
    }
  });
  clientId = client.id;

  const category = await prisma.category.create({
    data: { id: 'cat-q-e2e', tenantId, name: 'Cat Q E2E' }
  });

  const product = await prisma.product.create({
    data: {
      id: 'prod-q-e2e',
      tenantId,
      categoryId: category.id,
      name: 'Product Q E2E',
      description: 'Test product for quotation E2E',
      price: 200
    }
  });
  productId = product.id;

  const warehouse = await prisma.warehouse.create({
    data: { id: 'wh-q-e2e', tenantId, name: 'WH Q E2E' }
  });
  warehouseId = warehouse.id;

  await prisma.stockLevel.create({
    data: {
      id: 'sl-q-e2e',
      tenantId,
      productId,
      productTenantId: tenantId,
      warehouseId,
      warehouseTenantId: tenantId,
      quantity: 100
    }
  });
});

afterAll(async () => {
  if (tenantId) {
    await prisma.quotationStatusHistory.deleteMany({ where: { tenantId } });
    await prisma.quotationLineItem.deleteMany({ where: { tenantId } });
    await prisma.quotation.deleteMany({ where: { tenantId } });
    await prisma.stockMovement.deleteMany({ where: { tenantId } });
    await prisma.stockLevel.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.warehouse.deleteMany({ where: { tenantId } });
    await prisma.category.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  }
});

describe('Quotation E2E Lifecycle Tests', () => {

  // -----------------------------------------------------------------------
  // PATH 1: Create → Submit → Reject
  // -----------------------------------------------------------------------
  describe('Reject Flow', () => {
    let quotationId: string;

    it('Create Quotation (Draft)', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({
          clientId,
          lineItems: [{ productId, warehouseId, quantity: 5, unitPrice: 200 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(QuotationStatus.Draft);
      quotationId = res.body.id;
    });

    it('Submit Quotation (Sent)', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations/${quotationId}/submit`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(QuotationStatus.Sent);
    });

    it('Reject Quotation', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations/${quotationId}/mark-rejected`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(QuotationStatus.Rejected);
    });

    it('Stock is NOT deducted after rejection', async () => {
      const stock = await prisma.stockLevel.findFirst({ where: { productId, warehouseId } });
      expect(stock!.quantity).toBe(100); // Unchanged
    });
  });

  // -----------------------------------------------------------------------
  // PATH 2: Create → Submit → Expire
  // -----------------------------------------------------------------------
  describe('Expire Flow', () => {
    let quotationId: string;

    it('Create Quotation (Draft)', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({
          clientId,
          lineItems: [{ productId, warehouseId, quantity: 3, unitPrice: 200 }]
        });

      expect(res.status).toBe(201);
      quotationId = res.body.id;
    });

    it('Submit Quotation (Sent)', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations/${quotationId}/submit`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(QuotationStatus.Sent);
    });

    it('Expire Quotation', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations/${quotationId}/expire`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(QuotationStatus.Expired);
    });

    it('Stock is NOT deducted after expiry', async () => {
      const stock = await prisma.stockLevel.findFirst({ where: { productId, warehouseId } });
      expect(stock!.quantity).toBe(100); // Unchanged
    });
  });

  // -----------------------------------------------------------------------
  // PATH 3: Zod Validation Rejection (malformed payloads)
  // -----------------------------------------------------------------------
  describe('Zod Validation Enforcement', () => {
    it('Rejects create with missing clientId', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({ lineItems: [{ productId, warehouseId, quantity: 1, unitPrice: 10 }] });

      expect(res.status).toBe(400);
    });

    it('Rejects create with empty lineItems', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({ clientId, lineItems: [] });

      expect(res.status).toBe(400);
    });

    it('Rejects create with negative quantity', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({
          clientId,
          lineItems: [{ productId, warehouseId, quantity: -5, unitPrice: 100 }]
        });

      expect(res.status).toBe(400);
    });

    it('Rejects create with negative unitPrice', async () => {
      const res = await request(app)
        .post(`/api/${tenantSlug}/quotations`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({
          clientId,
          lineItems: [{ productId, warehouseId, quantity: 1, unitPrice: -100 }]
        });

      expect(res.status).toBe(400);
    });

    it('Rejects search with invalid status', async () => {
      const res = await request(app)
        .get(`/api/${tenantSlug}/quotations?status=NOT_A_STATUS`)
        .set('Authorization', `Bearer ${tokenStaff}`);

      expect(res.status).toBe(400);
    });
  });
});
