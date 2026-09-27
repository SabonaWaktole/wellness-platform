import { redactFields } from '../../../../src/access/domain/redactFields';
import { accessWith, administrator } from '../../../support/access';

describe('redactFields (FR-RBAC-06)', () => {
  const quotation = {
    id: 'q1',
    status: 'SENT',
    lineItems: [{ productId: 'p1', quantity: 2, unitPrice: 50, lineTotal: 100 }],
    subtotal: 100,
    grandTotal: 100,
    sentAt: '2026-01-01',
  };
  const invoice = { id: 'i1', status: 'PAID', paidAt: '2026-02-01', subtotal: 100, grandTotal: 100 };

  it('leaves everything to a viewer holding commercial.view and payments.view', () => {
    expect(redactFields(quotation, administrator())).toEqual(quotation);
  });

  it('removes prices and totals, at any depth, without commercial.view', () => {
    const view = redactFields(quotation, accessWith({ 'quotations.manage': 'ALL' as any }));

    expect(view).toEqual({
      id: 'q1',
      status: 'SENT',
      lineItems: [{ productId: 'p1', quantity: 2 }],
      sentAt: '2026-01-01',
    });
  });

  it('removes payment facts without payments.view', () => {
    const view = redactFields(invoice, administrator({ revoke: ['payments.view'] }));
    expect(view).not.toHaveProperty('paidAt');
    expect(view).toHaveProperty('grandTotal', 100);
  });

  it('serialises through toJSON, like the response would', () => {
    const entity = { toJSON: () => ({ id: 'x', unitPrice: 1 }) };
    expect(redactFields(entity, accessWith({}))).toEqual({ id: 'x' });
  });
});
