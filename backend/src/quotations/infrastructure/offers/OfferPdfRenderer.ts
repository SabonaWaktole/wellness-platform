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

const INK = '#1f2933';
const MUTED = '#5f6b7a';
const RULE = '#d9dee5';
const ACCENT = '#0f766e';

/** A run of text with its marks, from TipTap JSON. */
interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  link: string | null;
}

/**
 * Draws an offer document as an A4 PDF (D3) with pdfkit: Noto Sans, which
 * has ë and ç, the Wellness Albania logo, sq/en labels, money in the
 * document's language, and a diagonal DRAFT watermark on a draft
 * (FR-OFR-09). The offer texts are TipTap JSON drawn by a small walker that
 * knows paragraphs, headings, lists, bold, italic, links and line breaks, and
 * skips anything else (D10). The output depends only on the document (its
 * creation date is the offer's date), so preview and download match
 * (FR-OFR-05).
 */
export class OfferPdfRenderer implements IOfferPdfRenderer {
  async render(document: OfferDocument): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `${label(document.language, 'title')} ${document.reference}`,
        Author: document.issuer.companyName ?? '',
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

    new OfferPdfDrawing(doc, document).draw();
    doc.end();
    return finished;
  }
}

class OfferPdfDrawing {
  private readonly left: number;
  private readonly right: number;
  private readonly width: number;

  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly offer: OfferDocument
  ) {
    this.left = doc.page.margins.left;
    this.right = doc.page.width - doc.page.margins.right;
    this.width = this.right - this.left;
  }

  draw(): void {
    this.header();
    this.recipient();
    this.richText(this.offer.texts.intro);
    this.details();
    this.services();
    this.prices();
    if (this.offer.note) {
      this.heading(this.t('note'));
      this.body(this.offer.note);
    }
    this.richText(this.offer.texts.terms);
    this.richText(this.offer.texts.closing);
    this.salesperson();
    this.pages();
  }

  // ----- sections --------------------------------------------------------

  private header(): void {
    const { doc, offer } = this;
    const top = doc.y;
    doc.image(LOGO, this.left, top, { height: 34 });
    const issuer = offer.issuer;
    const lines = [
      issuer.companyName,
      issuer.nipt ? `${this.t('nipt')}: ${issuer.nipt}` : null,
      issuer.address,
      [issuer.phone, issuer.email].filter(Boolean).join('  ·  ') || null,
      issuer.website,
    ].filter((line): line is string => Boolean(line));
    doc.font('regular').fontSize(8).fillColor(MUTED);
    let y = top;
    for (const line of lines) {
      doc.text(line, this.left + this.width / 2, y, { width: this.width / 2, align: 'right' });
      y = doc.y;
    }
    doc.y = Math.max(y, top + 40) + 18;

    doc.font('bold').fontSize(18).fillColor(INK).text(`${this.t('title')} ${offer.reference}`, this.left, doc.y, { width: this.width });
    doc.moveDown(0.3);
    const facts = [
      `${this.t('date')}: ${this.date(offer.issuedOn)}`,
      offer.validUntil
        ? `${this.t('validUntil')}: ${this.date(offer.validUntil)}`
        : offer.validityDays !== null
          ? this.t('validFor', { days: offer.validityDays })
          : null,
    ].filter((fact): fact is string => Boolean(fact));
    doc.font('regular').fontSize(9).fillColor(MUTED).text(facts.join('    '), { width: this.width });
    this.rule();
  }

  private recipient(): void {
    const { company, contact } = this.offer;
    this.heading(this.t('preparedFor'));
    this.doc.font('bold').fontSize(11).fillColor(INK).text(company.name, this.left, this.doc.y, { width: this.width });
    const address = [company.streetAddress, company.area, company.city].filter(Boolean).join(', ');
    const lines = [
      company.nipt ? `${this.t('nipt')}: ${company.nipt}` : null,
      address ? `${this.t('address')}: ${address}` : null,
      contact ? `${this.t('contact')}: ${[contact.name, contact.position].filter(Boolean).join(', ')}` : null,
      contact && (contact.phone || contact.email) ? [contact.phone, contact.email].filter(Boolean).join('  ·  ') : null,
    ].filter((line): line is string => Boolean(line));
    for (const line of lines) this.body(line, MUTED);
    this.doc.moveDown(0.6);
  }

  private details(): void {
    const { inputs } = this.offer;
    this.heading(this.t('details'));
    const rows: [OfferPdfLabel, string | number | null][] = [
      ['employees', inputs.employees],
      ['businessType', inputs.businessType],
      ['riskLevel', inputs.riskLevel],
      ['zone', inputs.zone],
      ['frequency', inputs.frequency],
      ['package', inputs.package],
    ];
    for (const [key, value] of rows) {
      if (value === null || value === '') continue;
      this.row(this.t(key), String(value));
    }
    this.doc.moveDown(0.6);
  }

  private services(): void {
    if (this.offer.services.length === 0) return;
    this.heading(this.t('services'));
    for (const service of this.offer.services) {
      this.ensureSpace(30);
      this.doc.font('bold').fontSize(10).fillColor(INK).text(`•  ${service.name}`, this.left + 6, this.doc.y, { width: this.width - 6 });
      if (service.description) {
        this.doc.font('regular').fontSize(9).fillColor(MUTED).text(service.description, this.left + 18, this.doc.y, { width: this.width - 18 });
      }
      this.doc.moveDown(0.2);
    }
    this.doc.moveDown(0.4);
  }

  private prices(): void {
    const { amounts, contractMonths } = this.offer;
    this.heading(this.t('price'));
    if (!amounts) {
      this.body(this.t('priceOnRequest'));
      this.body(this.t('vatNote'), MUTED);
      this.doc.moveDown(0.6);
      return;
    }
    this.row(this.t('baseFee'), this.money(amounts.baseFee));
    this.row(this.t('riskFee'), this.money(amounts.riskFee));
    this.row(this.t('visitFee'), this.money(amounts.visitFee));
    this.row(this.t('locationFee'), this.money(amounts.locationFee));
    this.row(this.t('listPrice'), this.money(amounts.listPrice), { bold: true, ruleAbove: true });
    if (Number(amounts.discountPercent) !== 0) {
      this.row(this.t('discount', { percent: this.percent(amounts.discountPercent) }), `− ${this.money(amounts.discountAmount)}`);
    }
    this.row(this.t('netMonthlyPrice'), this.money(amounts.netMonthlyPrice), { bold: true, ruleAbove: true, accent: true });
    this.row(this.t('annualValue', { months: contractMonths ?? 12 }), this.money(amounts.annualValue));
    this.doc.moveDown(0.2);
    // Q5: prices are without VAT, and the offer says so.
    this.body(this.t('vatNote'), MUTED);
    this.doc.moveDown(0.6);
  }

  private salesperson(): void {
    const { salesperson, issuer } = this.offer;
    this.ensureSpace(80);
    this.heading(this.t('salesperson'));
    this.doc.font('bold').fontSize(10).fillColor(INK).text(salesperson.name, this.left, this.doc.y, { width: this.width });
    const contact = [salesperson.phone, salesperson.email].filter(Boolean).join('  ·  ');
    if (contact) this.body(contact, MUTED);
    if (issuer.bankDetails) {
      this.doc.moveDown(0.6);
      this.heading(this.t('bankDetails'));
      this.body(issuer.bankDetails, MUTED);
    }
  }

  /** The watermark and the footer, on every page once the content is laid out. */
  private pages(): void {
    const { doc, offer } = this;
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const bottom = doc.page.height - doc.page.margins.bottom;
      // Drawing in the bottom margin must not start a new page.
      doc.page.margins.bottom = 0;
      doc.font('regular').fontSize(8).fillColor(MUTED);
      doc.text(offer.reference, this.left, bottom + 22, { width: this.width / 2, lineBreak: false });
      doc.text(this.t('page', { page: index + 1, pages: range.count }), this.left + this.width / 2, bottom + 22, {
        width: this.width / 2,
        align: 'right',
        lineBreak: false,
      });
      if (offer.draft) this.watermark();
    }
  }

  private watermark(): void {
    const { doc } = this;
    const centreX = doc.page.width / 2;
    const centreY = doc.page.height / 2;
    doc.save();
    doc.rotate(-35, { origin: [centreX, centreY] });
    doc.font('bold').fontSize(64).fillColor('#b91c1c').fillOpacity(0.12);
    doc.text(this.t('watermark'), 0, centreY - 40, { width: doc.page.width, align: 'center', lineBreak: false });
    doc.restore();
  }

  // ----- building blocks -------------------------------------------------

  private heading(text: string): void {
    this.ensureSpace(40);
    this.doc.font('bold').fontSize(11).fillColor(ACCENT).text(text, this.left, this.doc.y, { width: this.width });
    this.doc.moveDown(0.25);
  }

  private body(text: string, color = INK): void {
    this.doc.font('regular').fontSize(10).fillColor(color).text(text, this.left, this.doc.y, { width: this.width });
  }

  private row(name: string, value: string, options: { bold?: boolean; ruleAbove?: boolean; accent?: boolean } = {}): void {
    const { doc } = this;
    this.ensureSpace(20);
    if (options.ruleAbove) {
      doc.moveTo(this.left, doc.y).lineTo(this.right, doc.y).strokeColor(RULE).lineWidth(0.5).stroke();
      doc.y += 3;
    }
    const y = doc.y;
    const valueWidth = 140;
    doc.font(options.bold ? 'bold' : 'regular').fontSize(10).fillColor(INK);
    doc.text(name, this.left, y, { width: this.width - valueWidth - 10 });
    const after = doc.y;
    doc.fillColor(options.accent ? ACCENT : INK).text(value, this.right - valueWidth, y, { width: valueWidth, align: 'right' });
    doc.y = Math.max(after, doc.y) + 2;
  }

  private rule(): void {
    const { doc } = this;
    doc.moveDown(0.6);
    doc.moveTo(this.left, doc.y).lineTo(this.right, doc.y).strokeColor(RULE).lineWidth(0.75).stroke();
    doc.moveDown(0.8);
  }

  private ensureSpace(height: number): void {
    if (this.doc.y + height > this.doc.page.height - this.doc.page.margins.bottom) this.doc.addPage();
  }

  // ----- rich text (TipTap JSON, D10) -------------------------------------

  private richText(text: RichTextDoc | null): void {
    if (!text) return;
    this.doc.moveDown(0.4);
    for (const node of text.content ?? []) this.block(node, 0);
    this.doc.moveDown(0.6);
  }

  private block(node: RichTextNode, depth: number, prefix = ''): void {
    const children = Array.isArray(node.content) ? (node.content as RichTextNode[]) : [];
    switch (node.type) {
      case 'paragraph':
        this.runs(this.inline(children), { size: 10, depth, prefix });
        break;
      case 'heading': {
        const level = typeof (node.attrs as { level?: unknown } | undefined)?.level === 'number' ? (node.attrs as { level: number }).level : 2;
        this.ensureSpace(30);
        this.runs(this.inline(children).map((run) => ({ ...run, bold: true })), { size: level === 1 ? 14 : level === 2 ? 12 : 11, depth, prefix });
        break;
      }
      case 'bulletList':
      case 'orderedList':
        children.forEach((item, index) => {
          const marker = node.type === 'bulletList' ? '•  ' : `${index + 1}.  `;
          const parts = Array.isArray(item.content) ? (item.content as RichTextNode[]) : [];
          parts.forEach((part, partIndex) => this.block(part, depth + 1, partIndex === 0 ? marker : ''));
        });
        break;
      default:
        // Unknown blocks are skipped, never guessed at (D10).
        break;
    }
  }

  private inline(nodes: RichTextNode[]): Run[] {
    const runs: Run[] = [];
    for (const node of nodes) {
      if (node.type === 'hardBreak') {
        runs.push({ text: '\n', bold: false, italic: false, link: null });
        continue;
      }
      if (node.type !== 'text' || typeof node.text !== 'string') continue;
      const marks = Array.isArray(node.marks) ? (node.marks as { type: string; attrs?: { href?: unknown } }[]) : [];
      const href = marks.find((mark) => mark.type === 'link')?.attrs?.href;
      runs.push({
        text: node.text,
        bold: marks.some((mark) => mark.type === 'bold'),
        italic: marks.some((mark) => mark.type === 'italic'),
        link: typeof href === 'string' && /^(https?:|mailto:)/i.test(href) ? href : null,
      });
    }
    return runs;
  }

  private runs(runs: Run[], options: { size: number; depth: number; prefix: string }): void {
    const { doc } = this;
    const indent = options.depth * 14;
    const all = options.prefix ? [{ text: options.prefix, bold: false, italic: false, link: null }, ...runs] : runs;
    if (all.length === 0) {
      doc.moveDown(0.5);
      return;
    }
    this.ensureSpace(options.size * 2);
    const x = this.left + indent;
    all.forEach((run, index) => {
      doc
        .font(run.bold ? 'bold' : run.italic ? 'italic' : 'regular')
        .fontSize(options.size)
        .fillColor(run.link ? ACCENT : INK);
      const first = index === 0;
      const textOptions: PDFKit.Mixins.TextOptions = {
        continued: index < all.length - 1,
        link: run.link ?? undefined,
        underline: run.link !== null,
      };
      if (first) doc.text(run.text, x, doc.y, { ...textOptions, width: this.width - indent });
      else doc.text(run.text, textOptions);
    });
    doc.moveDown(0.3);
  }

  // ----- formatting --------------------------------------------------------

  private t(key: OfferPdfLabel, params?: Record<string, string | number>): string {
    return label(this.offer.language, key, params);
  }

  /** A two-decimal string in the document's language: 49,40 € or €49.40. */
  private money(amount: string): string {
    const locale = this.offer.language === 'sq' ? 'sq-AL' : 'en-GB';
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: this.offer.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
    } catch {
      return `${amount} ${this.offer.currency}`;
    }
  }

  private percent(value: string): string {
    const number = Number(value);
    const text = Number.isInteger(number) ? String(number) : number.toFixed(2);
    return this.offer.language === 'sq' ? text.replace('.', ',') : text;
  }

  /** YYYY-MM-DD as 05.10.2026 (sq) or 05/10/2026 (en). */
  private date(day: string): string {
    const [year, month, date] = day.split('-');
    return this.offer.language === 'sq' ? `${date}.${month}.${year}` : `${date}/${month}/${year}`;
  }
}
