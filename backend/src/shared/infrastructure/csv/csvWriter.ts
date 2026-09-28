/**
 * Small, pure CSV helpers, first written for the audit export (FR-AUD-08).
 * Nothing here is audit-specific; a later export (clients, contracts, ...)
 * can reuse this instead of writing its own escaping.
 */

/** Cell prefixes that a spreadsheet reads as a formula (CSV formula injection). */
const FORMULA_PREFIXES = ['=', '+', '-', '@'];

/** One cell, quoted and escaped for CSV, and formula-injection-guarded. */
export function escapeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** One CSV row (already-escaped or raw cells), CRLF-terminated per RFC 4180. */
export function csvRow(cells: unknown[]): string {
  return `${cells.map(escapeCsvCell).join(',')}\r\n`;
}

/** Prepended to a CSV response so Excel reads non-ASCII (e.g. Albanian, Greek) text correctly. */
export const UTF8_BOM = '﻿';
