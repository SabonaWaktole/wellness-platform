import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExcelImportButton } from './ExcelImportButton';

describe('ExcelImportButton', () => {
  const onImport = vi.fn();
  const onDownloadTemplate = vi.fn();
  const onImported = vi.fn();

  const renderButton = () =>
    render(
      <ExcelImportButton
        label="Import from Excel"
        templateFileName="template.xlsx"
        onImport={onImport}
        onDownloadTemplate={onDownloadTemplate}
        onImported={onImported}
      />
    );

  const pickFile = (container: HTMLElement) => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'clients.xlsx', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    return file;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onImport.mockResolvedValue({ created: 2, errors: [] });
  });

  it('uploads the picked file and reports the outcome', async () => {
    const { container } = renderButton();
    const file = pickFile(container);

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(file));
    expect(await screen.findByRole('status')).toHaveTextContent('2');
    expect(onImported).toHaveBeenCalled();
  });

  // Per-row failures come back with a 200, so they must be shown rather than
  // swallowed by the success path.
  it('lists per-row errors returned by the server', async () => {
    onImport.mockResolvedValue({ created: 1, errors: [{ row: 3, message: 'Name is required' }] });
    const { container } = renderButton();
    pickFile(container);

    expect(await screen.findByText(/Name is required/)).toBeInTheDocument();
  });

  it('surfaces a rejected upload as an alert', async () => {
    onImport.mockRejectedValue({ response: { data: { error: 'Unsupported file.' } } });
    const { container } = renderButton();
    pickFile(container);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported file.');
    expect(onImported).not.toHaveBeenCalled();
  });

  it('does not fire onImported when nothing was created', async () => {
    onImport.mockResolvedValue({ created: 0, errors: [{ row: 2, message: 'bad' }] });
    const { container } = renderButton();
    pickFile(container);

    await screen.findByRole('status');
    expect(onImported).not.toHaveBeenCalled();
  });

  it('downloads the template under the given filename', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    onDownloadTemplate.mockResolvedValue(new Blob(['x']));

    const clicked: HTMLAnchorElement[] = [];
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = () => clicked.push(el as HTMLAnchorElement);
      }
      return el;
    });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /template/i }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]!.download).toBe('template.xlsx');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
