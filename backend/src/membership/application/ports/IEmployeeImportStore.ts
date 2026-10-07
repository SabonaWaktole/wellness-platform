import type { ImportCounts, ImportRow, ImportRowResult, RawRow } from '../../domain/employeeImport';

export type ImportStatus = 'PREVIEWED' | 'CONFIRMED' | 'EXPIRED';

/** One upload as stored. `rows` is personal data and is null once confirmed or expired (D10). */
export interface EmployeeImportRecord extends ImportCounts {
  id: string;
  clientId: string;
  fileName: string;
  uploadedBy: string;
  status: ImportStatus;
  rows: ImportRow[] | null;
  result: ImportRowResult[] | null;
  confirmToken: string;
  createdAt: Date;
  confirmedAt: Date | null;
  /** The members created or linked by the confirmed upload: opaque ids, kept for the card-links sheet (FR-EMP-08). */
  memberIds: string[] | null;
}

export interface NewEmployeeImport extends ImportCounts {
  id: string;
  tenantId: string;
  clientId: string;
  fileName: string;
  uploadedBy: string;
  rows: ImportRow[];
  confirmToken: string;
}

export interface ConfirmedImport extends ImportCounts {
  result: ImportRowResult[];
  memberIds: string[];
  confirmedAt: Date;
}

/** What the reader returns: the sheet's rows already keyed by column (FR-EMP-02). */
export interface EmployeeSheet {
  rows: RawRow[];
}

/** Reads and checks a workbook by its content (FR-EMP-03, NFR-SEC-09). Throws `EmployeeImportRefusedError`. */
export interface IEmployeeSheetReader {
  read(file: Buffer): Promise<EmployeeSheet>;
}

/** Builds the downloadable files (FR-EMP-02, FR-EMP-06). */
export interface IEmployeeSheetWriter {
  template(language: 'sq' | 'en'): Promise<Buffer>;
  result(rows: readonly ImportRowResult[]): Promise<Buffer>;
  /** FR-EMP-08: member number, name and card link per member, safe to open in Excel (NFR-SEC-09). */
  cardLinks(rows: ReadonlyArray<{ memberNumber: string; name: string; url: string }>): Promise<Buffer>;
}

export interface IEmployeeImportStore {
  /** The company's id and name when it belongs to the workspace and is not archived. */
  findCompany(tenantId: string, clientId: string): Promise<{ id: string; name: string; employeeCount: number | null } | null>;
  create(data: NewEmployeeImport): Promise<EmployeeImportRecord>;
  find(tenantId: string, id: string): Promise<EmployeeImportRecord | null>;
  /** The company's uploads, newest first, without rows (FR-EMP-06). */
  listForCompany(tenantId: string, clientId: string): Promise<EmployeeImportRecord[]>;
  /**
   * Moves a PREVIEWED upload to CONFIRMED and returns true; false when it was
   * already confirmed or expired. Inside the confirming transaction, so two
   * confirmations of one upload are served one after the other (FR-EMP-05).
   */
  claim(tenantId: string, id: string, at: Date): Promise<boolean>;
  /** Writes the final counts and the personal-data-free result, and clears the rows (D10, FR-DPR-03). */
  finish(id: string, data: ConfirmedImport): Promise<void>;
  /** Marks one upload EXPIRED and clears its rows. */
  expire(id: string): Promise<void>;
}
