import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EmployeeUploadContent } from './EmployeeUploadContent';
import { clientService } from '../../services/clientService';
import { employeeImportService, type EmployeeImportPreview, type EmployeeImportSummary } from '../../services/employeeImportService';
import { downloadBlob } from '../../utils/downloadBlob';

vi.mock('../../services/clientService', () => ({ clientService: { getClient: vi.fn(), searchClients: vi.fn() } }));
vi.mock('../../services/employeeImportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/employeeImportService')>();
  return { ...actual, employeeImportService: { template: vi.fn(), preview: vi.fn(), confirm: vi.fn(), history: vi.fn(), result: vi.fn() } };
});
vi.mock('../../utils/downloadBlob', () => ({ downloadBlob: vi.fn() }));

const clients = vi.mocked(clientService);
const imports = vi.mocked(employeeImportService);

const preview = (): EmployeeImportPreview => ({
  id: 'imp1',
  fileName: 'uat.xlsx',
  confirmToken: 'token-1',
  counts: { created: 2, linked: 1, skipped: 1, refused: 0, errors: 1 },
  rows: [
    { row: 2, outcome: 'NEW', reason: null, name: 'Ana Alpha' },
    { row: 3, outcome: 'NEW', reason: null, name: 'Besa Beta' },
    { row: 4, outcome: 'SKIPPED', reason: 'Repeated in the file', name: null },
    { row: 5, outcome: 'EXISTING', reason: null, name: 'Eva Existing' },
    { row: 6, outcome: 'ERROR', reason: 'Enter a date of birth, a phone number or an email, so the person can be recognised later.', name: null },
  ],
});

const summary = (extra: Partial<EmployeeImportSummary> = {}): EmployeeImportSummary => ({
  id: 'h1', clientId: 'c1', fileName: 'earlier.xlsx', status: 'CONFIRMED', uploadedBy: 'u1', uploadedByName: 'Ira Test', createdAt: '2026-10-01T09:00:00.000Z',
  confirmedAt: '2026-10-01T09:05:00.000Z', created: 3, linked: 0, skipped: 2, refused: 0, errors: 0, ...extra,
});

const refusal = (reason: string, error: string, status = 400) => ({ response: { status, data: { code: 'EMPLOYEE_IMPORT_REFUSED', reason, error } } });

const renderPage = (path = '/acme/members/employee-upload?clientId=c1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:tenantSlug/members/employee-upload" element={<EmployeeUploadContent />} />
      </Routes>
    </MemoryRouter>
  );

