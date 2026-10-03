// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (data: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse/lib/pdf-parse.js');
import { OfferDocument } from '../../application/offers/document/OfferDocument';
import { OfferPdfRenderer } from './OfferPdfRenderer';
import { OFFER_PDF_LABELS } from './offerPdfLabels';

const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const text = (value: string, marks: object[] = []) => ({ type: 'text', text: value, marks });

const document = (overrides: Partial<OfferDocument> = {}): OfferDocument => ({
  language: 'sq',
  draft: false,
  reference: 'OF-2026-0007',
  issuedOn: '2026-10-05',
  validUntil: null,
  validityDays: 30,
  currency: 'EUR',
  issuer: {
    companyName: 'Wellness Albania',
    nipt: 'L12345678A',
    address: 'Rruga e Kavajës, Tiranë',
    phone: '+355 69 000 0000',
    email: 'info@wellness.al',
    website: 'wellness.al',
    bankDetails: 'IBAN AL00 0000 0000',
  },
  company: { name: 'Kafe Blloku', nipt: 'K98765432B', streetAddress: 'Rruga Pjetër Bogdani 5', area: 'Qendër', city: 'Tiranë' },
  contact: { name: 'Elira Hoxha', position: 'Administratore', phone: '+355 68 111 1111', email: 'elira@blloku.al' },
  inputs: { employees: 2, businessType: 'Restorant', riskLevel: 'I mesëm', zone: 'Tiranë qendër', frequency: 'Dy herë në vit', package: 'Standard' },
  services: [{ name: 'Vlerësimi i riskut', description: 'Në vend' }],
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
  texts: {
    intro: { type: 'doc', content: [paragraph(text('Faleminderit për '), text('interesin', [{ type: 'bold' }]), text(' tuaj.'))] },
    terms: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Kushtet')] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('Kontratë 12 mujore'))] }] },
        { type: 'unknownBlock', content: [text('SHOULD NOT APPEAR')] },
        paragraph(text('Shih '), text('faqen tonë', [{ type: 'link', attrs: { href: 'https://wellness.al' } }])),
      ],
    },
    closing: null,
  },
  salesperson: { name: 'Arben Sales', phone: '+355 67 222 2222', email: 'arben@wellness.al' },
  ...overrides,
});

const textOf = async (doc: OfferDocument) => (await pdfParse(await new OfferPdfRenderer().render(doc))).text;

describe('OfferPdfRenderer (M2 Slice 9)', () => {
  it('NFR-I18N-02 the Albanian and English label catalogues have the same keys', () => {
    expect(Object.keys(OFFER_PDF_LABELS.en).sort()).toEqual(Object.keys(OFFER_PDF_LABELS.sq).sort());
  });

  it('FR-OFR-02 the PDF prints the offer, with ë and ç, in Albanian', async () => {
    const output = await textOf(document());
    for (const expected of [
      'Ofertë OF-2026-0007',
      '05.10.2026',
      'Wellness Albania',
      'Kafe Blloku',
      'K98765432B',
      'Rruga Pjetër Bogdani 5, Qendër, Tiranë',
      'Elira Hoxha, Administratore',
      'Restorant',
      'I mesëm',
      'Dy herë në vit',
      'Vlerësimi i riskut',
      '49,40',
      '592,80',
      'Çmimet nuk përfshijnë TVSH-në.',
      'Pagesa çdo tremujor',
      'Faleminderit për interesin tuaj.',
      'Kontratë 12 mujore',
      'Arben Sales',
      'IBAN AL00 0000 0000',
    ]) {
      expect(output).toContain(expected);
    }
    expect(output).not.toContain('SHOULD NOT APPEAR');
    expect(output).not.toContain('DRAFT');
  });

  it('FR-OFR-06 NFR-I18N-02 the same offer in English', async () => {
    const output = await textOf(document({ language: 'en' }));
    expect(output).toContain('Offer OF-2026-0007');
    expect(output).toContain('Net monthly price');
    expect(output).toContain('€49.40');
    expect(output).toContain('Prices do not include VAT.');
  });

  it('FR-OFR-09 a draft carries the DRAFT watermark', async () => {
    expect(await textOf(document({ draft: true }))).toContain('DRAFT');
  });

  it('FR-PRC-07 a "Price on request" offer prints no amounts', async () => {
    const output = await textOf(document({ amounts: null }));
    expect(output).toContain('Çmimi sipas kërkesës');
    expect(output).not.toContain('49,40');
  });

  it('NFR-PERF-02 an offer PDF is generated in under 3 seconds', async () => {
    const started = Date.now();
    await new OfferPdfRenderer().render(document());
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
