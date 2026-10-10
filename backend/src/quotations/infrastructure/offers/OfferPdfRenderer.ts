import * as path from 'path';
import PDFDocument from 'pdfkit';
import { RichTextDoc, RichTextNode } from '../../../shared/domain/richText';
import { OfferDocument } from '../../application/offers/document/OfferDocument';
import { IOfferPdfRenderer } from '../../application/offers/ports/IOfferPdfRenderer';
import { label, OfferPdfLabel } from './offerPdfLabels';

/** backend/assets, from src/… under ts-node and from dist/… once built: the same depth. */
const ASSETS = path.resolve(__dirname, '../../../../assets');
const FONTS = {
  regular: path.join(ASSETS, 'fonts/NotoSans-Regular.ttf'),
  bold: path.join(ASSETS, 'fonts/NotoSans-Bold.ttf'),
  italic: path.join(ASSETS, 'fonts/NotoSans-Italic.ttf'),
};
const LOGO = path.join(ASSETS, 'brand/wellness-plus-logo.png');

const COLOR_NAVY = '#102a43';
const COLOR_BLUE = '#0070ba';
const COLOR_LIGHT_BLUE = '#0284c7';
const COLOR_BG_TINT = '#f0f7fc';
const COLOR_CARD_BG = '#f8fafc';
const COLOR_BORDER = '#d9e2ec';
const COLOR_TEXT = '#1e293b';
const COLOR_MUTED = '#627d98';
const COLOR_GREEN = '#10b981';

/**
 * Renders an official two-page Commercial Proposal / Occupational Health Service
 * document based on the MedWork client specification (MedWork_Front_Back_Both_Sides.pdf).
 * Page 1: Proposal Information, Proposed Solution, Employee Benefits (Wellness+ Silver),
 *         Commercial Offer, and Commercial Conditions.
 * Page 2: Occupational Health Service overview with 6 feature cards and value badges.
 */
export class OfferPdfRenderer implements IOfferPdfRenderer {
  async render(document: OfferDocument): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 25, bottom: 25, left: 36, right: 36 },
      bufferPages: true,
      info: {
        Title: `${label(document.language, 'commercialProposal')} ${document.reference}`,
        Author: document.issuer.companyName ?? 'Wellness Albania',
        CreationDate: new Date(`${document.issuedOn}T00:00:00.000Z`),
        ModDate: new Date(`${document.issuedOn}T00:00:00.000Z`),
      },
    });

    doc.registerFont('regular', FONTS.regular);
    doc.registerFont('bold', FONTS.bold);
    doc.registerFont('italic', FONTS.italic);

    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const drawing = new OfferPdfDrawing(doc, document);
    drawing.draw();
    doc.end();

    return finished;
  }
}

