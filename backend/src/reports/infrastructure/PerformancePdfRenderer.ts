import PDFDocument from 'pdfkit';

export interface PerformancePdfData {
  tenantName: string;
  title: string;
  /** "Period: 2026-10-01 .. 2026-10-31", already worded for the locale. */
  periodLine: string;
  generatedAt: Date;
  header: string[];
  body: string[][];
  /** The last body row is the total row, drawn in bold. */
  hasTotalRow: boolean;
}

/**
 * The Performance table as a PDF (FR-PRF-09), on the report output of the Reports page (pdfkit,
 * A4). It is landscape, because the table has fifteen columns, and it is drawn from the same
 * table cells the CSV is written from, so the two files carry the same rows.
 */
export class PerformancePdfRenderer {
  render(data: PerformancePdfData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    this.draw(doc, data);
    doc.end();
    return finished;
  }

  private draw(doc: PDFKit.PDFDocument, data: PerformancePdfData): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.fontSize(18).fillColor('#000').text(data.tenantName);
    doc.fontSize(12).text(data.title);
    doc.fontSize(9).fillColor('#666').text(data.periodLine);
    doc.text(data.generatedAt.toISOString().slice(0, 10));
    doc.moveDown(1);

    // The first column (the salesperson) is wider than the figures.
    const figureColumns = data.header.length - 1;
    const firstWidth = 110;
    const width = (right - left - firstWidth) / Math.max(1, figureColumns);
    const x = (column: number) => (column === 0 ? left : left + firstWidth + (column - 1) * width);
    const w = (column: number) => (column === 0 ? firstWidth : width) - 4;

    const drawHeader = (y: number): number => {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#444');
      let bottom = y;
      data.header.forEach((heading, column) => {
        doc.text(heading, x(column), y, { width: w(column) });
        bottom = Math.max(bottom, doc.y);
      });
      doc.moveTo(left, bottom + 2).lineTo(right, bottom + 2).strokeColor('#ccc').stroke();
      return bottom + 8;
    };

    let y = drawHeader(doc.y);
    data.body.forEach((row, index) => {
      if (y > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        y = drawHeader(doc.page.margins.top);
      }
      const isTotal = data.hasTotalRow && index === data.body.length - 1;
      doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#000');
      row.forEach((cell, column) => doc.text(cell, x(column), y, { width: w(column) }));
      y += 18;
    });
  }
}
