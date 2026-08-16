import ExcelJS from 'exceljs';
import { parseSheet, buildTemplate, MAX_IMPORT_ROWS } from '../../../../../src/clients/infrastructure/excel/sheet';

const workbookBuffer = async (rows: any[][]): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('parseSheet', () => {
  it('reads headers and rows from an xlsx buffer', async () => {
    const buffer = await workbookBuffer([
      ['name', 'Company Size'],
      ['Acme', 42],
    ]);

    const sheet = await parseSheet(buffer);

    expect(sheet.headers).toEqual(['name', 'Company Size']);
    expect(sheet.rows).toEqual([{ name: 'Acme', 'Company Size': '42' }]);
  });

  it('skips fully blank rows', async () => {
    const buffer = await workbookBuffer([['name'], ['Acme'], [''], ['Beta']]);
    const sheet = await parseSheet(buffer);
    expect(sheet.rows.map(r => r.name)).toEqual(['Acme', 'Beta']);
  });

  it('caps the number of imported rows', async () => {
    const rows: any[][] = [['name']];
    for (let i = 0; i < MAX_IMPORT_ROWS + 5; i += 1) rows.push([`Client ${i}`]);
    const sheet = await parseSheet(await workbookBuffer(rows));
    expect(sheet.rows).toHaveLength(MAX_IMPORT_ROWS);
  });

  // ExcelJS only reads zip-based .xlsx, so csv uploads fall through to the
  // built-in reader rather than failing.
  it('falls back to CSV parsing', async () => {
    const csv = 'name,email\n"Acme, Ltd",hi@acme.com\n';
    const sheet = await parseSheet(Buffer.from(csv, 'utf-8'));
    expect(sheet.headers).toEqual(['name', 'email']);
    expect(sheet.rows).toEqual([{ name: 'Acme, Ltd', email: 'hi@acme.com' }]);
  });

  it('rejects a file with no header row', async () => {
    await expect(parseSheet(Buffer.from('', 'utf-8'))).rejects.toThrow('empty');
  });

  it('round-trips a generated template', async () => {
    const buffer = await buildTemplate('Clients', ['name', 'status'], [['Acme Ltd', 'PROSPECT']]);
    const sheet = await parseSheet(buffer);
    expect(sheet.headers).toEqual(['name', 'status']);
    expect(sheet.rows).toEqual([{ name: 'Acme Ltd', status: 'PROSPECT' }]);
  });
});
