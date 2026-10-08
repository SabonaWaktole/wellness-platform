import {
  COMMERCIAL_FIELDS,
  MEMBER_CONTACT_FIELDS,
  MEMBER_PAYMENT_FIELDS,
  PAYMENT_FIELDS,
  redactFields,
  redactMemberFields,
} from '../../../../src/access/domain/redactFields';
import { accessWith, administrator, ceo, reception, salesUser } from '../../../support/access';
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

    it('guards the pricing configuration fields of Settings → Pricing (M2 Slice 3)', () => {
      const config = {
        currency: 'EUR',
        discountCapPercent: '10.00',
        bands: [{ id: 'b1', minEmployees: 1, maxEmployees: 10, baseFee: '30.00', perEmployeeFee: '8.00' }],
        riskSurcharges: [{ riskLevelId: 'r1', level: 2, riskSurchargePercent: '10.00' }],
        frequencies: [{ id: 'f1', pricingType: 'PERCENT', frequencyValue: '20.00' }],
        zones: [{ id: 'z1', surchargePercent: '15.00', cityIds: ['c1'] }],
      };
      const view = redactFields(config, reception());
      expectNoCommercialFields(view);
      expect(view).toEqual({
        currency: 'EUR',
        bands: [{ id: 'b1', minEmployees: 1, maxEmployees: 10 }],
        riskSurcharges: [{ riskLevelId: 'r1', level: 2 }],
        frequencies: [{ id: 'f1', pricingType: 'PERCENT' }],
        zones: [{ id: 'z1', cityIds: ['c1'] }],
      });
    });

    it('FR-RBAC-17 guards a saved offer\'s rule values and the deal\'s copy of its value (M2 Slice 8)', () => {
      const saved = {
        id: 'o1',
        pricingInputs: { employees: 2, discountPercent: '10.00' },
        ruleSnapshot: {
          band: { minEmployees: 1, maxEmployees: 10, baseFee: '30.00', perEmployeeFee: '8.00' },
          riskSurchargePercent: '10.00',
          frequency: { pricingType: 'PERCENT', frequencyValue: '20.00' },
          surchargePercent: '0.00',
          discountCapPercent: '10.00',
          contractMonths: 12,
        },
        deal: { id: 'd1', offerNetMonthlyPrice: '44.46', offerAnnualValue: '533.52' },
      };
      const view = redactFields(saved, reception());
      expectNoCommercialFields(view);
      expect(view).toEqual({
        id: 'o1',
        pricingInputs: { employees: 2 },
        ruleSnapshot: { band: { minEmployees: 1, maxEmployees: 10 }, frequency: { pricingType: 'PERCENT' }, contractMonths: 12 },
        deal: { id: 'd1' },
      });
    });

    it('expectNoCommercialFields fails on a guarded name nested in an array', () => {
      expect(() => expectNoCommercialFields({ items: [{ id: 'x', listPrice: '1.00' }] })).toThrow(/listPrice/);
    });
  });

  describe('FR-RBAC-21 Milestone 3 contract and payment fields', () => {
    const contract = {
      id: 'c1',
      number: 'CTR-2027-0001',
      status: 'ACTIVE',
      startsAt: '2027-03-01',
      endsAt: '2028-02-29',
      company: { id: 'k1', name: 'Alba Shpk' },
      agreedMonthlyPrice: '49.40',
      agreedAnnualValue: '592.80',
      discountPercent: '0.00',
      servicesSnapshot: [{ name: 'Medical check', price: '10.00' }],
      packageId: 'p1',
      packageName: 'Standard',
      termsText: 'Terms',
      quotationId: 'q1',
      documents: [{ id: 'd1', name: 'signed.pdf' }],
      paymentSummary: { total: '592.80', received: '148.20', outstanding: '444.60' },
      payments: [
        { id: 'i1', dueDate: '2027-03-01', status: 'PAID', amount: '49.40', paidAmount: '49.40', outstanding: '0.00', invoiceNumber: 'F-1', invoiceDate: '2027-03-02' },
      ],
    };
    const shown = ['id', 'number', 'status', 'startsAt', 'endsAt', 'company'];

    it('guards each Milestone 3 field name under its permission', () => {
      expect(COMMERCIAL_FIELDS).toEqual(
        expect.arrayContaining(['servicesSnapshot', 'termsText', 'packageId', 'packageName', 'quotationId', 'documents'])
      );
      expect(PAYMENT_FIELDS).toEqual(
        expect.arrayContaining(['paidAmount', 'outstanding', 'paymentSummary', 'payments', 'invoiceNumber', 'invoiceDate'])
      );
    });

    it('FR-RBAC-21 the Slice 8 instalment fields (method, receipt and flag) need payments.view', () => {
      const instalment = {
        id: 'i1', status: 'PARTIALLY_PAID', method: 'CASH', receivedOn: '2027-03-10', amountReceived: '20.00',
        dueNotInvoiced: false, overdueAmount: '0.00', nextDueDate: '2027-04-01',
      };
      const stripped = redactFields(instalment, administrator({ revoke: ['payments.view'] })) as Record<string, unknown>;
      expect(Object.keys(stripped)).toEqual(['id', 'status']);
      expect(redactFields(instalment, administrator())).toEqual(instalment);
    });

    it('Reception receives only number, status, validity dates and company', () => {
      const view = redactFields(contract, reception()) as Record<string, unknown>;
      expect(Object.keys(view).sort()).toEqual([...shown].sort());
      expectNoCommercialFields(view);
    });

    it('a viewer with payments.view but not commercial.view loses the commercial fields and keeps payments', () => {
      const view = redactFields(contract, administrator({ revoke: ['commercial.view'] })) as any;
      expect(view).not.toHaveProperty('agreedMonthlyPrice');
      expect(view).not.toHaveProperty('termsText');
      expect(view.payments[0]).toMatchObject({ paidAmount: '49.40', invoiceNumber: 'F-1' });
      expect(view.payments[0]).not.toHaveProperty('amount');
    });

    it('a viewer with commercial.view but not payments.view loses every payment field', () => {
      const view = redactFields(contract, administrator({ revoke: ['payments.view'] })) as any;
      for (const key of ['paymentSummary', 'payments']) expect(view).not.toHaveProperty(key);
      expect(view).toHaveProperty('agreedMonthlyPrice', '49.40');
      const instalment = redactFields(contract.payments[0], administrator({ revoke: ['payments.view'] })) as any;
      for (const key of PAYMENT_FIELDS) expect(instalment).not.toHaveProperty(key);
    });

    it('an Administrator receives the whole contract', () => {
      expect(redactFields(contract, administrator())).toEqual(contract);
    });
  });

  describe('FR-RBAC-27 Wellness+ fields', () => {
    const member = {
      id: 'm1',
      memberNumber: 'WP-000001',
      name: 'Ana Dervishi',
      phone: '+355 69 000 0000',
      email: 'ana@example.com',
      note: 'Prefers mornings',
      verificationEvents: [{ at: '2027-03-01', result: 'MATCH' }],
      listFee: '60.00',
      discountPercent: '50.00',
      amount: '30.00',
      receiptNumber: 'RCP-2027-000045',
      method: 'CASH',
      receivedOn: '2027-03-15',
      voidReason: null,
      payments: [{ id: 'p1', amount: '30.00', receiptNumber: 'RCP-2027-000045' }],
    };
    const verifyOnly = () => accessWith({ 'members.verify': true });

    it('lists the payment and contact fields the SRS names', () => {
      expect(MEMBER_PAYMENT_FIELDS).toEqual(
        expect.arrayContaining(['amount', 'listFee', 'discountPercent', 'receiptNumber', 'method', 'receivedOn', 'payments', 'revenue', 'voidReason'])
      );
      expect(MEMBER_CONTACT_FIELDS).toEqual(expect.arrayContaining(['phone', 'email', 'note', 'verificationEvents']));
    });

    it('FR-RBAC-27 leaves a member whole to a viewer with every Wellness+ read permission', () => {
      expect(redactMemberFields(member, administrator())).toEqual(member);
    });

    it('FR-RBAC-27 removes payment fields without members.payments.view and keeps the contact fields', () => {
      const view = redactMemberFields(member, accessWith({ 'members.view': true })) as any;
      for (const key of MEMBER_PAYMENT_FIELDS) expect(view).not.toHaveProperty(key);
      expect(view.payments).toBeUndefined();
      expect(view).toMatchObject({ phone: member.phone, email: member.email, note: member.note });
    });

    it('FR-RBAC-27 removes phone, email, internal note and verification log from a viewer holding only members.verify', () => {
      const view = redactMemberFields(member, verifyOnly()) as any;
      for (const key of MEMBER_CONTACT_FIELDS) expect(view).not.toHaveProperty(key);
      for (const key of MEMBER_PAYMENT_FIELDS) expect(view).not.toHaveProperty(key);
      expect(view).toMatchObject({ id: 'm1', memberNumber: 'WP-000001', name: 'Ana Dervishi' });
    });

    it('FR-RBAC-27 shows payments to a viewer with members.payments.view but not members.view, and no contact field', () => {
      const view = redactMemberFields(member, accessWith({ 'members.payments.view': true })) as any;
      expect(view.payments).toHaveLength(1);
      expect(view).not.toHaveProperty('phone');
    });

    it.each([
      ['Sales User', salesUser()],
      ['an Administrator whose Wellness+ keys were all revoked', administrator({ revoke: ['members.view', 'members.verify', 'members.manage', 'members.payments.view', 'members.payments.record', 'members.import', 'members.vip.approve', 'members.reports.view', 'wellnessplus.settings.manage'] })],
    ])('FR-RBAC-27 %s with no Wellness+ permission receives no Wellness+ field', (_label, access) => {
      const view = redactMemberFields(member, access) as Record<string, unknown>;
      expect(Object.keys(view)).toEqual(['id', 'memberNumber', 'name']);
    });

    it('the Wellness+ names that belong to nothing else are guarded in every response (redactFields), not only member ones', () => {
      const view = redactFields({ listFee: '60.00', receiptNumber: 'RCP-1', voidReason: 'x', verificationEvents: [], phone: '1' }, salesUser()) as any;
      expect(view).toEqual({ phone: '1' });
    });

    it('generic names shared with other modules stay in other responses (a company keeps its phone and note)', () => {
      const company = { id: 'c1', phone: '+355 4 000', email: 'a@b.al', note: 'x' };
      expect(redactFields(company, reception())).toEqual(company);
    });

    it('the CEO reads members and payments but the contact fields come from members.view', () => {
      const view = redactMemberFields(member, ceo()) as any;
      expect(view).toEqual(member);
    });
  });
});
