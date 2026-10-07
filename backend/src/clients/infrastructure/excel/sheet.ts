import ExcelJS from 'exceljs';

/** Uploads are buffered in memory, so the cap is deliberately small. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Guards against a single upload spawning thousands of sequential writes. */
export const MAX_IMPORT_ROWS = 1000;

export const IMPORT_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'application/octet-stream',
];

export interface ParsedSheet {
  headers: string[];
  /** One entry per non-blank data row, keyed by the (trimmed) header cell. */
  rows: Record<string, string>[];
}

/**
 * Cells arrive as numbers, dates, formula results or rich text depending on how
 * the sheet was authored. Everything is normalised to a trimmed string so the
 * callers can validate uniformly; dates keep their ISO form.
 */
export const cellToString = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as any;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (Array.isArray(obj.richText)) return obj.richText.map((r: any) => r.text).join('').trim();
    if (obj.result !== undefined) return cellToString(obj.result);
    if (obj.hyperlink) return String(obj.hyperlink).trim();
    return '';
  }
  return String(value).trim();
};

export const parseSheet = async (buffer: Buffer): Promise<ParsedSheet> => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    // ExcelJS only reads zip-based .xlsx; a .csv upload lands here.
    return parseCsv(buffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('The uploaded file has no worksheets.');

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToString(cell.value);
  });
  if (!headers.some(Boolean)) throw new Error('The first row must contain column headers.');

  const rows: Record<string, string>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= MAX_IMPORT_ROWS) return;

    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cellToString(row.getCell(index + 1).value);
      record[header] = value;
      if (value) hasValue = true;
    });
    if (hasValue) rows.push(record);
  });

  return { headers: headers.filter(Boolean), rows };
};

/** Minimal CSV reader: quoted fields with doubled quotes, comma separated. */
const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

const parseCsv = (buffer: Buffer): ParsedSheet => {
  const lines = buffer
    .toString('utf-8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(line => line.trim() !== '');

  if (lines.length === 0) throw new Error('The uploaded file is empty.');

  const headers = parseCsvLine(lines[0]!).filter(Boolean);
  if (headers.length === 0) throw new Error('The first row must contain column headers.');

  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1, MAX_IMPORT_ROWS + 1)) {
    const cells = parseCsvLine(line);
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      const value = cells[index] ?? '';
      record[header] = value;
      if (value) hasValue = true;
    });
    if (hasValue) rows.push(record);
  }

  return { headers, rows };
};

/**
 * Builds a single-sheet workbook with a bold header row, used for the
 * downloadable import templates.
 */
export const buildTemplate = async (
  sheetName: string,
  headers: string[],
  sampleRows: string[][] = []
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns = headers.map(header => ({ width: Math.max(16, header.length + 4) }));
  sampleRows.forEach(row => worksheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
