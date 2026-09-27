import { GetInvoiceDetailUseCase } from './GetInvoiceDetailUseCase';
import { Invoice } from '../../domain/Invoice';
import { InvoiceLineItem } from '../../domain/InvoiceLineItem';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { administrator, salesManager, salesUser } from '../../../../tests/support/access';

const invoiceBy = (createdByUserId: string) =>
  Invoice.create({
    id: 'inv1',
    tenantId: 't1',
    clientId: 'client-1',
    quotationId: 'q1',
    createdByUserId,
    lineItems: [
      InvoiceLineItem.create({
        id: 'li1', tenantId: 't1', invoiceId: 'inv1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10,
      }),
    ],
    dueDate: new Date('2026-09-01'),
  });

describe('GetInvoiceDetailUseCase', () => {
  const invoiceRepo = { findById: jest.fn() } as any;
  const lineItemRepo = { findByInvoiceId: jest.fn().mockResolvedValue([]) } as any;
  const historyRepo = { findByInvoiceId: jest.fn().mockResolvedValue([]) } as any;
  const useCase = new GetInvoiceDetailUseCase(invoiceRepo, lineItemRepo, historyRepo);

  const run = (access: ReturnType<typeof salesUser>) =>
    useCase.execute({ tenantId: 't1', invoiceId: 'inv1', actingUserId: access.userId, access });

  it('FR-RBAC-11 an OWN-scoped caller acts on an invoice they created', async () => {
    invoiceRepo.findById.mockResolvedValue(invoiceBy('me'));
    const result = await run(salesUser({ userId: 'me' }));
    expect(result.permittedActions).toEqual(['SEND', 'VOID']);
  });

  it('FR-RBAC-11 an OWN-scoped caller is refused a colleague\'s invoice', async () => {
    invoiceRepo.findById.mockResolvedValue(invoiceBy('someone'));
    await expect(run(salesUser({ userId: 'me' }))).rejects.toThrow(PermissionDeniedError);
  });

  it('FR-RBAC-11 a wider scope acts on any invoice, whatever the role is called', async () => {
    invoiceRepo.findById.mockResolvedValue(invoiceBy('someone'));
    expect((await run(salesManager({ userId: 'me' }))).permittedActions).toEqual(['SEND', 'VOID']);
    expect((await run(administrator({ userId: 'me' }))).permittedActions).toEqual(['SEND', 'VOID']);
  });
});
