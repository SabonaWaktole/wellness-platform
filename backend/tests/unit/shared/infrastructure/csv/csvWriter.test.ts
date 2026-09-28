import { csvRow, escapeCsvCell, UTF8_BOM } from '../../../../../src/shared/infrastructure/csv/csvWriter';

describe('csvWriter (FR-AUD-08)', () => {
  it('leaves a plain cell untouched', () => {
    expect(escapeCsvCell('Acme')).toBe('Acme');
    expect(escapeCsvCell(42)).toBe('42');
  });

  it('quotes and escapes a cell containing a comma, quote or newline', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('renders null and undefined as an empty cell', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('guards a cell that would open as a formula', () => {
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('-1')).toBe("'-1");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
  });

  it('joins a row with commas and terminates it with CRLF', () => {
    expect(csvRow(['a', 'b,c', 3])).toBe('a,"b,c",3\r\n');
  });

  it('the BOM is the UTF-8 byte-order mark', () => {
    expect(UTF8_BOM).toBe('﻿');
  });
});
