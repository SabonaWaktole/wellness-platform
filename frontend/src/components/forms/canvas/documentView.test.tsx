// @ts-nocheck
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FormBuilder } from './FormBuilder';
import * as clientFormHooks from '../../../hooks/useClientForm';
import * as clientsHooks from '../../../hooks/useClients';
import { emptyPageGeometry } from '../../../types/form';

/*
 * ONE DOCUMENT, SEVERAL PAGES.
 *
 * Most of what makes a stack of sheets read as a document rather than a row of
 * artboards is visual and belongs in CSS. What is testable is the structure
 * underneath it: the pages stay in order, the panes around the document can be
 * put away so the page is the only thing left, and — the one real correctness
 * hazard — the page holding a live caret is never unmounted by virtualisation
 * while the owner is typing into it.
 */

const navigate = vi.fn();
const defineCustomField = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ tenantSlug: 'acme', formId: 'cf1' }),
}));
vi.mock('../../../hooks/useClientForm', () => ({
  useClientForm: vi.fn(),
  useUpdateFormLayout: vi.fn(),
  useUploadFormAsset: vi.fn(),
  usePublishForm: vi.fn(),
  useFormVersions: vi.fn(),
  useFormVersion: vi.fn(),
}));
vi.mock('../../../hooks/useClients', () => ({ useDefineCustomField: vi.fn() }));

const textDoc = (text) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const form = () => ({
  id: 'cf1',
  name: 'Client Intake',
  description: null,
  isDefault: true,
  isTemplate: false,
  status: 'DRAFT',
  version: 3,
  updatedAt: '2026-08-30T00:00:00.000Z',
  shareToken: null,
  publishedVersionId: null,
  hasUnpublishedChanges: false,
  unplacedFieldIds: [],
  definitions: [],
  layout: {
    version: 3,
    page: emptyPageGeometry(),
    pages: [
      {
        id: 'p1',
        sections: [
          {
            id: 's1',
            title: 'One',
            x: 20,
            y: 20,
            width: 400,
            height: 200,
            elements: [
              { id: 't1', type: 'TEXT', x: 10, y: 10, width: 300, height: 40, content: textDoc('Hello paper') },
            ],
          },
        ],
      },
      { id: 'p2', sections: [] },
      { id: 'p3', sections: [] },
    ],
  },
});

const mockHooks = () => {
  vi.clearAllMocks();
  vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
    form: form(), setForm: vi.fn(), isLoading: false, error: null, fetchForm: vi.fn(),
  });
  vi.mocked(clientFormHooks.useUpdateFormLayout).mockReturnValue({
    updateLayout: vi.fn(), isSaving: false, error: null, hasConflict: false, clearError: vi.fn(),
  });
  vi.mocked(clientFormHooks.useUploadFormAsset).mockReturnValue({
    uploadAsset: vi.fn(), isUploading: false, error: null,
  });
  vi.mocked(clientFormHooks.usePublishForm).mockReturnValue({
    publishForm: vi.fn(), isPublishing: false, error: null, clearError: vi.fn(),
  });
  vi.mocked(clientFormHooks.useFormVersions).mockReturnValue({
    versions: [], isLoading: false, error: null, fetchVersions: vi.fn(),
  });
  vi.mocked(clientFormHooks.useFormVersion).mockReturnValue({
    version: null, isLoading: false, error: null, fetchVersion: vi.fn(), clearVersion: vi.fn(),
  });
  vi.mocked(clientsHooks.useDefineCustomField).mockReturnValue({
    defineCustomField, isLoading: false, error: null,
  });
};

const pageIds = () =>
  [...document.querySelectorAll('[data-page-id]')].map((el) => el.getAttribute('data-page-id'));

describe('The document', () => {
  beforeEach(mockHooks);

  it('stacks every page in document order', () => {
    render(<FormBuilder />);
    expect(pageIds()).toEqual(['p1', 'p2', 'p3']);
  });

  it('numbers each page in the gutter beneath it', () => {
    render(<FormBuilder />);
    const numbers = [...document.querySelectorAll('[class*="pageNumber"]')].map((el) => el.textContent);
    expect(numbers).toEqual(['1', '2', '3']);
  });

  /*
   * `useVisiblePages` unmounts a page's whole subtree once it is far enough
   * outside the viewport. It already force-renders the SELECTED page so drag
   * handles cannot vanish mid-gesture; a live caret is the worse case, because
   * unmounting the editor loses the focus and any keystroke in flight.
   */
  it('keeps the page holding the caret rendered even when it is not visible', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(document.querySelector('[class*="elementOverlay"]'));
    expect(document.querySelector('[contenteditable="true"]')).not.toBeNull();

    // The IntersectionObserver stub in setupTests never reports anything as
    // visible, so anything still rendered here is rendered because it was
    // forced — which is exactly the guarantee under test.
    expect(document.querySelector('[data-page-id="p1"] [contenteditable="true"]')).not.toBeNull();
  });
});

describe('The panes around the document', () => {
  beforeEach(mockHooks);

  it('can put the navigation pane away, leaving the page', () => {
    render(<FormBuilder />);
    expect(screen.getByRole('button', { name: /go to page 2/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /layout/i }));
    fireEvent.click(screen.getByRole('button', { name: /navigation pane/i }));

    expect(screen.queryByRole('button', { name: /go to page 2/i })).not.toBeInTheDocument();
  });

  it('can dismiss the format pane and bring it back from the contextual tab', () => {
    render(<FormBuilder />);
    fireEvent.click(document.querySelector('[class*="elementOverlay"]'));
    expect(document.querySelector('[data-format-pane]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(document.querySelector('[data-format-pane]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /format pane/i }));
    expect(document.querySelector('[data-format-pane]')).not.toBeNull();
  });
});

describe('Right-click', () => {
  beforeEach(mockHooks);

  const rightClick = (el) => fireEvent.contextMenu(el, { clientX: 40, clientY: 40 });

  it('selects what was clicked and opens its menu', () => {
    render(<FormBuilder />);
    rightClick(document.querySelector('[class*="elementOverlay"]'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /cut/i })).toBeInTheDocument();
  });

  it('deletes the element from the menu', () => {
    render(<FormBuilder />);
    rightClick(document.querySelector('[class*="elementOverlay"]'));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));

    expect(document.querySelector('[class*="elementOverlay"]')).toBeNull();
  });

  /*
   * `moveSectionToPage` and `insertPageAt` were both implemented and tested in
   * layoutOps and had no caller anywhere — the document could not be
   * reorganised from the UI at all.
   */
  it('moves a section to the next page from the menu', () => {
    render(<FormBuilder />);
    rightClick(document.querySelector('[class*="sectionOverlay"]'));
    fireEvent.click(screen.getByRole('menuitem', { name: /move to next page/i }));

    expect(document.querySelector('[data-page-id="p1"] [class*="sectionOverlay"]')).toBeNull();
    expect(document.querySelector('[data-page-id="p2"] [class*="sectionOverlay"]')).not.toBeNull();
  });

  it('inserts a page before the current one from the menu', () => {
    render(<FormBuilder />);
    rightClick(document.querySelector('[class*="sectionOverlay"]'));
    fireEvent.click(screen.getByRole('menuitem', { name: /insert page before/i }));

    expect(pageIds()).toHaveLength(4);
  });

  it('leaves the browser its own menu while a caret is open', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(document.querySelector('[class*="elementOverlay"]'));
    rightClick(document.querySelector('[class*="elementOverlay"]'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
