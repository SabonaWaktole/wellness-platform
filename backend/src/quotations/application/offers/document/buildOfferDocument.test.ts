import { OfferView } from '../offerViews';
import { OfferRenderSnapshot } from './OfferRenderSnapshot';
import { buildOfferDocument } from './buildOfferDocument';

const paragraph = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

const details: OfferRenderSnapshot = {
  schemaVersion: 1,
  issuer: {
    companyName: 'Wellness Albania',
    nipt: 'L12345678A',
    address: 'Rruga e Kavajës, Tiranë',
    phone: '+355 69 000 0000',
    email: 'info@wellness.al',
    website: 'wellness.al',
    bankDetails: 'IBAN AL00 0000',
  },
  texts: {
    introSq: paragraph('Hyrje'),
    introEn: paragraph('Introduction'),
    termsSq: paragraph('Kushtet'),
    termsEn: null,
    closingSq: paragraph('Përshëndetje'),
    closingEn: paragraph('Regards'),
  },
  company: {
    name: 'Kafe Blloku',
    nipt: 'K98765432B',
    streetAddress: 'Rruga Pjetër Bogdani 5',
    area: { nameSq: 'Qendër', nameEn: 'Centre' },
    city: { nameSq: 'Tiranë', nameEn: 'Tirana' },
  },
  contact: { name: 'Elira Hoxha', position: 'Administratore', phone: '+355 68 111 1111', email: 'elira@blloku.al' },
  salesperson: { name: 'Arben Sales', phone: '+355 67 222 2222', email: 'arben@wellness.al' },
};

const view = (overrides: Partial<OfferView> = {}): OfferView => ({
  id: 'o1',
  dealId: 'd1',
  clientId: 'c1',
  status: 'READY',
  number: 'OF-2026-0007',
  version: 1,
  reference: 'OF-2026-0007',
  previousVersionId: null,
  superseded: false,
  readyAt: '2026-10-04T22:30:00.000Z',
  sentAt: null,
  validUntil: null,
  respondedAt: null,
  statusNote: null,
  contactPersonId: null,
  companyName: 'Kafe Blloku',
  dealTitle: null,
  dealOwnerUserId: 'u1',
  dealOwnerName: 'Arben Sales',
  dealOpen: true,
  permittedActions: [],
  pendingApproval: null,
  language: 'sq',
  note: 'Pagesa çdo tremujor',
  createdByUserId: 'u1',
  createdByName: 'Arben Sales',
  createdAt: '2026-10-03T09:00:00.000Z',
  updatedAt: '2026-10-04T22:30:00.000Z',
  employeesPriced: 2,
  packageId: 'p1',
  frequencyId: 'f1',
  zoneId: 'z1',
  pricingInputs: {
    employees: 2,
    businessType: { id: 'b1', nameSq: 'Restorant', nameEn: 'Restaurant' },
    riskLevel: { id: 'r1', nameSq: 'I mesëm', nameEn: 'Medium', level: 2 },
    city: { id: 'city1', nameSq: 'Tiranë', nameEn: 'Tirana' },
    area: { id: 'a1', nameSq: 'Qendër', nameEn: 'Centre' },
    zone: { id: 'z1', nameSq: 'Tiranë qendër', nameEn: 'Tirana centre' },
    frequency: { id: 'f1', nameSq: 'Dy herë në vit', nameEn: 'Twice a year' },
    package: { id: 'p1', nameSq: 'Standard', nameEn: null },
    discountPercent: '0.00',
  },
  ruleSnapshot: { schemaVersion: 1, currency: 'EUR', offerValidityDays: 30, contractMonths: 12 },
  priceOnRequest: null,
  services: [
    { serviceId: 's1', nameSq: 'Vlerësimi i riskut', nameEn: 'Risk assessment', descriptionSq: 'Në vend', descriptionEn: 'On site' },
    { serviceId: 's2', nameSq: 'Trajnim', nameEn: null, descriptionSq: null, descriptionEn: null },
  ],
  baseFee: '38.00',
  riskFee: '3.80',
  visitFee: '7.60',
  locationFee: '0.00',
  listPrice: '49.40',
  discountPercent: '0.00',
  discountAmount: '0.00',
  netMonthlyPrice: '49.40',
  pricePerEmployee: '24.70',
  annualValue: '592.80',
  ...overrides,
});