class OfferPdfDrawing {
  private readonly left = 36;
  private readonly width = 523.28;
  private readonly right = 36 + 523.28;

  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly offer: OfferDocument
  ) {}

  draw(): void {
    this.drawPage1();
    this.doc.addPage();
    this.drawPage2();
    this.drawWatermarkAndPaging();
  }

  // =========================================================================
  // PAGE 1
  // =========================================================================

  private drawPage1(): void {
    const { doc } = this;
    let y = 26;

    // --- Header ---
    y = this.drawBrandHeader(y);

    // --- Proposal Title ---
    doc.font('bold').fontSize(18).fillColor(COLOR_NAVY).text(this.t('commercialProposal'), this.left, y);
    y += 21;
    doc.font('bold').fontSize(11).fillColor(COLOR_BLUE).text(this.t('proposalSubtitle'), this.left, y);
    y += 14;
    doc.font('regular').fontSize(8.5).fillColor(COLOR_MUTED).text(this.t('proposalTagline'), this.left, y);
    y += 16;

    // --- Section 1: Proposal Information ---
    y = this.drawSection1(y);

    // --- Section 2: Our Proposed Solution ---
    y = this.drawSection2(y);

    // --- Section 3: Employee Benefits - Wellness+ Silver ---
    y = this.drawSection3(y);

    // --- Section 4 & 5: Commercial Offer & Commercial Conditions ---
    this.drawSections4And5(y);

    // --- Page 1 Footer ---
    this.drawFooter();
  }

  private drawSection1(startY: number): number {
    const { doc, offer } = this;
    const badgeY = startY;
    this.drawSectionBadge(1, this.t('proposalInfo'), this.left, badgeY);

    const boxY = badgeY + 18;
    const boxHeight = 78;
    this.drawRoundedBox(this.left, boxY, this.width, boxHeight, COLOR_BG_TINT, COLOR_BORDER);

    const col1X = this.left + 10;
    const col2X = this.left + 265;
    let lineY = boxY + 7;

    const rowH = 11;
    // Col 1 items
    this.drawLabeledValue(
      col1X,
      lineY,
      105,
      this.t('proposalNo'),
      `${this.t('title')} ${offer.reference}`
    );
    this.drawLabeledValue(
      col2X,
      lineY,
      115,
      this.t('employees'),
      String(offer.inputs.employees ?? offer.company.name ? (offer.inputs.employees ?? '—') : '—')
    );
    lineY += rowH;

    const validityStr = offer.validUntil
      ? this.date(offer.validUntil)
      : offer.validityDays !== null
        ? `${offer.validityDays} ${offer.language === 'sq' ? 'ditë' : 'days'}`
        : '30 days';

    this.drawLabeledValue(col1X, lineY, 105, this.t('date'), this.date(offer.issuedOn));
    const busTypeStr = [offer.inputs.businessType, offer.inputs.riskLevel].filter(Boolean).join(' · ');
    if (busTypeStr) {
      this.drawLabeledValue(col2X, lineY, 115, this.t('businessType'), busTypeStr);
    } else {
      this.drawLabeledValue(col2X, lineY, 115, this.t('workLocations'), [offer.company.city, offer.company.area].filter(Boolean).join(', ') || '—');
    }
    lineY += rowH;

    this.drawLabeledValue(col1X, lineY, 105, this.t('validUntil'), validityStr);
    const locationStr = [offer.company.streetAddress, offer.company.area, offer.company.city].filter(Boolean).join(', ') || '—';
    this.drawLabeledValue(col2X, lineY, 115, this.t('workLocations'), locationStr);
    lineY += rowH;

    this.drawLabeledValue(col1X, lineY, 105, this.t('preparedFor'), offer.company.name);
    this.drawLabeledValue(col2X, lineY, 115, this.t('preparedBy'), offer.salesperson.name);
    lineY += rowH;

    this.drawLabeledValue(col1X, lineY, 105, this.t('nipt'), offer.company.nipt ?? '—');
    const agentContact = [offer.salesperson.phone, offer.salesperson.email].filter(Boolean).join('  ·  ');
    if (agentContact) {
      this.drawLabeledValue(col2X, lineY, 115, this.t('contact'), agentContact);
    }
    lineY += rowH;

    const contactStr = offer.contact ? [offer.contact.name, offer.contact.position].filter(Boolean).join(', ') : '—';
    this.drawLabeledValue(col1X, lineY, 105, this.t('contact'), contactStr);

    return boxY + boxHeight + 10;
  }

  private drawSection2(startY: number): number {
    const { doc, offer } = this;
    this.drawSectionBadge(2, this.t('proposedSolution'), this.left, startY);

    const boxY = startY + 18;
    const boxHeight = 84;
    this.drawRoundedBox(this.left, boxY, this.width, boxHeight, COLOR_CARD_BG, COLOR_BORDER);

    // Left block: solution name & tagline
    const leftW = 175;
    doc.font('bold').fontSize(10.5).fillColor(COLOR_NAVY).text(this.t('solutionTitle'), this.left + 10, boxY + 10, { width: leftW });
    doc.font('regular').fontSize(8).fillColor(COLOR_MUTED).text(this.t('solutionSubtitle'), this.left + 10, boxY + 36, { width: leftW });

    // Optional intro rich text snippet
    const introPlainText = this.extractPlainText(offer.texts.intro);
    if (introPlainText) {
      doc.font('italic').fontSize(7.5).fillColor(COLOR_NAVY).text(introPlainText, this.left + 10, boxY + 64, { width: leftW, height: 16 });
    }

    // Right block: 9 items in 2 columns
    const checklist: string[] =
      offer.language === 'sq'
        ? [
            'Mjek i Punës',
            'Ekzaminime mjekësore (para-punësimit, periodike)',
            'Vizita mjekësore në vendin e punës',
            'Analiza laboratorike',
            'Mbikëqyrje mjekësore sipas riskut',
            'Certifikata shëndetësore dhe dokumentacion',
            'Përfitime Wellness+ Silver për punonjësit',
            'Kartë Wellness',
            'Qasje në rrjetin mjekësor të Wellness Albania',
          ]
        : [
            'Occupational Doctor',
            'Medical examinations (pre-employment, periodic)',
            'Workplace medical visits',
            'Laboratory tests',
            'Risk-related medical surveillance',
            'Health certificates and documentation',
            'Wellness+ Silver benefits for eligible employees',
            'Wellness Card',
            'Access to Wellness Albania\'s medical network',
          ];

    // If services has customized service names, include them
    if (offer.services.length > 0) {
      checklist[0] = offer.services[0].name;
    }

    const colW = 160;
    const col1X = this.left + leftW + 15;
    const col2X = col1X + colW + 5;
    const rowH = 14;

    for (let i = 0; i < checklist.length; i++) {
      const col = i < 5 ? 0 : 1;
      const row = i < 5 ? i : i - 5;
      const x = col === 0 ? col1X : col2X;
      const y = boxY + 8 + row * rowH;

      this.drawCheckIcon(x, y + 1);
      doc.font('regular').fontSize(8).fillColor(COLOR_TEXT).text(checklist[i], x + 12, y, { width: colW - 12 });
    }

    return boxY + boxHeight + 10;
  }

  private drawSection3(startY: number): number {
    const { doc, offer } = this;
    this.drawSectionBadge(3, this.t('employeeBenefitsTitle'), this.left, startY);

    let y = startY + 18;
    // Introductory text
    doc.font('regular').fontSize(7.5).fillColor(COLOR_MUTED).text(this.t('employeeBenefitsIntro'), this.left, y, { width: this.width });
    y += 18;

    // Benefits table
    const tableX = this.left;
    const tableW = this.width;
    const colServiceW = tableW * 0.62;
    const colBenefitW = tableW * 0.38;

    // Header row
    doc.rect(tableX, y, tableW, 14).fill(COLOR_NAVY);
    doc.font('bold').fontSize(8).fillColor('#ffffff');
    doc.text(this.t('serviceHeader'), tableX + 8, y + 3, { width: colServiceW - 16 });
    doc.text(this.t('benefitHeader'), tableX + colServiceW + 8, y + 3, { width: colBenefitW - 16, align: 'right' });
    y += 14;

    const benefits =
      offer.language === 'sq'
        ? [
            { service: 'Konsultë Internisti', benefit: '100% FALAS' },
            { service: 'Shërbime Laboratori', benefit: 'Deri në 25% përfitim' },
            { service: 'Shërbime Radiologjie', benefit: 'Deri në 50% përfitim' },
            { service: 'Konsulta Specialisti', benefit: 'Çmime preferenciale' },
            { service: 'Fizioterapi', benefit: 'Deri në 20% përfitim' },
            { service: 'Shërbime Estetike', benefit: '10 - 30% përfitim' },
            { service: 'Kartë Wellness', benefit: 'E përfshirë' },
            { service: 'Përfitime Shëndetësore të Punonjësve', benefit: 'Të përfshira' },
          ]
        : [
            { service: 'Internist Consultation', benefit: '100% FREE' },
            { service: 'Laboratory Services', benefit: 'Up to 25% benefit' },
            { service: 'Radiology Services', benefit: 'Up to 50% benefit' },
            { service: 'Specialist Consultations', benefit: 'Preferential rates' },
            { service: 'Physiotherapy', benefit: 'Up to 20% benefit' },
            { service: 'Esthetic Services', benefit: '10 - 30% benefit' },
            { service: 'Wellness Card', benefit: 'Included' },
            { service: 'Employee Healthcare Benefits', benefit: 'Included' },
          ];

    const rowH = 12;
    for (let i = 0; i < benefits.length; i++) {
      const rowY = y + i * rowH;
      if (i % 2 === 1) {
        doc.rect(tableX, rowY, tableW, rowH).fill(COLOR_BG_TINT);
      }
      doc.font('regular').fontSize(7.5).fillColor(COLOR_TEXT).text(benefits[i].service, tableX + 8, rowY + 2.5);
      doc
        .font('bold')
        .fontSize(7.5)
        .fillColor(COLOR_BLUE)
        .text(benefits[i].benefit, tableX + colServiceW, rowY + 2.5, { width: colBenefitW - 8, align: 'right' });
    }

    doc.rect(tableX, y, tableW, benefits.length * rowH).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

    return y + benefits.length * rowH + 10;
  }

  private drawSections4And5(startY: number): void {
    const { doc, offer } = this;
    const gap = 12;
    const sec4W = 295;
    const sec5W = this.width - sec4W - gap;
    const sec5X = this.left + sec4W + gap;

    // --- Section 4: Commercial Offer ---
    this.drawSectionBadge(4, this.t('commercialOfferTitle'), this.left, startY);
    let y4 = startY + 18;

    // Table header
    const colDescW = 125;
    const colQtyW = 55;
    const colUnitW = 50;
    const colTotW = 65;

    doc.rect(this.left, y4, sec4W, 14).fill(COLOR_NAVY);
    doc.font('bold').fontSize(7.5).fillColor('#ffffff');
    doc.text(this.t('descriptionHeader'), this.left + 5, y4 + 3, { width: colDescW });
    doc.text(this.t('quantityHeader'), this.left + colDescW, y4 + 3, { width: colQtyW, align: 'center' });
    doc.text(this.t('unitPriceHeader'), this.left + colDescW + colQtyW, y4 + 3, { width: colUnitW, align: 'right' });
    doc.text(this.t('totalHeader'), this.left + colDescW + colQtyW + colUnitW, y4 + 3, { width: colTotW - 5, align: 'right' });
    y4 += 14;

    const employees = offer.inputs.employees ?? 1;
    const amounts = offer.amounts;

    if (!amounts) {
      // Price on request
      doc.rect(this.left, y4, sec4W, 60).fillAndStroke(COLOR_BG_TINT, COLOR_BORDER);
      doc.font('bold').fontSize(9).fillColor(COLOR_NAVY).text(this.t('priceOnRequest'), this.left + 10, y4 + 18, { width: sec4W - 20 });
      doc.font('regular').fontSize(8).fillColor(COLOR_MUTED).text(this.t('vatNote'), this.left + 10, y4 + 34, { width: sec4W - 20 });
    } else if (amounts.manual) {
      // Manual price
      const rowH = 14;
      doc.rect(this.left, y4, sec4W, rowH).fill(COLOR_CARD_BG);
      doc.font('bold').fontSize(7.5).fillColor(COLOR_TEXT).text(this.t('occHealthServices'), this.left + 5, y4 + 3);
      doc.text(this.money(amounts.netMonthlyPrice), this.left + sec4W - 70, y4 + 3, { width: 65, align: 'right' });
      y4 += rowH;

      doc.rect(this.left, y4, sec4W, rowH).fill(COLOR_NAVY);
      doc.font('bold').fontSize(8).fillColor('#ffffff');
      doc.text(this.t('total'), this.left + 5, y4 + 3);
      doc.text(this.money(amounts.netMonthlyPrice), this.left + sec4W - 70, y4 + 3, { width: 65, align: 'right' });
      y4 += rowH + 4;
      doc.font('regular').fontSize(7.5).fillColor(COLOR_MUTED).text(this.t('annualValue', { months: offer.contractMonths ?? 12 }) + `: ${this.money(amounts.annualValue)}`, this.left, y4);
    } else {
      // Standard calculated breakdown rows
      const unitBase = (Number(amounts.baseFee) / Math.max(employees, 1)).toFixed(2);
      const rows = [
        {
          desc: this.t('occHealthServices'),
          qty: `${employees} ${offer.language === 'sq' ? 'punonjës' : 'employees'}`,
          unit: this.money(unitBase),
          tot: this.money(amounts.baseFee),
        },
        {
          desc: this.t('medExamPackage'),
          qty: String(employees),
          unit: (Number(amounts.riskFee) / Math.max(employees, 1)).toFixed(2) !== '0.00' ? this.money((Number(amounts.riskFee) / Math.max(employees, 1)).toFixed(2)) : '—',
          tot: this.money(amounts.riskFee),
        },
        {
          desc: this.t('occDoctorVisits'),
          qty: offer.inputs.frequency ?? '1',
          unit: this.money(amounts.visitFee),
          tot: this.money(amounts.visitFee),
        },
        {
          desc: this.t('silverBenefitsRow'),
          qty: `${employees} ${offer.language === 'sq' ? 'punonjës' : 'employees'}`,
          unit: this.t('included'),
          tot: this.t('included'),
        },
      ];

      if (Number(amounts.locationFee) > 0) {
        rows.push({
          desc: this.t('additionalServices'),
          qty: '1',
          unit: this.money(amounts.locationFee),
          tot: this.money(amounts.locationFee),
        });
      }

      const rowH = 13;
      for (let i = 0; i < rows.length; i++) {
        const rY = y4 + i * rowH;
        if (i % 2 === 1) doc.rect(this.left, rY, sec4W, rowH).fill(COLOR_CARD_BG);
        doc.font('regular').fontSize(7).fillColor(COLOR_TEXT);
        doc.text(rows[i].desc, this.left + 5, rY + 3, { width: colDescW });
        doc.text(rows[i].qty, this.left + colDescW, rY + 3, { width: colQtyW, align: 'center' });
        doc.text(rows[i].unit, this.left + colDescW + colQtyW, rY + 3, { width: colUnitW, align: 'right' });
        doc.text(rows[i].tot, this.left + colDescW + colQtyW + colUnitW, rY + 3, { width: colTotW - 5, align: 'right' });
      }
      y4 += rows.length * rowH;

      // Discount row if applicable
      if (Number(amounts.discountPercent) !== 0) {
        doc.rect(this.left, y4, sec4W, rowH).fill(COLOR_BG_TINT);
        doc.font('bold').fontSize(7).fillColor(COLOR_BLUE);
        doc.text(this.t('discount', { percent: this.percent(amounts.discountPercent) }), this.left + 5, y4 + 3);
        doc.text(`− ${this.money(amounts.discountAmount)}`, this.left + colDescW + colQtyW + colUnitW, y4 + 3, { width: colTotW - 5, align: 'right' });
        y4 += rowH;
      }

      // Total row
      doc.rect(this.left, y4, sec4W, 14).fill(COLOR_NAVY);
      doc.font('bold').fontSize(7.5).fillColor('#ffffff');
      doc.text(`${this.t('total')} (${this.t('netMonthlyPrice')})`, this.left + 5, y4 + 3);
      doc.text(this.money(amounts.netMonthlyPrice), this.left + sec4W - 70, y4 + 3, { width: 65, align: 'right' });
      y4 += 16;

      doc.font('regular').fontSize(7).fillColor(COLOR_MUTED);
      doc.text(`${this.t('annualValue', { months: offer.contractMonths ?? 12 })}: ${this.money(amounts.annualValue)}`, this.left, y4);
    }

    // --- Section 5: Commercial Conditions ---
    this.drawSectionBadge(5, this.t('commercialConditionsTitle'), sec5X, startY);
    const boxY5 = startY + 18;
    const boxH5 = 135;
    this.drawRoundedBox(sec5X, boxY5, sec5W, boxH5, COLOR_BG_TINT, COLOR_BORDER);

    let lineY5 = boxY5 + 6;
    const condRowH = 11;
    const labelW5 = 80;

    const months = offer.contractMonths ?? 12;
    this.drawLabeledValue(sec5X + 8, lineY5, labelW5, this.t('agreementDuration'), `${months} ${offer.language === 'sq' ? 'muaj' : 'months'}`);
    lineY5 += condRowH;

    this.drawLabeledValue(sec5X + 8, lineY5, labelW5, this.t('startDate'), this.date(offer.issuedOn));
    lineY5 += condRowH;

    const expiryDate = this.computeExpiryDate(offer.issuedOn, months);
    this.drawLabeledValue(sec5X + 8, lineY5, labelW5, this.t('expiryDate'), expiryDate);
    lineY5 += condRowH;

    this.drawLabeledValue(sec5X + 8, lineY5, labelW5, this.t('proposalValidity'), `${offer.validityDays ?? 30} ${offer.language === 'sq' ? 'ditë' : 'days'}`);
    lineY5 += condRowH;

    const paymentTermsStr = offer.note ? offer.note : offer.language === 'sq' ? 'Mujore / Tremujore' : 'Monthly / Quarterly';
    this.drawLabeledValue(sec5X + 8, lineY5, labelW5, this.t('paymentTerms'), paymentTermsStr);
    lineY5 += condRowH;

    this.drawLabeledValue(sec5X + 8, lineY5, labelW5, this.t('vat'), this.t('asApplicable'));
    lineY5 += condRowH;

    doc.font('regular').fontSize(6.8).fillColor(COLOR_MUTED).text(this.t('vatNote'), sec5X + 8, lineY5, { width: sec5W - 16, lineBreak: false });
    lineY5 += condRowH + 2;

    // Agreement clause text
    const clause = this.t('contractClause', { company: offer.company.name });
    doc.font('regular').fontSize(6.8).fillColor(COLOR_MUTED).text(clause, sec5X + 8, lineY5, { width: sec5W - 16, lineGap: 1 });

    // Terms rich text snippet if present
    const termsPlainText = this.extractPlainText(offer.texts.terms);
    if (termsPlainText && !clause.includes(termsPlainText)) {
      doc.moveDown(0.2);
      doc.font('italic').fontSize(6.5).fillColor(COLOR_NAVY).text(termsPlainText, sec5X + 8, doc.y, { width: sec5W - 16 });
    }

    if (offer.issuer.bankDetails) {
      doc.font('bold').fontSize(6.5).fillColor(COLOR_MUTED).text(`${this.t('bankDetails')}: ${offer.issuer.bankDetails}`, sec5X + 8, boxY5 + boxH5 - 12, { width: sec5W - 16 });
    }
  }

  // =========================================================================
  // PAGE 2
  // =========================================================================

  private drawPage2(): void {
    const { doc } = this;
    let y = 26;

    // --- Header ---
    y = this.drawBrandHeader(y);

    // --- Page 2 Title ---
    doc.font('bold').fontSize(18).fillColor(COLOR_NAVY).text(this.t('p2Title'), this.left, y);
    y += 21;
    doc.font('bold').fontSize(11).fillColor(COLOR_BLUE).text(this.t('p2Subtitle'), this.left, y);
    y += 14;
    doc.font('regular').fontSize(8.5).fillColor(COLOR_MUTED).text(this.t('p2Tagline'), this.left, y);
    y += 16;

    // --- Highlight Banner: One Partner ---
    const bannerH = 46;
    this.drawRoundedBox(this.left, y, this.width, bannerH, COLOR_BG_TINT, COLOR_BLUE);

    doc.font('bold').fontSize(10).fillColor(COLOR_NAVY).text(this.t('p2PartnerTitle'), this.left + 14, y + 8, { width: this.width - 28 });
    doc.font('regular').fontSize(8).fillColor(COLOR_TEXT).text(this.t('p2PartnerText'), this.left + 14, y + 22, { width: this.width - 28, lineGap: 1 });
    y += bannerH + 12;

    // --- 6 Feature Cards (2 cols x 3 rows) ---
    const cards = [
      {
        num: 1,
        title: this.t('card1Title'),
        items:
          this.offer.language === 'sq'
            ? [
                'Vizita dhe konsulta mjekësore FALAS në Klinikën Wellness, 08:00–20:00',
                'Ekzaminime mjekësore para-punësimit dhe periodike',
                'Vlerësime të aftësisë dhe përshtatshmërisë shëndetësore për punë',
                'Mbështetje me ofruesit e kujdesit shëndetësor dhe çështjet e sigurimeve',
              ]
            : [
                'FREE medical examinations and consultations at Wellness Clinic, 08:00–20:00',
                'Pre-employment and periodic occupational health examinations',
                'Job-related health and fitness assessments',
                'Support with healthcare providers and insurance-related matters',
              ],
      },
      {
        num: 2,
        title: this.t('card2Title'),
        items:
          this.offer.language === 'sq'
            ? [
                'Monitorim shëndetësor bazuar në ekspozimin ndaj rreziqeve në vendin e punës',
                'Krijimi dhe menaxhimi i kartelave mjekësore të punonjësve',
                'Monitorimi i sëmundjeve profesionale dhe rreziqeve shëndetësore',
                'Vlerësimi i rikthimit në punë dhe aftësisë për punë',
              ]
            : [
                'Health monitoring based on workplace risk exposure',
                'Creation and management of employee medical records',
                'Monitoring of occupational diseases and work-related health risks',
                'Return-to-work and fitness-for-work assessments',
              ],
      },
      {
        num: 3,
        title: this.t('card3Title'),
        items:
          this.offer.language === 'sq'
            ? [
                'Mbështetje me dokumentacionin e shtatzënisë dhe lindjes',
                'Verifikimi i dokumentacionit mjekësor dhe të lejes së lindjes',
                'Koordinim me HR mbi datat e lejes dhe kërkesat e rikthimit në punë',
                'Dorëzimi i dokumentacionit mjekësor pranë institucioneve përkatëse',
              ]
            : [
                'Pregnancy and maternity documentation support',
                'Verification of maternity and medical documentation',
                'Coordination with HR on leave dates and return-to-work requirements',
                'Submission of required medical documentation to relevant institutions',
              ],
      },
      {
        num: 4,
        title: this.t('card4Title'),
        items:
          this.offer.language === 'sq'
            ? [
                'Inspektim vjetor i shëndetit dhe sigurisë në punë',
                'Vlerësimi i riskut në punë dhe planifikimi i parandalimit',
                'Plan veprimi vjetor me rekomandime praktike',
                'Profilizimi i rrezikut shëndetësor për pozicione specifike të punës',
              ]
            : [
                'Annual workplace health and safety inspection',
                'Occupational risk assessment and prevention planning',
                'Annual action plan with practical recommendations',
                'Health-risk profiling for specific job positions',
              ],
      },
      {
        num: 5,
        title: this.t('card5Title'),
        items:
          this.offer.language === 'sq'
            ? [
                'Menaxhimi dhe raportimi i aksidenteve në punë dhe sëmundjeve profesionale',
                'Përgatitja e dokumentacionit për autoritetet kompetente',
                'Mbështetje në rastet e paaftësisë së përkohshme për punë',
                'Rekomandime korrigjuese dhe parandaluese për kompaninë',
              ]
            : [
                'Management and reporting of workplace accidents and occupational diseases',
                'Preparation of documentation for competent authorities',
                'Support in temporary work-incapacity cases',
                'Corrective and preventive recommendations for the company',
              ],
      },
      {
        num: 6,
        title: this.t('card6Title'),
        items:
          this.offer.language === 'sq'
            ? [
                'Menaxhimi i detyrimeve të shëndetit në punë sipas legjislacionit shqiptar',
                'Raportim mujor, gjashtëmujor dhe vjetor',
                'Njoftimet e kërkuara dhe komunikimi me autoritetet shtetërore',
                'Mbështetje për HR, menaxhimin dhe Këshillin e Sigurisë dhe Shëndetit',
              ]
            : [
                'Management of occupational-health obligations under Albanian legislation',
                'Monthly, six-monthly and annual reporting',
                'Required notifications and communication with state authorities',
                'Support to HR, management and the Occupational Health & Safety Council',
              ],
      },
    ];

    const cardGap = 12;
    const cardW = (this.width - cardGap) / 2;
    const cardH = 110;

    for (let i = 0; i < cards.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cX = this.left + col * (cardW + cardGap);
      const cY = y + row * (cardH + 10);

      this.drawFeatureCard(cX, cY, cardW, cardH, cards[i].num, cards[i].title, cards[i].items);
    }

    y += 3 * (cardH + 10) + 6;

    // --- Value Proposition Strip ---
    doc.font('bold').fontSize(9).fillColor(COLOR_NAVY).text(
      this.offer.language === 'sq' ? 'VLERA PËR KOMPANINË TUAJ' : 'THE VALUE FOR YOUR COMPANY',
      this.left,
      y
    );
    y += 14;

    const values = [this.t('val1'), this.t('val2'), this.t('val3'), this.t('val4'), this.t('val5')];
    const valGap = 6;
    const valW = (this.width - valGap * 4) / 5;
    const valH = 34;

    for (let i = 0; i < values.length; i++) {
      const vX = this.left + i * (valW + valGap);
      this.drawRoundedBox(vX, y, valW, valH, COLOR_BG_TINT, COLOR_BORDER);
      doc.font('bold').fontSize(5.8).fillColor(COLOR_NAVY).text(values[i], vX + 2, y + 11, {
        width: valW - 4,
        align: 'center',
        lineBreak: false,
      });
    }

    // --- Page 2 Footer ---
    this.drawFooter();
  }

  // =========================================================================
  // SHARED DRAWING COMPONENTS
  // =========================================================================

  private drawBrandHeader(y: number): number {
    const { doc, offer } = this;
    const top = y;

    // Left: WELLNESS ALBANIA CLINIC
    try {
      doc.image(LOGO, this.left, top, { height: 28 });
    } catch {
      doc.font('bold').fontSize(13).fillColor(COLOR_NAVY).text('WELLNESS™', this.left, top);
      doc.font('bold').fontSize(13).fillColor('#dc2626').text(' ALBANIA CLINIC', this.left + 78, top);
    }

    // Center: medwork.al
    const midX = this.left + 200;
    doc.font('bold').fontSize(13).fillColor(COLOR_NAVY).text('medwork.al', midX, top);
    doc.font('regular').fontSize(7.5).fillColor(COLOR_MUTED).text('Your Trusted Partner in Workplace Health', midX, top + 15);

    // Right: Issuer info & Subtitle
    const rightW = 160;
    const rX = this.right - rightW;
    doc.font('bold').fontSize(7.5).fillColor(COLOR_BLUE).text('Occupational Health Services for a Healthier Workplace', rX, top, {
      width: rightW,
      align: 'right',
    });
    if (offer.issuer.companyName && offer.issuer.companyName !== 'Wellness Albania') {
      doc.font('regular').fontSize(7).fillColor(COLOR_MUTED).text(offer.issuer.companyName, rX, top + 12, { width: rightW, align: 'right' });
    }

    const dividerY = top + 34;
    doc.moveTo(this.left, dividerY).lineTo(this.right, dividerY).strokeColor(COLOR_BORDER).lineWidth(0.75).stroke();

    return dividerY + 12;
  }

  private drawSectionBadge(num: number, title: string, x: number, y: number): void {
    const { doc } = this;
    const radius = 7.5;
    doc.circle(x + radius, y + radius, radius).fill(COLOR_BLUE);
    doc.font('bold').fontSize(8.5).fillColor('#ffffff').text(String(num), x, y + 2.5, { width: radius * 2, align: 'center' });
    doc.font('bold').fontSize(10).fillColor(COLOR_NAVY).text(title, x + radius * 2 + 6, y + 2.5);
  }

  private drawFeatureCard(x: number, y: number, w: number, h: number, num: number, title: string, items: string[]): void {
    const { doc } = this;
    this.drawRoundedBox(x, y, w, h, COLOR_CARD_BG, COLOR_BORDER);

    // Badge
    const radius = 6.5;
    doc.circle(x + 10 + radius, y + 10 + radius, radius).fill(COLOR_BLUE);
    doc.font('bold').fontSize(7.5).fillColor('#ffffff').text(String(num), x + 10, y + 11.5, { width: radius * 2, align: 'center' });

    // Title
    doc.font('bold').fontSize(8).fillColor(COLOR_NAVY).text(title, x + 28, y + 11, { width: w - 34 });

    // 4 Check items
    const itemY = y + 28;
    const lineH = 19;
    for (let i = 0; i < items.length; i++) {
      const curY = itemY + i * lineH;
      this.drawCheckIcon(x + 10, curY + 1);
      doc.font('regular').fontSize(7.2).fillColor(COLOR_TEXT).text(items[i], x + 22, curY, { width: w - 30, lineGap: 0.5 });
    }
  }

  private drawCheckIcon(x: number, y: number): void {
    const { doc } = this;
    doc.save();
    doc.circle(x + 4, y + 4, 4.5).fill(COLOR_BG_TINT);
    doc.moveTo(x + 2, y + 4).lineTo(x + 3.8, y + 6).lineTo(x + 6.5, y + 2.5).strokeColor(COLOR_BLUE).lineWidth(1).stroke();
    doc.restore();
  }

  private drawRoundedBox(x: number, y: number, w: number, h: number, bg: string, border: string): void {
    this.doc.roundedRect(x, y, w, h, 4).fillAndStroke(bg, border);
  }

  private drawLabeledValue(x: number, y: number, labelW: number, labelText: string, valueText: string): void {
    const { doc } = this;
    doc.font('bold').fontSize(7.5).fillColor(COLOR_NAVY).text(labelText, x, y, { width: labelW });
    doc.font('regular').fontSize(7.5).fillColor(COLOR_TEXT).text(valueText, x + labelW, y, { width: 140, lineBreak: false });
  }

  private drawFooter(): void {
    const { doc } = this;
    const y = 800;

    doc.moveTo(this.left, y - 5).lineTo(this.right, y - 5).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

    const phone = this.offer.issuer.phone || '+355 69 000 0000';
    const email = this.offer.issuer.email || 'info@medwork.al';
    const web = this.offer.issuer.website || 'www.medwork.al';

    doc.font('regular').fontSize(7.5).fillColor(COLOR_MUTED);
    doc.text(`🌐 ${web}    ✉️ ${email}    📞 ${phone}`, this.left, y, { width: 330 });

    doc.font('bold').fontSize(7.5).fillColor(COLOR_BLUE).text(this.t('footerTagline'), this.right - 180, y, { width: 180, align: 'right' });
  }

  private drawWatermarkAndPaging(): void {
    const { doc, offer } = this;
    const range = doc.bufferedPageRange();

    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);

      // Watermark if draft
      if (offer.draft) {
        const centreX = doc.page.width / 2;
        const centreY = doc.page.height / 2;
        doc.save();
        doc.rotate(-35, { origin: [centreX, centreY] });
        doc.font('bold').fontSize(64).fillColor('#b91c1c').fillOpacity(0.12);
        doc.text(this.t('watermark'), 0, centreY - 40, { width: doc.page.width, align: 'center', lineBreak: false });
        doc.restore();
      }
    }
  }

  // =========================================================================
  // FORMATTING & HELPERS
  // =========================================================================

  private t(key: OfferPdfLabel, params?: Record<string, string | number>): string {
    return label(this.offer.language, key, params);
  }

  private money(amount: string): string {
    const locale = this.offer.language === 'sq' ? 'sq-AL' : 'en-GB';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.offer.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(amount));
    } catch {
      return `${amount} ${this.offer.currency}`;
    }
  }

  private percent(value: string): string {
    const number = Number(value);
    const text = Number.isInteger(number) ? String(number) : number.toFixed(2);
    return this.offer.language === 'sq' ? text.replace('.', ',') : text;
  }

  private date(day: string): string {
    const [year, month, date] = day.split('-');
    return this.offer.language === 'sq' ? `${date}.${month}.${year}` : `${date}/${month}/${year}`;
  }

  private computeExpiryDate(issuedOn: string, months: number): string {
    try {
      const [year, month, date] = issuedOn.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1 + months, date));
      const expY = d.getUTCFullYear();
      const expM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const expD = String(d.getUTCDate()).padStart(2, '0');
      return this.offer.language === 'sq' ? `${expD}.${expM}.${expY}` : `${expD}/${expM}/${expY}`;
    } catch {
      return '—';
    }
  }

  private extractPlainText(doc: RichTextDoc | null): string | null {
    if (!doc || !Array.isArray(doc.content)) return null;
    const pieces: string[] = [];
    const walk = (node: RichTextNode) => {
      if (!['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'text', 'hardBreak'].includes(node.type)) {
        return;
      }
      if (node.type === 'text' && typeof node.text === 'string') pieces.push(node.text);
      else if (node.type === 'hardBreak') pieces.push('\n');
      if (Array.isArray(node.content)) {
        node.content.forEach(walk);
        if (['paragraph', 'heading', 'listItem'].includes(node.type)) pieces.push(' ');
      }
    };
    doc.content.forEach(walk);
    const text = pieces.join('').replace(/[ \t]+/g, ' ').trim();
    return text || null;
  }
}
