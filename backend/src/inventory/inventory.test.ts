import request from 'supertest';
import { prisma } from '../shared/infrastructure/prisma/client';
import { createApp } from '../main/app';
import { JwtTokenService } from '../auth/infrastructure/JwtTokenService';
import { UserRole } from '../auth/domain/enums/UserRole';

describe('Inventory Module Integration Tests', () => {
  let app: any;
  const tokenService = new JwtTokenService();

  // Tokens
  let tokenTenant1Owner: string;
  let tokenTenant1Staff: string;
  let tokenTenant2Owner: string;

  // DB IDs
  const t1Id = 't1_inv_test';
  const t2Id = 't2_inv_test';
  const t1OwnerId = 'u1_owner_inv';
  const t1StaffId = 'u1_staff_inv';
  const t2OwnerId = 'u2_owner_inv';

  beforeAll(async () => {
    app = createApp();

    // 1. Setup Tenants & Users
    await prisma.tenant.createMany({
      data: [
        { id: t1Id, name: 'Tenant 1', urlSlug: 't1-inv' },
        { id: t2Id, name: 'Tenant 2', urlSlug: 't2-inv' },
      ],
    });

    await prisma.user.createMany({
      data: [
        { id: t1OwnerId, tenantId: t1Id, email: 'o1@inv.com', hashedPassword: 'hash', role: UserRole.BUSINESS_OWNER },
        { id: t1StaffId, tenantId: t1Id, email: 's1@inv.com', hashedPassword: 'hash', role: UserRole.STAFF },
        { id: t2OwnerId, tenantId: t2Id, email: 'o2@inv.com', hashedPassword: 'hash', role: UserRole.BUSINESS_OWNER },
      ],
    });

    // 2. Generate Tokens
    tokenTenant1Owner = tokenService.sign({ userId: t1OwnerId, role: UserRole.BUSINESS_OWNER, tenantId: t1Id, tenantSlug: 't1-inv', warehouseId: null });
    tokenTenant1Staff = tokenService.sign({ userId: t1StaffId, role: UserRole.STAFF, tenantId: t1Id, tenantSlug: 't1-inv', warehouseId: 'dummy-warehouse-id' });
    tokenTenant2Owner = tokenService.sign({ userId: t2OwnerId, role: UserRole.BUSINESS_OWNER, tenantId: t2Id, tenantSlug: 't2-inv', warehouseId: null });
  });

  afterAll(async () => {
    // Clean up
    await prisma.stockMovement.deleteMany({ where: { tenantId: { in: [t1Id, t2Id] } } });
    await prisma.stockLevel.deleteMany({ where: { tenantId: { in: [t1Id, t2Id] } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: [t1Id, t2Id] } } });
    await prisma.warehouse.deleteMany({ where: { tenantId: { in: [t1Id, t2Id] } } });
    await prisma.category.deleteMany({ where: { tenantId: { in: [t1Id, t2Id] } } });
    await prisma.notification.deleteMany({ where: { tenantId: { in: [t1Id, t2Id] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [t1Id, t2Id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [t1Id, t2Id] } } });
    await prisma.$disconnect();
  });

  describe('1. Cross-Tenant Isolation (Warehouses & Categories)', () => {
    it('Tenant 2 should NOT see Tenant 1 warehouses', async () => {
      // Setup T1 warehouse
      const t1Wh = await request(app).post('/api/t1-inv/inventory/warehouses')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({ name: 'T1 Hub' });
      expect(t1Wh.status).toBe(201);

      // Attempt to update T1 warehouse from T2
      const res = await request(app).put(`/api/t2-inv/inventory/warehouses/${t1Wh.body.id}`)
        .set('Authorization', `Bearer ${tokenTenant2Owner}`)
        .send({ name: 'Hijacked' });
      
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('Tenant 2 should NOT see Tenant 1 categories', async () => {
      const t1Cat = await request(app).post('/api/t1-inv/inventory/categories')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({ name: 'T1 Electronics' });
      expect(t1Cat.status).toBe(201);

      const res = await request(app).put(`/api/t2-inv/inventory/categories/${t1Cat.body.id}`)
        .set('Authorization', `Bearer ${tokenTenant2Owner}`)
        .send({ name: 'Hijacked' });
      
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('2. Warehouse/Category Deletion Blocked When In Use', () => {
    let categoryId: string;
    let warehouseId: string;
    let productId: string;

    it('should setup linked entities', async () => {
      const catRes = await request(app).post('/api/t1-inv/inventory/categories')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({ name: 'Blocked Cat' });
      categoryId = catRes.body.id;

      const whRes = await request(app).post('/api/t1-inv/inventory/warehouses')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({ name: 'Blocked Hub' });
      warehouseId = whRes.body.id;

      const prodRes = await request(app).post('/api/t1-inv/inventory/products')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({
          name: 'Blocked Product',
          description: 'Desc',
          categoryId,
          price: 100,
          initialStock: [{ warehouseId, quantity: 50 }]
        });
      productId = prodRes.body.id;

      expect(catRes.status).toBe(201);
      expect(whRes.status).toBe(201);
      expect(prodRes.status).toBe(201);
    });

    it('should block category deletion (CategoryInUseError -> 409 Conflict)', async () => {
      const res = await request(app).delete(`/api/t1-inv/inventory/categories/${categoryId}`)
        .set('Authorization', `Bearer ${tokenTenant1Owner}`);
      
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('cannot be deleted because it is assigned to products');
      
      // Verify still in DB
      const dbCheck = await prisma.category.findUnique({ where: { id: categoryId } });
      expect(dbCheck).not.toBeNull();
    });

    it('should block warehouse deletion (WarehouseInUseError -> 409 Conflict)', async () => {
      const res = await request(app).delete(`/api/t1-inv/inventory/warehouses/${warehouseId}`)
        .set('Authorization', `Bearer ${tokenTenant1Owner}`);
      
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('cannot be deleted because it has stock levels assigned');

      // Verify still in DB
      const dbCheck = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      expect(dbCheck).not.toBeNull();
    });
  });

  describe('3. Transfer Atomicity & Database Validation', () => {
    let sourceWhId: string;
    let destWhId: string;
    let productId: string;

    beforeAll(async () => {
      // Setup dedicated product and warehouses for transfer tests
      const sw = await request(app).post('/api/t1-inv/inventory/warehouses')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({ name: 'Source Hub' });
      sourceWhId = sw.body.id;

      const dw = await request(app).post('/api/t1-inv/inventory/warehouses')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({ name: 'Dest Hub' });
      destWhId = dw.body.id;

      const p = await request(app).post('/api/t1-inv/inventory/products')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({
          name: 'Transfer Product',
          description: 'Desc',
          price: 50,
          initialStock: [
            { warehouseId: sourceWhId, quantity: 100 },
            { warehouseId: destWhId, quantity: 10 }
          ]
        });
        productId = p.body.id;

        // Give the staff access to the source warehouse
        tokenTenant1Staff = tokenService.sign({ userId: t1StaffId, role: UserRole.STAFF, tenantId: t1Id, tenantSlug: 't1-inv', warehouseId: sourceWhId });
      });

    it('should execute a valid transfer atomically', async () => {
      const res = await request(app).post(`/api/t1-inv/inventory/products/${productId}/transfer`)
        .set('Authorization', `Bearer ${tokenTenant1Staff}`) // Staff can transfer
        .send({
          fromWarehouseId: sourceWhId,
          toWarehouseId: destWhId,
          quantity: 25,
          reason: 'Restocking'
        });

      expect(res.status).toBe(200);
      expect(res.body.sourceStock.quantity).toBe(75); // 100 - 25
      expect(res.body.destStock.quantity).toBe(35);   // 10 + 25

      // Check real DB state
      const dbSource = await prisma.stockLevel.findUnique({
        where: { tenantId_productId_warehouseId: { tenantId: t1Id, productId, warehouseId: sourceWhId } }
      });
      const dbDest = await prisma.stockLevel.findUnique({
        where: { tenantId_productId_warehouseId: { tenantId: t1Id, productId, warehouseId: destWhId } }
      });
      const dbMovement = await prisma.stockMovement.findFirst({
        where: { tenantId: t1Id, productId, fromWarehouseId: sourceWhId, toWarehouseId: destWhId, type: 'TRANSFER' }
      });

      expect(dbSource?.quantity).toBe(75);
      expect(dbDest?.quantity).toBe(35);
      expect(dbMovement?.quantity).toBe(25);
    });

    it('failed transfer (insufficient stock) leaves BOTH locations unchanged in actual DB rows', async () => {
      const res = await request(app).post(`/api/t1-inv/inventory/products/${productId}/transfer`)
        .set('Authorization', `Bearer ${tokenTenant1Staff}`)
        .send({
          fromWarehouseId: sourceWhId,
          toWarehouseId: destWhId,
          quantity: 1000, // Too high! Source only has 75
          reason: 'Will Fail'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot reduce stock by');

      // Check real DB state to prove ATOMICITY — nothing changed!
      const dbSource = await prisma.stockLevel.findUnique({
        where: { tenantId_productId_warehouseId: { tenantId: t1Id, productId, warehouseId: sourceWhId } }
      });
      const dbDest = await prisma.stockLevel.findUnique({
        where: { tenantId_productId_warehouseId: { tenantId: t1Id, productId, warehouseId: destWhId } }
      });

      expect(dbSource?.quantity).toBe(75); // Still 75
      expect(dbDest?.quantity).toBe(35);   // Still 35
    });

    it('cross-tenant isolation on transfer: cannot transfer TO a different tenant\'s warehouse', async () => {
      // T2 warehouse
      const t2Wh = await request(app).post('/api/t2-inv/inventory/warehouses')
        .set('Authorization', `Bearer ${tokenTenant2Owner}`)
        .send({ name: 'T2 Hub' });
      const t2WarehouseId = t2Wh.body.id;

      const res = await request(app).post(`/api/t1-inv/inventory/products/${productId}/transfer`)
        .set('Authorization', `Bearer ${tokenTenant1Staff}`) // Attempting as T1
        .send({
          fromWarehouseId: sourceWhId,
          toWarehouseId: t2WarehouseId, // Sneaking in T2's warehouse
          quantity: 10
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found'); // T1's API can't see T2's warehouse when looking up the stock level
    });

    it('cross-tenant isolation on adjust: cannot adjust stock in a different tenant\'s warehouse', async () => {
      // T2 warehouse
      const t2Wh = await request(app).post('/api/t2-inv/inventory/warehouses')
        .set('Authorization', `Bearer ${tokenTenant2Owner}`)
        .send({ name: 'T2 Hub For Adjust' });
      const t2WarehouseId = t2Wh.body.id;

      const res = await request(app).post(`/api/t1-inv/inventory/products/${productId}/adjust`)
        .set('Authorization', `Bearer ${tokenService.sign({ userId: t1StaffId, role: UserRole.STAFF, tenantId: t1Id, tenantSlug: 't1-inv', warehouseId: t2WarehouseId })}`) // Attempting as T1 but signed to T2 warehouse
        .send({
          warehouseId: t2WarehouseId, // Sneaking in T2's warehouse
          quantityChange: 50,
          reason: 'Exploit'
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('4. Missing Scope Coverage', () => {
    let testWh1Id: string;
    let testWh2Id: string;

    beforeAll(async () => {
      const w1 = await request(app).post('/api/t1-inv/inventory/warehouses').set('Authorization', `Bearer ${tokenTenant1Owner}`).send({ name: 'Scope Hub 1' });
      testWh1Id = w1.body.id;
      const w2 = await request(app).post('/api/t1-inv/inventory/warehouses').set('Authorization', `Bearer ${tokenTenant1Owner}`).send({ name: 'Scope Hub 2' });
      testWh2Id = w2.body.id;

      // Give staff access to testWh1Id
      tokenTenant1Staff = tokenService.sign({ userId: t1StaffId, role: UserRole.STAFF, tenantId: t1Id, tenantSlug: 't1-inv', warehouseId: testWh1Id });
    });

    it('Product creation: supports 0 locations vs multiple locations', async () => {
      // 0 locations
      const pZero = await request(app).post('/api/t1-inv/inventory/products')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({
          name: 'Zero Loc Product',
          description: 'No initial stock',
          price: 10,
          initialStock: []
        });
      expect(pZero.status).toBe(201);
      expect(pZero.body.stockBreakdown).toHaveLength(0);

      // Multiple locations
      const pMulti = await request(app).post('/api/t1-inv/inventory/products')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({
          name: 'Multi Loc Product',
          description: 'Has stock in 2 places',
          price: 20,
          initialStock: [
            { warehouseId: testWh1Id, quantity: 50 },
            { warehouseId: testWh2Id, quantity: 100 }
          ]
        });
      expect(pMulti.status).toBe(201);
      expect(pMulti.body.stockBreakdown).toHaveLength(2);
      expect(pMulti.body.stockBreakdown.find((s: any) => s.warehouseId === testWh1Id).quantity).toBe(50);
      expect(pMulti.body.stockBreakdown.find((s: any) => s.warehouseId === testWh2Id).quantity).toBe(100);
    });

    it('Adjust stock endpoint explicitly modifies stock and logs movement', async () => {
      const p = await request(app).post('/api/t1-inv/inventory/products')
        .set('Authorization', `Bearer ${tokenTenant1Owner}`)
        .send({ name: 'Adjustable', description: 'Desc', price: 10, initialStock: [{ warehouseId: testWh1Id, quantity: 50 }]});
      
      const res = await request(app).post(`/api/t1-inv/inventory/products/${p.body.id}/adjust`)
        .set('Authorization', `Bearer ${tokenTenant1Staff}`) // Staff can adjust
        .send({ warehouseId: testWh1Id, quantityChange: -20, reason: 'Shrinkage' });
      
      expect(res.status).toBe(200);
      expect(res.body.stockLevel.quantity).toBe(30);

      const dbMovement = await prisma.stockMovement.findFirst({
        where: { tenantId: t1Id, productId: p.body.id, type: 'ADJUSTMENT' }
      });
      expect(dbMovement?.quantity).toBe(-20);
      expect(dbMovement?.warehouseId).toBe(testWh1Id); // Proves the bug is fixed!
    });

    it('Product search with the 3 threshold boundaries (LOW_STOCK, IN_STOCK, OUT_OF_STOCK)', async () => {
      // Staff searches are scoped to their own warehouse, so the token has to
      // name a real one for the stock totals to mean anything.
      const scopedStaffToken = tokenService.sign({
        userId: t1StaffId, role: UserRole.STAFF, tenantId: t1Id,
        tenantSlug: 't1-inv', warehouseId: testWh1Id,
      });

      const p1 = await request(app).post('/api/t1-inv/inventory/products').set('Authorization', `Bearer ${tokenTenant1Owner}`).send({ name: 'Search Out', description: 'D', price: 10, initialStock: [] });
      const p2 = await request(app).post('/api/t1-inv/inventory/products').set('Authorization', `Bearer ${tokenTenant1Owner}`).send({ name: 'Search Low', description: 'D', lowStockThreshold: 10, price: 10, initialStock: [{ warehouseId: testWh1Id, quantity: 5 }] });
      const p3 = await request(app).post('/api/t1-inv/inventory/products').set('Authorization', `Bearer ${tokenTenant1Owner}`).send({ name: 'Search In', description: 'D', lowStockThreshold: 10, price: 10, initialStock: [{ warehouseId: testWh1Id, quantity: 50 }] });
      
      const outRes = await request(app).get('/api/t1-inv/inventory/products?availability=OUT_OF_STOCK').set('Authorization', `Bearer ${scopedStaffToken}`);
      expect(outRes.body.items.some((p: any) => p.id === p1.body.id)).toBe(true);
      expect(outRes.body.items.some((p: any) => p.id === p2.body.id)).toBe(false);

      const lowRes = await request(app).get('/api/t1-inv/inventory/products?availability=LOW_STOCK').set('Authorization', `Bearer ${scopedStaffToken}`);
      expect(lowRes.body.items.some((p: any) => p.id === p2.body.id)).toBe(true);
      expect(lowRes.body.items.some((p: any) => p.id === p3.body.id)).toBe(false);

      const inRes = await request(app).get('/api/t1-inv/inventory/products?availability=IN_STOCK').set('Authorization', `Bearer ${scopedStaffToken}`);
      expect(inRes.body.items.some((p: any) => p.id === p3.body.id)).toBe(true);
      expect(inRes.body.items.some((p: any) => p.id === p1.body.id)).toBe(false);
    });

    it('Role-gating proving 403 at the API level', async () => {
      // 1. Business-Owner-ONLY endpoint: Create Warehouse (Staff is rejected)
      const createWhRes = await request(app).post('/api/t1-inv/inventory/warehouses')
        .set('Authorization', `Bearer ${tokenTenant1Staff}`) // Staff attempting to create warehouse
        .send({ name: 'Staff Warehouse' });
      expect(createWhRes.status).toBe(403);
      expect(createWhRes.body.error).toContain('Forbidden');

      // A role without inventory.manage at all is refused by requirePermission
      // before any use case runs — see tests/integration/access/permissionMatrix.
      // (A forged SUPER_ADMIN token is no longer a useful negative case: D2
      // makes the platform operator hold every permission.)
    });
  });
});
