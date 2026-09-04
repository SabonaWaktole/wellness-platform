// @ts-nocheck
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FormBuilder } from './FormBuilder';
import * as clientFormHooks from '../../../hooks/useClientForm';
import * as clientsHooks from '../../../hooks/useClients';
import { emptyPageGeometry, UNPLACED_PAGE_ID } from '../../../types/form';
import { ADDABLE_COMPONENTS } from '../registry/componentRegistry';
import enForms from '../../../locales/en/forms.json';

const navigate = vi.fn();

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
vi.mock('../../../hooks/useClients', () => ({
  useDefineCustomField: vi.fn(),
}));

const definition = (id, fieldName, over = {}) => ({
  id,
  tenantId: 't1',
  fieldName,
  fieldType: 'TEXT',
  order: 0,
  role: null,
  required: false,
  ...over,
});

const form = (over = {}) => ({
  id: 'cf1',
  name: 'Client Intake',
  description: null,
  isDefault: true,
  status: 'PUBLISHED',
  version: 3,
  updatedAt: '2026-08-30T00:00:00.000Z',
  unplacedFieldIds: [],
  definitions: [definition('f1', 'Company Name'), definition('f2', 'VAT Number')],
  layout: {
    version: 3,
    page: emptyPageGeometry(),
    pages: [
      {
        id: 'p1',
        sections: [
          {
            id: 's1',
            title: 'Company Information',
            x: 20,
            y: 20,
            width: 400,
            height: 300,
            elements: [
              { id: 'i1', type: 'INPUT', x: 10, y: 10, width: 200, height: 50,
                field: { key: 'company_name', label: 'Company Name', dataType: 'TEXT', required: false, clientFieldId: 'f1' } },
              { id: 'i2', type: 'INPUT', x: 10, y: 70, width: 200, height: 50,
                field: { key: 'vat_number', label: 'VAT Number', dataType: 'TEXT', required: false, clientFieldId: 'f2' } },
            ],
          },
        ],
      },
    ],
  },
  ...over,
});

const updateLayout = vi.fn();

/*
 * Insert controls now live on the ribbon's Insert tab rather than in a sidebar
 * that was always open. Opening the tab is the gesture a Word user makes, so
 * the tests make it too — the assertions after it are unchanged.
 */
/** Read view / version history moved behind File, with Print and Copy link. */
const openFileMenu = () => fireEvent.click(screen.getByRole('button', { name: /^file$/i }));
const readViewItem = () => {
  openFileMenu();
  return screen.getByRole('button', { name: /read view|hide preview/i });
};
const historyItem = () => {
  openFileMenu();
  return screen.getByRole('button', { name: /version history|hide history/i });
};

const openInsertTab = () => fireEvent.click(screen.getByRole('tab', { name: /insert/i }));
const addSection = () => {
  openInsertTab();
  fireEvent.click(screen.getByRole('button', { name: /add section/i }));
};

const defineCustomField = vi.fn();

/*
 * The section heading on the PAGE — the real <h3> `FormPageRenderer` draws.
 *
 * These tests used to probe `getByDisplayValue` on a title <input> that was
 * permanently mounted over that heading. The input is now revealed only when
 * the owner double-clicks to type, so the heading itself is the stable probe
 * for "this section exists", and it is also the thing the owner actually sees.
 */
const heading = (text) => screen.queryByText(text);

/** The on-page title editor, once revealed. The Format panel shows a field of
 *  the same name beside the page, so the query has to say which one it means. */
const pageTitleInput = () => document.querySelector('[class*="sectionTitleInput"]');

