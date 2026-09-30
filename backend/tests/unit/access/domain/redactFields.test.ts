import { COMMERCIAL_FIELDS, redactFields } from '../../../../src/access/domain/redactFields';
import { accessWith, administrator, reception } from '../../../support/access';
import { expectNoCommercialFields } from '../../../support/expectNoCommercialFields';

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

  describe('FR-RBAC-17 Milestone 2 commercial fields', () => {
    const offer = {
      id: 'o1',
      status: 'DRAFT',
      breakdown: { baseFee: '38.00', riskFee: '3.80', visitFee: '7.60', locationFee: '0.00' },
      listPrice: '49.40',
      discountPercent: '10.00',
      discountAmount: '4.94',
      netMonthlyPrice: '44.46',
      pricePerEmployee: '24.70',
      annualValue: '592.80',
      deal: { id: 'd1', agreedMonthlyPrice: '44.46', agreedAnnualValue: '533.52' },
      approval: { requestedPercent: '15.00', approvedPercent: '12.00' },
      risk: { surchargePercent: '10.00' },
    };

    it('guards every Milestone 2 money and percentage field name under commercial.view', () => {
      expect(COMMERCIAL_FIELDS).toEqual(
        expect.arrayContaining([
          'listPrice', 'netMonthlyPrice', 'discountAmount', 'discountPercent', 'baseFee', 'riskFee', 'visitFee',
          'locationFee', 'annualValue', 'pricePerEmployee', 'agreedMonthlyPrice', 'agreedAnnualValue',
          'requestedPercent', 'approvedPercent', 'surchargePercent',
        ])
      );
    });

    it('Reception receives no deal, offer, discount or pricing amount at any depth', () => {
      const view = redactFields(offer, reception());
      expectNoCommercialFields(view);
      expect(view).toEqual({ id: 'o1', status: 'DRAFT', breakdown: {}, deal: { id: 'd1' }, approval: {}, risk: {} });
    });

    it('a viewer with commercial.view keeps them', () => {
      expect(redactFields(offer, administrator())).toEqual(offer);
    });

    it('expectNoCommercialFields fails on a guarded name nested in an array', () => {
      expect(() => expectNoCommercialFields({ items: [{ id: 'x', listPrice: '1.00' }] })).toThrow(/listPrice/);
    });
  });
});
