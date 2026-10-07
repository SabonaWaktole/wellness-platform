import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { cellToString } from '../../../clients/infrastructure/excel/sheet';
import { EmployeeImportRefusedError } from '../../application/employeeImportErrors';
import type { EmployeeSheet, IEmployeeSheetReader, IEmployeeSheetWriter } from '../../application/ports/IEmployeeImportStore';
import { EMPLOYEE_IMPORT_LIMITS, hasRequiredColumns, mapHeaders, safeCell, TEMPLATE_HEADERS, type EmployeeColumn, type ImportRowResult, type RawRow } from '../../domain/employeeImport';

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * FR-EMP-03, NFR-SEC-09, D10: the file is judged by its content, never its name.
 * It must be a zip container holding an Excel workbook, with no macro part; its
 * size and row count are held to the limits of the client import. Cells are read
 * as text: a formula contributes only the result Excel cached with it, and no
 * formula or link is ever evaluated or followed.
 */
export class XlsxEmployeeSheets implements IEmployeeSheetReader, IEmployeeSheetWriter {
  async read(file: Buffer): Promise<EmployeeSheet> {
    if (file.length === 0) throw new EmployeeImportRefusedError('EMPTY_FILE', 'The file is empty.');
    if (file.length > EMPLOYEE_IMPORT_LIMITS.bytes) {
      throw new EmployeeImportRefusedError('TOO_LARGE', `The file must be smaller than ${EMPLOYEE_IMPORT_LIMITS.bytes / 1024 / 1024} MB.`);
    }
    await this.requireWorkbook(file);

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file as unknown as ArrayBuffer);
    } catch {
      throw new EmployeeImportRefusedError('NOT_XLSX', 'The file is not an Excel .xlsx workbook.');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new EmployeeImportRefusedError('EMPTY_FILE', 'The workbook has no sheets.');

    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = cellToString(cell.value);
    });
    if (!hasRequiredColumns(headers)) {
      throw new EmployeeImportRefusedError('MISSING_COLUMNS', 'The first row must have the columns First name and Last name (Emri and Mbiemri).');
    }
    const columns = mapHeaders(headers.filter(Boolean));

    const rows: RawRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: Partial<Record<EmployeeColumn, string>> = {};
      let any = false;
      headers.forEach((header, index) => {
        const column = header ? columns[header] : undefined;
        if (!column) return;
        const text = cellToString(row.getCell(index + 1).value);
        values[column] = text;
        if (text) any = true;
      });
      if (any) rows.push({ row: rowNumber, values });
    });

    if (rows.length === 0) throw new EmployeeImportRefusedError('EMPTY_FILE', 'The file has no employee rows.');
    if (rows.length > EMPLOYEE_IMPORT_LIMITS.rows) {
      throw new EmployeeImportRefusedError('TOO_MANY_ROWS', `The file has ${rows.length} rows; the limit is ${EMPLOYEE_IMPORT_LIMITS.rows}.`);
    }
    return { rows };
  }

  /** A renamed .exe or .csv has no zip signature; a macro workbook has a VBA part or a macro content type. */
  private async requireWorkbook(file: Buffer): Promise<void> {
    const notXlsx = () => new EmployeeImportRefusedError('NOT_XLSX', 'The file is not an Excel .xlsx workbook.');
    if (!file.subarray(0, 4).equals(ZIP_MAGIC)) throw notXlsx();
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      throw notXlsx();
    }
    if (!zip.file('xl/workbook.xml') || !zip.file('[Content_Types].xml')) throw notXlsx();
    const macroPart = Object.keys(zip.files).some((name) => /(^|\/)vbaProject\.bin$/i.test(name));
    const types = (await zip.file('[Content_Types].xml')!.async('string')).toLowerCase();
    if (macroPart || types.includes('macroenabled') || types.includes('vbaproject')) {
      throw new EmployeeImportRefusedError('HAS_MACROS', 'Workbooks with macros (.xlsm) are not accepted. Save the file as .xlsx.');
    }
  }

  /** FR-EMP-02: the template, with the required columns marked and a note on the header cells. */
  async template(language: 'sq' | 'en'): Promise<Buffer> {
    const headers = TEMPLATE_HEADERS[language];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(language === 'sq' ? 'Punonjësit' : 'Employees');
    const columns: EmployeeColumn[] = ['firstName', 'lastName', 'dateOfBirth', 'phone', 'email', 'language'];
    sheet.addRow(columns.map((column) => headers[column]));
    sheet.getRow(1).font = { bold: true };
    sheet.columns = columns.map((column) => ({ width: Math.max(16, headers[column].length + 4) }));
    sheet.getCell('C1').note = language === 'sq' ? 'VVVV-MM-DD, p.sh. 1990-05-14' : 'YYYY-MM-DD, for example 1990-05-14';
    sheet.getCell('F1').note = 'sq, en, el, it';
    sheet.getCell('A1').note =
      language === 'sq'
        ? 'Emri, mbiemri dhe të paktën një nga data e lindjes, telefoni ose emaili janë të detyrueshme.'
        : 'First name, last name and at least one of date of birth, phone or email are required.';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** FR-EMP-06: the skipped, refused and error rows with their number and reason, safe to open in Excel (NFR-SEC-09). */
  async result(rows: readonly ImportRowResult[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Result');
    sheet.addRow(['Row', 'Result', 'Reason']);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [{ width: 8 }, { width: 14 }, { width: 48 }];
    for (const row of rows) sheet.addRow([row.row, safeCell(row.outcome.charAt(0) + row.outcome.slice(1).toLowerCase()), safeCell(row.reason ?? '')]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async cardLinks(rows: ReadonlyArray<{ memberNumber: string; name: string; url: string }>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Card links');
    sheet.addRow(['Member ID', 'Name', 'Card link']);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [{ width: 14 }, { width: 32 }, { width: 80 }];
    for (const row of rows) sheet.addRow([safeCell(row.memberNumber), safeCell(row.name), safeCell(row.url)]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
