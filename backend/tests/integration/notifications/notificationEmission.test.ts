import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { SubmitQuotationUseCase } from '../../../src/quotations/application/use-cases/SubmitQuotationUseCase';
import { ApproveQuotationUseCase } from '../../../src/quotations/application/use-cases/ApproveQuotationUseCase';
import { PrismaQuotationWriteTransaction } from '../../../src/quotations/infrastructure/PrismaQuotationWriteTransaction';
import { PrismaQuotationLineItemRepository } from '../../../src/quotations/infrastructure/repositories/PrismaQuotationLineItemRepository';
import { PrismaStockLevelRepository } from '../../../src/inventory/infrastructure/repositories/PrismaStockLevelRepository';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { administrator, salesUser, scopeResolver } from '../../support/access';

/**
 * Emission through the real transaction, against a real database.
 *
 * The unit tests cover the service's rules with mocks. What they cannot show is
 * that `PrismaQuotationWriteTransaction` genuinely binds its repositories to
 * the transaction — the flaw that made `PrismaUnitOfWork` a no-op (TD-032). The
 * rollback test below is the one that would fail if this port had the same bug.
 */
describe('Notification emission through the quotation write transaction', () => {
  let prisma: PrismaClient;
  const createdTenantIds: string[] = [];

  let tenantId: string;
  let ownerAId: string;
  let ownerBId: string;
  let staffId: string;
  let deactivatedOwnerId: string;
  let clientId: string;
  let quotationId: string;

  const clearCreated = async () => {
    if (createdTenantIds.length === 0) return;
    const where = { tenantId: { in: createdTenantIds } };
    await prisma.notification.deleteMany({ where });
    await prisma.quotationStatusHistory.deleteMany({ where });
    await prisma.quotationLineItem.deleteMany({ where });
    await prisma.quotation.deleteMany({ where });
    await prisma.stockLevel.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.warehouse.deleteMany({ where });
    await prisma.client.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    createdTenantIds.length = 0;
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await clearCreated();

    tenantId = uuidv4();
    createdTenantIds.push(tenantId);
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Emit Tenant', urlSlug: `emit-${tenantId.slice(0, 8)}` },
    });

    ownerAId = uuidv4();
    ownerBId = uuidv4();
    staffId = uuidv4();
    deactivatedOwnerId = uuidv4();
    await prisma.user.createMany({
      data: [
        { id: ownerAId, email: `a-${ownerAId}@t`, hashedPassword: 'h', role: 'BUSINESS_OWNER', tenantId, isActive: true },
        { id: ownerBId, email: `b-${ownerBId}@t`, hashedPassword: 'h', role: 'BUSINESS_OWNER', tenantId, isActive: true },
        { id: staffId, email: `s-${staffId}@t`, hashedPassword: 'h', role: 'STAFF', tenantId, isActive: true },
        { id: deactivatedOwnerId, email: `d-${deactivatedOwnerId}@t`, hashedPassword: 'h', role: 'BUSINESS_OWNER', tenantId, isActive: false },
      ],
    });

    clientId = uuidv4();
    await prisma.client.create({
      data: { id: clientId, tenantId, name: 'Emit Client', status: 'ACTIVE', assignedUserId: staffId, customFieldValues: {}, lastUpdatedByUserId: ownerAId },
    });

    quotationId = uuidv4();
    await prisma.quotation.create({
      data: { id: quotationId, tenantId, clientId, createdByUserId: staffId, status: 'DRAFT' },
    });

    // Quotation.create refuses a quotation with no line items, so hydrating one
    // from the database requires at least one — with the product and warehouse
    // its foreign keys point at.
    const warehouseId = uuidv4();
    await prisma.warehouse.create({ data: { id: warehouseId, tenantId, name: 'Main' } });
    const productId = uuidv4();
    await prisma.product.create({
      data: { id: productId, tenantId, name: 'Widget', description: 'd', price: 10 },
    });
    await prisma.quotationLineItem.create({
      data: {
        id: uuidv4(), tenantId, quotationId, productId, warehouseId,
        quantity: 1, unitPrice: 10,
      },
    });
    // Submit/Approve now refuse to reach SENT with insufficient stock — plenty
    // on hand here so that check is a non-event for these notification tests.
    await prisma.stockLevel.create({
      data: {
        id: uuidv4(), tenantId, productId, warehouseId, quantity: 100,
        productTenantId: tenantId, warehouseTenantId: tenantId,
      },
    });
  });

  afterAll(async () => {
    await clearCreated();
    await prisma.$disconnect();
  });

  const writeTx = () => new PrismaQuotationWriteTransaction();
  const userRepo = () => new PrismaUserRepository();
  const lineItemRepo = () => new PrismaQuotationLineItemRepository(prisma);
  const stockLevelRepo = () => new PrismaStockLevelRepository(prisma);

  const notificationsFor = (recipientUserId: string) =>
    prisma.notification.findMany({ where: { tenantId, recipientUserId } });

  it('fans out to every ACTIVE Business Owner when a quotation needs approval', async () => {
    await new SubmitQuotationUseCase(writeTx(), userRepo(), lineItemRepo(), stockLevelRepo(), scopeResolver()).execute({
      tenantId,
      quotationId,
      actingUserId: staffId,
      access: salesUser({ userId: staffId }),
      requiresQuotationApproval: true,
    });

    expect(await notificationsFor(ownerAId)).toHaveLength(1);
    expect(await notificationsFor(ownerBId)).toHaveLength(1);
  });

  it('does NOT notify a deactivated Business Owner (TD-010)', async () => {
    await new SubmitQuotationUseCase(writeTx(), userRepo(), lineItemRepo(), stockLevelRepo(), scopeResolver()).execute({
      tenantId,
      quotationId,
      actingUserId: staffId,
      access: salesUser({ userId: staffId }),
      requiresQuotationApproval: true,
    });

    expect(await notificationsFor(deactivatedOwnerId)).toHaveLength(0);
  });

  it('does not notify anyone when the tenant does not require approval', async () => {
    // The quotation goes straight to SENT; nobody is waiting on anything.
    await new SubmitQuotationUseCase(writeTx(), userRepo(), lineItemRepo(), stockLevelRepo(), scopeResolver()).execute({
      tenantId,
      quotationId,
      actingUserId: staffId,
      access: salesUser({ userId: staffId }),
      requiresQuotationApproval: false,
    });

    expect(await prisma.notification.findMany({ where: { tenantId } })).toHaveLength(0);
  });

  it('notifies the creator on approval, and not the approver', async () => {
    await new SubmitQuotationUseCase(writeTx(), userRepo(), lineItemRepo(), stockLevelRepo(), scopeResolver()).execute({
      tenantId, quotationId, actingUserId: staffId,
      access: salesUser({ userId: staffId }), requiresQuotationApproval: true,
    });
    await prisma.notification.deleteMany({ where: { tenantId } });

    await new ApproveQuotationUseCase(writeTx(), userRepo(), lineItemRepo(), stockLevelRepo()).execute({
      tenantId, quotationId, actingUserId: ownerAId, access: administrator({ userId: ownerAId }),
    });

    const forCreator = await notificationsFor(staffId);
    expect(forCreator).toHaveLength(1);
    expect(forCreator[0].type).toBe('QUOTATION_APPROVED');
    // The approver acted; they are not told about their own action.
    expect(await notificationsFor(ownerAId)).toHaveLength(0);
  });

  it('stores an i18n key and params, not a rendered sentence', async () => {
    await new SubmitQuotationUseCase(writeTx(), userRepo(), lineItemRepo(), stockLevelRepo(), scopeResolver()).execute({
      tenantId, quotationId, actingUserId: staffId,
      access: salesUser({ userId: staffId }), requiresQuotationApproval: true,
    });

    const [row] = await notificationsFor(ownerAId);
    expect(row.type).toBe('QUOTATION_SUBMITTED_FOR_APPROVAL');
    expect(row.params).toEqual({ reference: quotationId.split('-')[0].toUpperCase() });
    expect(row.entityType).toBe('QUOTATION');
    expect(row.entityId).toBe(quotationId);
  });

  it('rolls the notification back when the transition fails — proving the transaction is real', async () => {
    /*
     * This is the test that distinguishes a working write transaction from
     * `PrismaUnitOfWork`, which opens a $transaction but leaves its
     * repositories on the global client so nothing rolls back.
     *
     * Approving a DRAFT quotation throws inside the transaction, after the
     * quotation and history writes would have happened. Everything must be
     * absent afterwards.
     */
    await expect(
      new ApproveQuotationUseCase(writeTx(), userRepo(), lineItemRepo(), stockLevelRepo()).execute({
        tenantId, quotationId, actingUserId: ownerAId, access: administrator({ userId: ownerAId }),
      })
    ).rejects.toThrow('Invalid state transition');

    expect(await prisma.notification.findMany({ where: { tenantId } })).toHaveLength(0);
    expect(await prisma.quotationStatusHistory.findMany({ where: { tenantId } })).toHaveLength(0);

    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
    expect(quotation!.status).toBe('DRAFT');
  });
});
