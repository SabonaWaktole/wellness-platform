import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import { SalesScriptSettingsContent } from './SalesScriptSettingsContent';
import { salesScriptService, type ScriptVersion } from '../../../services/salesScriptService';

vi.mock('../../../services/salesScriptService', () => ({
  salesScriptService: {
    draft: vi.fn(),
    versions: vi.fn(),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    version: vi.fn(),
    restore: vi.fn(),
  },
}));

const service = vi.mocked(salesScriptService);

const text = (value: string) => ({ type: 'text', text: value });
const doc = (...content: object[]) => ({ type: 'doc' as const, content });
const heading = (value: string) => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });
const paragraph = (value: string) => ({ type: 'paragraph', content: [text(value)] });

const version = (overrides: Partial<ScriptVersion>): ScriptVersion => ({
  version: 3,
  status: 'PUBLISHED',
  contentSq: doc(heading('Hapja'), paragraph('Prezantohuni.')),
  contentEn: doc(heading('Opening'), paragraph('Introduce yourself.')),
  createdBy: { id: 'u1', name: 'Ana Hoxha' },
  updatedAt: '2026-10-01T09:00:00.000Z',
  publishedAt: '2026-10-01T09:00:00.000Z',
  publishedBy: { id: 'u1', name: 'Ana Hoxha' },
  ...overrides,
});

const PUBLISHED = version({});
const VERSIONS = {
  versions: [
    { version: 3, status: 'PUBLISHED' as const, publishedAt: PUBLISHED.publishedAt, publishedBy: PUBLISHED.publishedBy },
    { version: 2, status: 'SUPERSEDED' as const, publishedAt: '2026-09-30T08:00:00.000Z', publishedBy: { id: 'u2', name: 'Erion Leka' } },
    { version: 1, status: 'SUPERSEDED' as const, publishedAt: '2026-09-29T08:00:00.000Z', publishedBy: null },
  ],
  draft: null,
};

const renderEditor = () =>
  render(
    <MemoryRouter initialEntries={['/acme/settings/sales-script']}>
      <Routes>
        <Route path="/:tenantSlug/settings/sales-script" element={<SalesScriptSettingsContent />} />
      </Routes>
    </MemoryRouter>
  );

const editorFor = (name: string) => (screen.getByRole('textbox', { name }) as HTMLElement & { editor: Editor }).editor;

describe('Settings → Sales script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.draft.mockResolvedValue({ draft: null, published: PUBLISHED });
    service.versions.mockResolvedValue(VERSIONS);
    service.saveDraft.mockResolvedValue(version({ version: 4, status: 'DRAFT' }));
    service.publish.mockResolvedValue(version({ version: 4 }));
    service.restore.mockResolvedValue(version({ version: 4, status: 'DRAFT' }));
  });

  it('FR-SCR-04 opens on the published script in Albanian, and switches to English', async () => {
    renderEditor();
    expect((await screen.findByRole('textbox', { name: 'Script (Albanian)' })).textContent).toBe('HapjaPrezantohuni.');
    expect(screen.getByRole('status')).toHaveTextContent('Version 3 is published');

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('textbox', { name: 'Script (English)' }).textContent).toBe('OpeningIntroduce yourself.');
  });

  it('FR-SCR-04 saves a draft of both languages, which does not publish it', async () => {
    renderEditor();
    await screen.findByRole('textbox', { name: 'Script (Albanian)' });
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();

    await act(async () => {
      editorFor('Script (Albanian)').commands.setContent(doc(heading('Hapja'), paragraph('Mirëdita!')));
    });
    service.draft.mockResolvedValue({ draft: version({ version: 4, status: 'DRAFT' }), published: PUBLISHED });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    });

    expect(service.saveDraft).toHaveBeenCalledWith('acme', {
      contentSq: doc(heading('Hapja'), paragraph('Mirëdita!')),
      contentEn: PUBLISHED.contentEn,
    });
    expect(service.publish).not.toHaveBeenCalled();
    expect(await screen.findByText('Draft saved. Salespeople still see the published version.')).toBeInTheDocument();
  });

  it('FR-SCR-04 previews the script as salespeople will see it, with its sections', async () => {
    renderEditor();
    await screen.findByRole('textbox', { name: 'Script (Albanian)' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    const preview = screen.getByRole('region', { name: 'Preview, as salespeople will see it' });
    expect(within(preview).getByRole('heading', { name: 'Hapja' })).toHaveAttribute('id', 'sales-script-preview-section-1');
    expect(within(preview).getByRole('button', { name: 'Hapja' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Script (Albanian)' })).toBeNull();
  });

  it('FR-SCR-04 publishes after confirming, saving unsaved changes first', async () => {
    renderEditor();
    await screen.findByRole('textbox', { name: 'Script (Albanian)' });
    await act(async () => {
      editorFor('Script (Albanian)').commands.setContent(doc(paragraph('E re.')));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    });

    await waitFor(() => expect(service.publish).toHaveBeenCalledWith('acme'));
    expect(service.saveDraft).toHaveBeenCalledWith('acme', { contentSq: doc(paragraph('E re.')), contentEn: PUBLISHED.contentEn });
    expect(service.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(service.publish.mock.invocationCallOrder[0]);
    expect(await screen.findByText('Published. Salespeople now see this version.')).toBeInTheDocument();
  });

  it('FR-SCR-04 says why a publish was refused', async () => {
    service.draft.mockResolvedValue({ draft: version({ version: 4, status: 'DRAFT', contentSq: doc() }), published: PUBLISHED });
    service.publish.mockRejectedValue({ response: { status: 400, data: { code: 'SCRIPT_EMPTY', field: 'contentSq' } } });
    renderEditor();
    await screen.findByRole('textbox', { name: 'Script (Albanian)' });

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await act(async () => {
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Write the Albanian text before publishing.');
  });

  it('FR-SCR-05 lists every published version with who published it, and shows an earlier one', async () => {
    service.version.mockResolvedValue(version({ version: 2, status: 'SUPERSEDED', contentSq: doc(paragraph('Teksti i vjetër.')), contentEn: null }));
    renderEditor();
    await screen.findByRole('textbox', { name: 'Script (Albanian)' });

    expect(screen.getByText(/by Erion Leka/)).toBeInTheDocument();
    expect(screen.getByText(/by the system/)).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'View version 2' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(service.version).toHaveBeenCalledWith('acme', 2);
    expect(within(dialog).getByText('Teksti i vjetër.')).toBeInTheDocument();
    expect(within(dialog).getByText('No text in this language.')).toBeInTheDocument();
  });

  it('FR-SCR-06 restores an earlier version as the draft after confirming', async () => {
    renderEditor();
    await screen.findByRole('textbox', { name: 'Script (Albanian)' });

    fireEvent.click(screen.getByRole('button', { name: 'Restore version 2' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent("The draft will take version 2's text");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));
    });

    await waitFor(() => expect(service.restore).toHaveBeenCalledWith('acme', 2));
    expect(service.publish).not.toHaveBeenCalled();
    expect(await screen.findByText('Version 2 is now the draft. Publish it to make it current.')).toBeInTheDocument();
  });
});
