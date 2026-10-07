import * as path from 'path';
import PDFDocument from 'pdfkit';
import type { IReceiptPdfRenderer, ReceiptDocument } from '../application/receiptDocument';
import { receiptLabel, type ReceiptLabel } from './receiptPdfLabels';

/** backend/assets, from src/… under ts-node and from dist/… once built: the same depth. */
const ASSETS = path.resolve(__dirname, '../../../assets');
const FONTS = { regular: path.join(ASSETS, 'fonts/NotoSans-Regular.ttf'), bold: path.join(ASSETS, 'fonts/NotoSans-Bold.ttf') };
const LOGO = path.join(ASSETS, 'brand/wellness-plus-logo.png');

const INK = '#1f2933';
const MUTED = '#5f6b7a';
const RULE = '#d9dee5';
const ACCENT = '#0f766e';
const VOID = '#b42318';

/**
 * Draws a membership receipt as an A4 PDF (FR-MPAY-11) with pdfkit, as the offer
 * is drawn: Noto Sans (it has ë and ç), the Wellness+ logo, sq/en labels. It
 * prints exactly the values of the `ReceiptDocument` and says on the page that
 * it is not an invoice. A voided payment is marked VOIDED with its reason.
 */
export class MemberReceiptPdfRenderer implements IReceiptPdfRenderer {
  async render(document: ReceiptDocument): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      info: { Title: `${receiptLabel(document.language, 'receipt')} ${document.receiptNumber}`, Author: document.issuerName },
    });
    doc.registerFont('regular', FONTS.regular);
    doc.registerFont('bold', FONTS.bold);

    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    new ReceiptDrawing(doc, document).draw();
    doc.end();
    return finished;
  }
}

class ReceiptDrawing {
  private readonly left: number;
  private readonly right: number;
  private readonly width: number;

  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly receipt: ReceiptDocument
  ) {
    this.left = doc.page.margins.left;
    this.right = doc.page.width - doc.page.margins.right;
    this.width = this.right - this.left;
  }

  draw(): void {
    const { doc, receipt } = this;
    const top = doc.y;
    doc.image(LOGO, this.left, top, { height: 34 });
    doc.font('regular').fontSize(9).fillColor(MUTED).text(receipt.issuerName, this.left + this.width / 2, top + 6, { width: this.width / 2, align: 'right' });
    doc.y = top + 58;

    doc.font('bold').fontSize(18).fillColor(INK).text(this.t('title'), this.left, doc.y, { width: this.width });
    doc.moveDown(0.3);
    doc.font('regular').fontSize(11).fillColor(MUTED).text(`${this.t('receiptNumber')}: ${receipt.receiptNumber}`, { width: this.width });
    if (receipt.voided) {
      doc.moveDown(0.5);
      doc.font('bold').fontSize(14).fillColor(VOID).text(this.t('voided'), { width: this.width });
      doc.font('regular').fontSize(9).fillColor(VOID).text(`${this.t('voidedOn')}: ${this.date(receipt.voided.on)}. ${this.t('voidReason')}: ${receipt.voided.reason}`, { width: this.width });
    }
    this.rule();

    this.row(this.t('member'), receipt.memberName);
    this.row(this.t('memberNumber'), receipt.memberNumber);
    this.row(this.t('tier'), this.t(receipt.tier));
    this.row(this.t('kind'), this.t(receipt.kind));
    if (receipt.period) this.row(this.t('period'), `${this.date(receipt.period.startsOn)} – ${this.date(receipt.period.endsOn)}`);
    this.row(this.t('receivedOn'), this.date(receipt.receivedOn));
    this.row(this.t('method'), this.t(receipt.method));
    if (receipt.agentName) this.row(this.t('agent'), receipt.agentName);
    this.rule();

    this.row(this.t('listFee'), this.money(receipt.listFee));
    if (Number(receipt.discountPercent) > 0) this.row(this.t('discount'), `${receipt.discountPercent}%`);
    this.row(this.t('amount'), this.money(receipt.amount), true);

    doc.moveDown(2);
    doc.font('regular').fontSize(9).fillColor(MUTED).text(this.t('notAnInvoice'), this.left, doc.y, { width: this.width });
  }

  private row(name: string, value: string, bold = false): void {
    const { doc } = this;
    const y = doc.y;
    doc.font('regular').fontSize(10).fillColor(MUTED).text(name, this.left, y, { width: this.width * 0.4 });
    doc.font(bold ? 'bold' : 'regular').fontSize(bold ? 13 : 10).fillColor(bold ? ACCENT : INK).text(value, this.left + this.width * 0.4, y, { width: this.width * 0.6 });
    doc.moveDown(0.5);
  }

  private rule(): void {
    const { doc } = this;
    doc.moveDown(0.6);
    doc.moveTo(this.left, doc.y).lineTo(this.right, doc.y).strokeColor(RULE).lineWidth(0.75).stroke();
    doc.moveDown(0.8);
  }

  private t(key: ReceiptLabel): string {
    return receiptLabel(this.receipt.language, key);
  }

  /** The amount as stored, so the PDF shows the same value as the payment. */
  private money(amount: string): string {
    return `€${amount}`;
  }

  private date(day: string): string {
    const [year, month, date] = day.split('-');
    return this.receipt.language === 'sq' ? `${date}.${month}.${year}` : `${date}/${month}/${year}`;
  }
}