const choose = (name = 'uat.xlsx') => {
  const file = new File(['x'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(screen.getByLabelText('Employee file'), { target: { files: [file] } });
  return file;
};

beforeEach(() => {
  vi.clearAllMocks();
  clients.getClient.mockResolvedValue({ id: 'c1', name: 'Acme Ltd' } as never);
  imports.history.mockResolvedValue([]);
});

describe('The employee upload (M4 Slice 9)', () => {
  it('FR-EMP-01 a company with no valid contract is refused with the reason the server gives, and nothing is shown to confirm', async () => {
    imports.preview.mockRejectedValue(refusal('NO_VALID_CONTRACT', 'No valid contract', 409));
    renderPage();
    await screen.findByText('Acme Ltd');
    choose();
    fireEvent.click(screen.getByRole('button', { name: 'Upload and preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No valid contract: the company needs a valid contract today before its employees can be uploaded.');
    expect(screen.queryByRole('button', { name: 'Confirm and create' })).not.toBeInTheDocument();
  });

  it('FR-EMP-03 a file the server refuses by content says why', async () => {
    imports.preview.mockRejectedValue(refusal('HAS_MACROS', 'macros'));
    renderPage();
    await screen.findByText('Acme Ltd');
    choose('macro.xlsx');
    fireEvent.click(screen.getByRole('button', { name: 'Upload and preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Workbooks with macros (.xlsm) are not accepted. Save the file as .xlsx.');
  });

  it('FR-EMP-04 the preview shows the five classes with the counts, creates nothing, and confirming sends only the upload and its token', async () => {
    imports.preview.mockResolvedValue(preview());
    imports.confirm.mockResolvedValue({ id: 'imp1', counts: { created: 2, linked: 1, skipped: 1, refused: 0, errors: 1 }, rows: [{ row: 4, outcome: 'SKIPPED', reason: 'Repeated in the file' }] });
    renderPage();
    await screen.findByText('Acme Ltd');
    choose();
    fireEvent.click(screen.getByRole('button', { name: 'Upload and preview' }));

    await screen.findByText('Preview of uat.xlsx');
    expect(imports.preview).toHaveBeenCalledWith('acme', 'c1', expect.objectContaining({ name: 'uat.xlsx' }));
    const counts = screen.getByLabelText('Counts');
    for (const text of ['2 new', '1 to link', '1 skipped', '0 refused', '1 with errors']) expect(within(counts).getByText(text)).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(within(rows[2]!).getByText('Skipped')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Repeated in the file')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Existing member to link')).toBeInTheDocument();
    expect(within(rows[4]!).getByText(/Enter a date of birth/)).toBeInTheDocument();
    expect(screen.getByText('Nothing has been created yet.')).toBeInTheDocument();
    expect(imports.confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and create' }));
    await waitFor(() => expect(imports.confirm).toHaveBeenCalledWith('acme', 'imp1', 'token-1'));
    expect(await screen.findByText('Upload confirmed')).toBeInTheDocument();
  });

  it('FR-EMP-06 after confirming, the result file of the skipped and error rows can be downloaded and the history is reloaded', async () => {
    imports.preview.mockResolvedValue(preview());
    imports.confirm.mockResolvedValue({ id: 'imp1', counts: { created: 2, linked: 1, skipped: 1, refused: 0, errors: 1 }, rows: [{ row: 4, outcome: 'SKIPPED', reason: 'Repeated in the file' }] });
    imports.result.mockResolvedValue(new Blob(['x']));
    renderPage();
    await screen.findByText('Acme Ltd');
    choose();
    fireEvent.click(screen.getByRole('button', { name: 'Upload and preview' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and create' }));

    const result = await screen.findByRole('status');
    fireEvent.click(within(result).getByRole('button', { name: 'Download skipped and error rows' }));
    await waitFor(() => expect(imports.result).toHaveBeenCalledWith('acme', 'imp1'));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'uat-result.xlsx');
    expect(imports.history).toHaveBeenCalledTimes(2);
  });

  it('FR-EMP-05 a preview with nothing to create cannot be confirmed', async () => {
    imports.preview.mockResolvedValue({ ...preview(), counts: { created: 0, linked: 0, skipped: 3, refused: 0, errors: 0 }, rows: [{ row: 2, outcome: 'SKIPPED', reason: 'Already linked to this company', name: null }] });
    renderPage();
    await screen.findByText('Acme Ltd');
    choose();
    fireEvent.click(screen.getByRole('button', { name: 'Upload and preview' }));
    expect(await screen.findByRole('button', { name: 'Confirm and create' })).toBeDisabled();
  });

  it('FR-EMP-06 the company\'s uploads are listed with who, when, file name and counts', async () => {
    imports.history.mockResolvedValue([summary(), summary({ id: 'h2', fileName: 'late.xlsx', status: 'EXPIRED', created: 0, skipped: 0, confirmedAt: null })]);
    renderPage();
    expect(await screen.findByText('earlier.xlsx')).toBeInTheDocument();
    expect(imports.history).toHaveBeenCalledWith('acme', 'c1');
    expect(screen.getAllByText('Ira Test')).toHaveLength(2);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getAllByText('3 new')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Download skipped and error rows' })).toHaveLength(1);
  });

  it('FR-EMP-01 without a company in the address the user searches for one, and the file field appears once one is chosen', async () => {
    clients.searchClients.mockResolvedValue({ items: [{ id: 'c9', name: 'Beta Sh.p.k.' }] } as never);
    renderPage('/acme/members/employee-upload');
    expect(screen.queryByLabelText('Employee file')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search for a company'), { target: { value: 'Beta' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Beta Sh.p.k.' }));
    expect(await screen.findByLabelText('Employee file')).toBeInTheDocument();
    expect(imports.history).toHaveBeenCalledWith('acme', 'c9');
  });

  it('FR-EMP-02 the template is downloaded in the language of the screen', async () => {
    imports.template.mockResolvedValue(new Blob(['x']));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Download template' }));
    await waitFor(() => expect(imports.template).toHaveBeenCalledWith('acme', 'en'));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'wellness-plus-employees.xlsx');
  });
});