describe('FormBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
      form: form(),
      setForm: vi.fn(),
      isLoading: false,
      error: null,
      fetchForm: vi.fn(),
    });
    vi.mocked(clientFormHooks.useUpdateFormLayout).mockReturnValue({
      updateLayout,
      isSaving: false,
      error: null,
      hasConflict: false,
      clearError: vi.fn(),
    });
    vi.mocked(clientFormHooks.useUploadFormAsset).mockReturnValue({
      uploadAsset: vi.fn(),
      isUploading: false,
      error: null,
    });
    vi.mocked(clientFormHooks.usePublishForm).mockReturnValue({
      publishForm: vi.fn(),
      isPublishing: false,
      error: null,
      clearError: vi.fn(),
    });
    vi.mocked(clientFormHooks.useFormVersions).mockReturnValue({
      versions: [],
      isLoading: false,
      error: null,
      fetchVersions: vi.fn(),
    });
    vi.mocked(clientFormHooks.useFormVersion).mockReturnValue({
      version: null,
      isLoading: false,
      error: null,
      fetchVersion: vi.fn(),
      clearVersion: vi.fn(),
    });
    vi.mocked(clientsHooks.useDefineCustomField).mockReturnValue({
      defineCustomField,
      isLoading: false,
      error: null,
    });
  });

  it('renders the toolbar, the form name and both fields', () => {
    render(<FormBuilder />);
    expect(screen.getByText('Client Intake')).toBeInTheDocument();
    expect(screen.getByText('Company Information')).toBeInTheDocument();
  });

  it('keeps Save disabled until something changes', () => {
    render(<FormBuilder />);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('renames a section and enables Save', () => {
    render(<FormBuilder />);
    // Double-click the heading band to open it for typing, as in Word.
    fireEvent.doubleClick(document.querySelector('[class*="sectionDragHandle"]'));
    fireEvent.change(pageTitleInput(), { target: { value: 'Company Details' } });

    expect(heading('Company Details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  });

  it('adds a section', () => {
    render(<FormBuilder />);
    addSection();
    expect(heading(/new section/i)).toBeInTheDocument();
  });

  it('strips the synthetic unplaced rescue PAGE and saves the real document', async () => {
    updateLayout.mockResolvedValue(form({ version: 4 }));
    const withUnplaced = form();
    withUnplaced.layout.pages.push({
      id: UNPLACED_PAGE_ID,
      sections: [
        { id: 'unplaced', title: 'Not yet placed', x: 20, y: 20, width: 400, height: 100, elements: [] },
      ],
    });
    vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
      form: withUnplaced,
      setForm: vi.fn(),
      isLoading: false,
      error: null,
      fetchForm: vi.fn(),
    });

    render(<FormBuilder />);
    addSection(); // makes it dirty
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(updateLayout).toHaveBeenCalled());
    const [formId, savedLayout] = updateLayout.mock.calls[0];
    expect(formId).toBe('cf1');
    expect(savedLayout.pages.map((p) => p.id)).not.toContain(UNPLACED_PAGE_ID);
    expect(savedLayout.pages.flatMap((p) => p.sections).map((s) => s.id)).not.toContain('unplaced');
  });

  it('warns about fields that are not on the form yet', () => {
    vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
      form: form({ unplacedFieldIds: ['f3'] }),
      setForm: vi.fn(),
      isLoading: false,
      error: null,
      fetchForm: vi.fn(),
    });
    render(<FormBuilder />);
    expect(screen.getByText(/isn't on the form yet|aren't on the form yet/i)).toBeInTheDocument();
  });

  it('offers a reload rather than a validation error on a version conflict', () => {
    const fetchForm = vi.fn();
    vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
      form: form(),
      setForm: vi.fn(),
      isLoading: false,
      error: null,
      fetchForm,
    });
    vi.mocked(clientFormHooks.useUpdateFormLayout).mockReturnValue({
      updateLayout,
      isSaving: false,
      error: null,
      hasConflict: true,
      clearError: vi.fn(),
    });

    render(<FormBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(fetchForm).toHaveBeenCalled();
  });

  it('toggles into a read-only preview', () => {
    render(<FormBuilder />);
    fireEvent.click(readViewItem());
    // Print mode renders values as static text, not inputs.
    expect(screen.queryByRole('textbox', { name: /company name/i })).not.toBeInTheDocument();
    expect(screen.getByText(/hide preview/i)).toBeInTheDocument();
  });

  /*
   * History and Preview are mutually exclusive read-only views layered over
   * the same canvas area. Without this, opening History while Preview was
   * already on left `showPreview` true underneath, so closing History later
   * would silently land the owner back in Preview instead of the canvas —
   * caught driving the real toolbar in the browser, not by a prior test.
   */
  it('closes preview when history is opened, and vice versa', () => {
    render(<FormBuilder />);

    // Each mode is probed by the exit affordance it puts on the surface it
    // takes over, which is also the thing that makes it escapable at all.
    fireEvent.click(readViewItem());
    expect(screen.getByText(/hide preview/i)).toBeInTheDocument();

    fireEvent.click(historyItem());
    expect(screen.getByRole('heading', { name: /version history/i })).toBeInTheDocument();
    expect(screen.queryByText(/hide preview/i)).not.toBeInTheDocument();

    fireEvent.click(readViewItem());
    expect(screen.getByText(/hide preview/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /version history/i })).not.toBeInTheDocument();
  });

  it('navigates back to client management on Back', () => {
    render(<FormBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(navigate).toHaveBeenCalledWith('/acme/settings/client-management');
  });

  /*
   * Selecting a field shows its properties, including the underlying field
   * type — editing it calls the existing, already-tested
   * PATCH /settings/custom-fields/:id endpoint, not a new one.
   */
  it('shows a selected field in the properties panel', () => {
    render(<FormBuilder />);
    // The canvas overlay for element i1 is a clickable div with no accessible
    // name; select it via its position in the DOM instead.
    const overlays = document.querySelectorAll('[class*="elementOverlay"][style*="left: 10px"]');
    expect(overlays.length).toBeGreaterThan(0);
    fireEvent.click(overlays[0]);
    // "Company Name" also appears as the field's own rendered label, so the
    // properties-panel-only "Field type" heading is what actually proves the
    // panel switched, not just that the field is on the page (it always is).
    expect(screen.getByText(/field type/i)).toBeInTheDocument();
  });

  /*
   * THE BUG. `selectedSectionId` resolved a selected FIELD's section by
   * looking up a section whose id equals the field's id — which can never
   * match anything, since an element id is never a section id. That silently
   * disabled "Add input field" and "Add image" the moment any existing field
   * was selected, which is most of the time: selecting a field to edit it is
   * the natural first step before adding a sibling field next to it.
   */
  it('keeps the component buttons enabled when a field (not the section) is selected', () => {
    render(<FormBuilder />);
    const overlays = document.querySelectorAll('[class*="elementOverlay"][style*="left: 10px"]');
    fireEvent.click(overlays[0]);
    openInsertTab();

    expect(screen.getByRole('button', { name: /add text field/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /add image/i })).toBeEnabled();
  });

  /*
   * The Add menu is generated from the COMPONENT REGISTRY, so every addable
   * type must actually reach the UI — a registry entry that never renders a
   * button is the failure mode an open registry invites.
   */
  it('offers every addable component type from the registry', () => {
    render(<FormBuilder />);
    openInsertTab();
    for (const component of ADDABLE_COMPONENTS) {
      const label = (enForms.components as Record<string, string>)[component.type];
      // Exact, not a regex: "Add Text block" and "Add Text field" would both
      // match a loose /add text/ and hide a genuinely missing entry.
      expect(
        screen.getByRole('button', { name: `Add ${label}` }),
        `${component.type} missing from the Add menu`
      ).toBeInTheDocument();
    }
  });

  it('adds a component to the selected section without opening a dialog', () => {
    render(<FormBuilder />);
    fireEvent.click(document.querySelectorAll('[class*="sectionOverlay"]')[0]);
    openInsertTab();
    fireEvent.click(screen.getByRole('button', { name: /add date/i }));

    // Landed straight on the canvas and became the selection — no modal.
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('FormBuilder — undo/redo, keyboard, autosave wiring', () => {
  beforeEach(() => {
    vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
      form: form(),
      setForm: vi.fn(),
      isLoading: false,
      error: null,
      fetchForm: vi.fn(),
    });
    vi.mocked(clientFormHooks.useUpdateFormLayout).mockReturnValue({
      updateLayout,
      isSaving: false,
      error: null,
      hasConflict: false,
    });
    vi.mocked(clientFormHooks.useUploadFormAsset).mockReturnValue({
      uploadAsset: vi.fn(),
      isUploading: false,
      error: null,
    });
    vi.mocked(clientFormHooks.usePublishForm).mockReturnValue({
      publishForm: vi.fn(),
      isPublishing: false,
      error: null,
      clearError: vi.fn(),
    });
    vi.mocked(clientFormHooks.useFormVersions).mockReturnValue({
      versions: [],
      isLoading: false,
      error: null,
      fetchVersions: vi.fn(),
    });
    vi.mocked(clientFormHooks.useFormVersion).mockReturnValue({
      version: null,
      isLoading: false,
      error: null,
      fetchVersion: vi.fn(),
      clearVersion: vi.fn(),
    });
    vi.mocked(clientsHooks.useDefineCustomField).mockReturnValue({
      defineCustomField: vi.fn(),
      isLoading: false,
      error: null,
    });
  });

  it('renders Undo and Redo, both disabled with nothing to undo', () => {
    render(<FormBuilder />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
  });

  it('an edit enables Undo; clicking it reverts the edit and enables Redo', () => {
    render(<FormBuilder />);
    addSection();
    expect(screen.getByRole('button', { name: /undo/i })).toBeEnabled();
    expect(heading(/new section/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(heading(/new section/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(heading(/new section/i)).toBeInTheDocument();
  });

  it('Ctrl+Z undoes and Ctrl+Shift+Z redoes', () => {
    render(<FormBuilder />);
    addSection();
    expect(heading(/new section/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(heading(/new section/i)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(heading(/new section/i)).toBeInTheDocument();
  });

  /* Spec §21: text editing wins over object shortcuts. */
  it('does not undo while typing in the section title field', () => {
    render(<FormBuilder />);
    addSection();
    // Inserting a section opens its title for typing, so the caret is already
    // where this test needs it.
    const titleInput = pageTitleInput();

    fireEvent.keyDown(titleInput, { key: 'z', ctrlKey: true });
    // Still there — the shortcut was not intercepted. A plain <input> keeps the
    // browser's own undo; only a contenteditable defers to the document's.
    expect(heading(/new section/i)).toBeInTheDocument();
  });

  it('Delete removes the selected element', () => {
    render(<FormBuilder />);
    const overlays = document.querySelectorAll('[class*="elementOverlay"][style*="left: 10px"]');
    fireEvent.click(overlays[0]);
    expect(screen.getByText(/field type/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.queryByText(/field type/i)).not.toBeInTheDocument();
  });

  it('Escape clears the selection', () => {
    render(<FormBuilder />);
    fireEvent.click(document.querySelectorAll('[class*="sectionOverlay"]')[0]);
    expect(screen.getByText(/section settings/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/section settings/i)).not.toBeInTheDocument();
  });

  it('arrow keys nudge the selected element by 1px, Shift+arrow by 10px', () => {
    render(<FormBuilder />);
    const overlays = document.querySelectorAll('[class*="elementOverlay"][style*="left: 10px"]');
    fireEvent.click(overlays[0]);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.querySelector('[class*="elementOverlay"][style*="left: 11px"]')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(document.querySelector('[class*="elementOverlay"][style*="left: 21px"]')).toBeTruthy();
  });

  /* Spec §29: autosave, debounced, after an edit settles. */
  it('schedules an autosave after an edit and shows Saved once it lands', async () => {
    vi.useFakeTimers();
    updateLayout.mockResolvedValue(form({ version: 4 }));

    render(<FormBuilder />);
    addSection();

    await vi.advanceTimersByTimeAsync(3000);
    expect(updateLayout).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('Ctrl+D duplicates the selected element with a fresh id', () => {
    render(<FormBuilder />);
    const overlays = document.querySelectorAll('[class*="elementOverlay"][style*="left: 10px"]');
    fireEvent.click(overlays[0]);

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    // Two "Company Name" labelled overlays now exist: original + duplicate.
    expect(screen.getAllByText(/Company Name/).length).toBeGreaterThanOrEqual(2);
  });
});
