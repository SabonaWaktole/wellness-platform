import { apiClient as api } from '../api';

const base = (slug: string) => `/${slug}/membership`;

export type ImportOutcome = 'NEW' | 'EXISTING' | 'SKIPPED' | 'REFUSED' | 'ERROR';

export interface ImportCounts {
  created: number;
  linked: number;
  skipped: number;
  refused: number;
  errors: number;
}

export interface PreviewRow {
  row: number;
  outcome: ImportOutcome;
  reason: string | null;
  name: string | null;
}

export interface EmployeeImportPreview {
  id: string;
  fileName: string;
  confirmToken: string;
  counts: ImportCounts;
  rows: PreviewRow[];
}

export interface EmployeeImportOutcome {
  id: string;
  counts: ImportCounts;
  rows: Array<{ row: number; outcome: string; reason: string | null }>;
}

export interface EmployeeImportSummary extends ImportCounts {
  id: string;
  clientId: string;
  fileName: string;
  status: 'PREVIEWED' | 'CONFIRMED' | 'EXPIRED';
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export type EmployeeImportRefusal =
  | 'NO_VALID_CONTRACT'
  | 'COMPANY_NOT_FOUND'
  | 'NO_FILE'
  | 'NOT_XLSX'
  | 'HAS_MACROS'
  | 'TOO_LARGE'
  | 'TOO_MANY_ROWS'
  | 'MISSING_COLUMNS'
  | 'EMPTY_FILE'
  | 'ALREADY_CONFIRMED'
  | 'EXPIRED'
  | 'BAD_TOKEN';

/**
 * Corporate employee upload (M4 Slice 9). The screen sends the company, the file and, to confirm, the token of the
 * preview. It classifies nothing: every class, count and reason comes from the server (FR-EMP-04).
 */
export const employeeImportService = {
  template: async (slug: string, lang: 'sq' | 'en') =>
    (await api.get<Blob>(`${base(slug)}/employee-template.xlsx`, { params: { lang }, responseType: 'blob' })).data,
  preview: async (slug: string, clientId: string, file: File) => {
    const form = new FormData();
    form.append('clientId', clientId);
    form.append('file', file);
    return (await api.post<{ data: EmployeeImportPreview }>(`${base(slug)}/employee-imports`, form)).data.data;
  },
  confirm: async (slug: string, importId: string, confirmToken: string) =>
    (await api.post<{ data: EmployeeImportOutcome }>(`${base(slug)}/employee-imports/${importId}/confirm`, { confirmToken })).data.data,
  history: async (slug: string, clientId: string) =>
    (await api.get<{ data: EmployeeImportSummary[] }>(`${base(slug)}/employee-imports`, { params: { clientId } })).data.data,
  result: async (slug: string, importId: string) =>
    (await api.get<Blob>(`${base(slug)}/employee-imports/${importId}/result.xlsx`, { responseType: 'blob' })).data,
};

/** The reason of a refused upload or confirmation (EMPLOYEE_IMPORT_REFUSED), if the error is one. */
export const importRefusalOf = (err: unknown): { reason: EmployeeImportRefusal; message: string } | null => {
  const response = (err as { response?: { status?: number; data?: { code?: string; reason?: EmployeeImportRefusal; error?: string } } })?.response;
  return response?.data?.code === 'EMPLOYEE_IMPORT_REFUSED' && response.data.reason ? { reason: response.data.reason, message: response.data.error ?? '' } : null;
};
