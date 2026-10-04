import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { Offer, OfferContent } from './Offer';
import { OfferNotEditableError, OfferNotLatestError, OfferNotReadyError, OfferTransitionError } from './offerErrors';
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
  contactPersonId: null,
  manualPrice: null,
  ...overrides,
});

const draft = (overrides: Partial<OfferContent> = {}) =>
  Offer.draft({
    id: 'o1',
    tenantId: 't1',
    clientId: 'c1',
    dealId: 'd1',
    createdByUserId: 'u1',
    number: 'OF-2026-0001',
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

const CAP = Percent.of('10');
const SNAPSHOT = { company: { name: 'Kafe Blloku' } };

const ready = (overrides: Partial<OfferContent> = {}) => {
  const offer = draft(overrides);
  offer.markReady(new Date('2026-10-04T09:00:00Z'), CAP, SNAPSHOT);
  return offer;
};

const sent = () => {
  const offer = ready();
  offer.markSent('2026-10-05', 30, new Date());
  return offer;
};

describe('Offer document statuses (M2 Slice 9)', () => {
  it('FR-OFR-08 a new offer carries its number, as version 1', () => {
    expect(draft().toProps()).toMatchObject({ number: 'OF-2026-0001', version: 1, previousVersionId: null, supersededAt: null });
  });

  it('FR-OFR-09 a priced draft within the cap becomes Ready, with its render snapshot frozen', () => {
    const offer = ready();
    expect(offer.toProps()).toMatchObject({ status: QuotationStatus.Ready, readyAt: new Date('2026-10-04T09:00:00Z'), renderSnapshot: SNAPSHOT });
  });

  it('FR-OFR-09 a draft is not a final document and carries the watermark; Ready and later are final', () => {
    expect(draft().isFinalDocument).toBe(false);
    expect(ready().isFinalDocument).toBe(true);
    expect(sent().isFinalDocument).toBe(true);
  });

  it('FR-OFR-09 FR-PRC-07 a "Price on request" draft cannot become Ready', () => {
    expect(() => draft({ amounts: null }).markReady(new Date(), CAP, SNAPSHOT)).toThrow(OfferNotReadyError);
  });

  it('FR-OFR-09 FR-DSC-04 a discount above the cap cannot become Ready', () => {
    const above = content().amounts!;
    expect(() => draft({ amounts: { ...above, discountPercent: Percent.of('15') } }).markReady(new Date(), CAP, SNAPSHOT)).toThrow(OfferNotReadyError);
  });

  it('FR-DSC-08 an approval covering the list price and a discount at or below it makes the offer Ready', () => {
    const above = { ...content().amounts!, discountPercent: Percent.of('13') };
    const approved = { listPrice: Money.of('49.40'), approvedPercent: Percent.of('15') };
    const offer = draft({ amounts: above });
    offer.markReady(new Date(), CAP, SNAPSHOT, { discount: approved });
    expect(offer.status).toBe(QuotationStatus.Ready);
    // Raised above the approval, or on another list price: not covered.
    expect(() =>
      draft({ amounts: { ...above, discountPercent: Percent.of('16') } }).markReady(new Date(), CAP, SNAPSHOT, { discount: approved })
    ).toThrow(OfferNotReadyError);
    expect(() =>
      draft({ amounts: { ...above, listPrice: Money.of('60.00') } }).markReady(new Date(), CAP, SNAPSHOT, { discount: approved })
    ).toThrow(OfferNotReadyError);
  });

  it('FR-PRC-09 a manual price becomes Ready only once that price is approved', () => {
    const manual = draft({ manualPrice: { monthlyPrice: Money.of('49.40'), reason: 'By hand' } });
    expect(() => manual.markReady(new Date(), CAP, SNAPSHOT)).toThrow(OfferNotReadyError);
    manual.markReady(new Date(), CAP, SNAPSHOT, { manualPriceApproved: true });
    expect(manual.status).toBe(QuotationStatus.Ready);
  });

  it('FR-OFR-09 only a Ready offer is marked as sent, and only a sent one is accepted, rejected or expired', () => {
    expect(() => draft().markSent('2026-10-05', 30, new Date())).toThrow(OfferTransitionError);
    expect(() => ready().accept(new Date())).toThrow(OfferTransitionError);
    expect(() => ready().reject(new Date())).toThrow(OfferTransitionError);
    expect(() => ready().expire(new Date())).toThrow(OfferTransitionError);
    expect(() => ready().markReady(new Date(), CAP, SNAPSHOT)).toThrow(OfferTransitionError);
  });

  it('FR-OFR-10 marking as sent sets the sent date and the validity date = sent date + validity days', () => {
    const offer = sent();
    expect(offer.toProps()).toMatchObject({ status: QuotationStatus.Sent, validUntil: '2026-11-04' });
    // Noon UTC stays on the sent date in the workspace's time zone.
    expect(offer.toProps().sentAt).toEqual(new Date('2026-10-05T12:00:00Z'));
  });

  it('FR-PCF-08 the validity days are the offer\'s own: 15 days give a date 15 days after sending', () => {
    const offer = ready();
    offer.markSent('2026-12-20', 15, new Date());
    expect(offer.toProps().validUntil).toBe('2027-01-04');
  });

  it('FR-OFR-12 a sent offer is marked accepted, or rejected', () => {
    const accepted = sent();
    accepted.accept(new Date('2026-10-10T08:00:00Z'));
    expect(accepted.toProps()).toMatchObject({ status: QuotationStatus.Accepted, respondedAt: new Date('2026-10-10T08:00:00Z') });
    const rejected = sent();
    rejected.reject(new Date('2026-10-11T08:00:00Z'));
    expect(rejected.toProps()).toMatchObject({ status: QuotationStatus.Rejected, respondedAt: new Date('2026-10-11T08:00:00Z') });
  });

  it('FR-OFR-13 a sent offer expires', () => {
    const offer = sent();
    offer.expire(new Date());
    expect(offer.toProps().status).toBe(QuotationStatus.Expired);
  });

  it('FR-OFR-11 revising a sent offer gives version 2 as a draft, with the same number and content', () => {
    const v1 = sent();
    const v2 = v1.reviseInto('o2', 'u2', new Date('2026-10-12T08:00:00Z'));
    expect(v2.toProps()).toMatchObject({
      id: 'o2',
      number: 'OF-2026-0001',
      version: 2,
      previousVersionId: 'o1',
      status: QuotationStatus.Draft,
      createdByUserId: 'u2',
      dealId: 'd1',
      employeesPriced: 2,
      readyAt: null,
      sentAt: null,
      validUntil: null,
      renderSnapshot: null,
    });
    expect(v2.toProps().amounts?.netMonthlyPrice.toString()).toBe('49.40');
    expect(v1.toProps().supersededAt).toEqual(new Date('2026-10-12T08:00:00Z'));
    expect(v1.isSuperseded).toBe(true);
  });

  it('FR-OFR-11 version 1 is read-only after revising, and only the latest version can be accepted', () => {
    const v1 = sent();
    v1.reviseInto('o2', 'u1', new Date());
    expect(() => v1.accept(new Date())).toThrow(OfferNotLatestError);
    expect(() => v1.reject(new Date())).toThrow(OfferNotLatestError);
    expect(() => v1.reviseInto('o3', 'u1', new Date())).toThrow(OfferNotLatestError);
    expect(() => v1.expire(new Date())).toThrow(OfferNotLatestError);
    expect(() => v1.replaceDraft(content(), new Date())).toThrow(OfferNotEditableError);
  });

  it('FR-OFR-11 only a sent offer is revised', () => {
    expect(() => draft().reviseInto('o2', 'u1', new Date())).toThrow(OfferTransitionError);
    expect(() => ready().reviseInto('o2', 'u1', new Date())).toThrow(OfferTransitionError);
  });

  it('FR-OFR-04 changing a Ready offer from the pricing screen makes it a draft again, and unfreezes it', () => {
    const offer = ready();
    const previous = offer.replaceDraft(content({ employeesPriced: 3 }), new Date('2026-10-04T10:00:00Z'));
    expect(previous).toBe(QuotationStatus.Ready);
    expect(offer.toProps()).toMatchObject({ status: QuotationStatus.Draft, employeesPriced: 3, readyAt: null, renderSnapshot: null });
  });

  it('FR-OFR-11 a sent offer is changed only through a new version', () => {
    expect(() => sent().replaceDraft(content(), new Date())).toThrow(OfferNotEditableError);
  });
});
