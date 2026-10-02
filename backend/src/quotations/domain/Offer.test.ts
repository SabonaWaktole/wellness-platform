import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { Offer, OfferContent } from './Offer';
import { OfferNotEditableError } from './offerErrors';
import { QuotationStatus } from './Quotation';

const content = (overrides: Partial<OfferContent> = {}): OfferContent => ({
  employeesPriced: 2,
  packageId: 'pkg-standard',
  frequencyId: 'freq-2',
  zoneId: 'zone-centre',
  pricingInputs: { employees: 2 },
  ruleSnapshot: { schemaVersion: 1 },
  amounts: {
    baseFee: Money.of('38.00'),
    riskFee: Money.of('3.80'),
    visitFee: Money.of('7.60'),
    locationFee: Money.of('0.00'),
    listPrice: Money.of('49.40'),
    discountPercent: Percent.zero(),
    discountAmount: Money.zero(),
    netMonthlyPrice: Money.of('49.40'),
    pricePerEmployee: Money.of('24.70'),
    annualValue: Money.of('592.80'),
  },
  services: [{ serviceId: 's1', nameSq: 'Vlerësimi i riskut', nameEn: 'Risk assessment', descriptionSq: null, descriptionEn: null }],
  note: null,
  ...overrides,
});

const draft = (overrides: Partial<OfferContent> = {}) =>
  Offer.draft({
    id: 'o1',
    tenantId: 't1',
    clientId: 'c1',
    dealId: 'd1',
    createdByUserId: 'u1',
    language: 'sq',
    content: content(overrides),
    now: new Date('2026-10-03T09:00:00Z'),
  });

describe('Offer (M2 Slice 8)', () => {
  it('FR-OFR-01 a new offer is a draft of its deal and company', () => {
    const offer = draft();
    expect(offer.toProps()).toMatchObject({ dealId: 'd1', clientId: 'c1', status: QuotationStatus.Draft, language: 'sq' });
  });

  it('FR-OFR-03 the note is trimmed, and a blank note is no note', () => {
    expect(draft({ note: '  Pagesa çdo tremujor  ' }).toProps().note).toBe('Pagesa çdo tremujor');
    expect(draft({ note: '   ' }).toProps().note).toBeNull();
  });

  it('FR-PRC-12 saving again replaces the draft\'s content and keeps its identity', () => {
    const offer = draft();
    const later = new Date('2026-10-03T10:00:00Z');
    offer.replaceDraft(content({ employeesPriced: 3, note: 'Ndryshuar' }), later);
    expect(offer.toProps()).toMatchObject({ id: 'o1', employeesPriced: 3, note: 'Ndryshuar', updatedAt: later });
  });

  it('FR-OFR-04 only a draft can be changed', () => {
    const sent = Offer.rebuild({ ...draft().toProps(), status: QuotationStatus.Sent });
    expect(() => sent.replaceDraft(content(), new Date())).toThrow(OfferNotEditableError);
  });

  it('FR-PRC-07 a "Price on request" draft has no amounts', () => {
    expect(draft({ amounts: null }).toProps().amounts).toBeNull();
  });
});