describe('buildOfferDocument (M2 Slice 9)', () => {
  it('FR-OFR-02 the document holds every field the offer lists, in Albanian', () => {
    expect(buildOfferDocument(view(), details, 'sq', 'Europe/Tirane')).toEqual({
      language: 'sq',
      draft: false,
      reference: 'OF-2026-0007',
      // 22:30 UTC on the 4th is the 5th in Tirana.
      issuedOn: '2026-10-05',
      validUntil: null,
      validityDays: 30,
      currency: 'EUR',
      issuer: details.issuer,
      company: { name: 'Kafe Blloku', nipt: 'K98765432B', streetAddress: 'Rruga Pjetër Bogdani 5', area: 'Qendër', city: 'Tiranë' },
      contact: details.contact,
      inputs: {
        employees: 2,
        businessType: 'Restorant',
        riskLevel: 'I mesëm',
        zone: 'Tiranë qendër',
        frequency: 'Dy herë në vit',
        package: 'Standard',
      },
      services: [
        { name: 'Vlerësimi i riskut', description: 'Në vend' },
        { name: 'Trajnim', description: null },
      ],
      amounts: {
        baseFee: '38.00',
        riskFee: '3.80',
        visitFee: '7.60',
        locationFee: '0.00',
        listPrice: '49.40',
        discountPercent: '0.00',
        discountAmount: '0.00',
        netMonthlyPrice: '49.40',
        annualValue: '592.80',
      },
      contractMonths: 12,
      vatIncluded: false,
      note: 'Pagesa çdo tremujor',
      texts: { intro: details.texts.introSq, terms: details.texts.termsSq, closing: details.texts.closingSq },
      salesperson: details.salesperson,
    });
  });

  it('FR-OFR-06 NFR-I18N-02 in English it takes the English labels, falling back to Albanian where none is given', () => {
    const document = buildOfferDocument(view(), details, 'en', 'Europe/Tirane');
    expect(document.company).toMatchObject({ area: 'Centre', city: 'Tirana' });
    expect(document.inputs).toEqual({
      employees: 2,
      businessType: 'Restaurant',
      riskLevel: 'Medium',
      zone: 'Tirana centre',
      frequency: 'Twice a year',
      package: 'Standard',
    });
    expect(document.services).toEqual([
      { name: 'Risk assessment', description: 'On site' },
      { name: 'Trajnim', description: null },
    ]);
    expect(document.texts).toEqual({ intro: details.texts.introEn, terms: details.texts.termsSq, closing: details.texts.closingEn });
  });

  it('FR-OFR-09 a draft is watermarked and dated by its creation', () => {
    const document = buildOfferDocument(view({ status: 'DRAFT', readyAt: null }), details, 'sq', 'Europe/Tirane');
    expect(document).toMatchObject({ draft: true, issuedOn: '2026-10-03' });
  });

  it('FR-OFR-10 a sent offer shows its validity date', () => {
    const document = buildOfferDocument(view({ status: 'SENT', sentAt: '2026-10-05T12:00:00.000Z', validUntil: '2026-11-04' }), details, 'sq', 'Europe/Tirane');
    expect(document).toMatchObject({ draft: false, validUntil: '2026-11-04' });
  });

  it('FR-OFR-11 a later version is referenced with its version', () => {
    expect(buildOfferDocument(view({ version: 2, reference: 'OF-2026-0007 v2' }), details, 'sq', 'UTC').reference).toBe('OF-2026-0007 v2');
  });

  it('FR-PRC-07 a "Price on request" offer has no amounts', () => {
    const none = { baseFee: null, riskFee: null, visitFee: null, locationFee: null, listPrice: null, discountPercent: null, discountAmount: null, netMonthlyPrice: null, pricePerEmployee: null, annualValue: null };
    expect(buildOfferDocument(view({ ...none, status: 'DRAFT' }), details, 'sq', 'UTC').amounts).toBeNull();
  });
});
