// @ts-nocheck
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FormBuilder } from './FormBuilder';
import * as clientFormHooks from '../../../hooks/useClientForm';
import * as clientsHooks from '../../../hooks/useClients';
import { emptyPageGeometry } from '../../../types/form';

/*
 * THE WORD MENTAL MODEL, as behaviour.
 *
 * The builder has exactly three states and the user must always be able to
 * tell which one they are in:
 *
 *   idle   — nothing selected
 *   object — a section/element is selected; it drags, resizes, nudges, deletes
 *   text   — a caret is live inside the document; typing types
 *
 * Before this, there was no `text` state at all on the canvas: every element
 * was covered by an opaque `cursor: grab` overlay whose whole point was that
 * "a click here always means select, never type", and text was edited in a
 * sidebar box instead. These tests pin the transitions between the three
 * states, because that — not the toolbar's appearance — is what makes the
 * editor feel like a document editor.
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
vi.mock('../../../hooks/useClients', () => ({
  useDefineCustomField: vi.fn(),
}));

const textDoc = (text) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const form = (over = {}) => ({
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
            title: 'Company Information',
            x: 20,
            y: 20,
            width: 400,
            height: 300,
            elements: [
              {
                id: 't1',
                type: 'TEXT',
                x: 10,
                y: 10,
                width: 300,
                height: 40,
                content: textDoc('Hello paper'),
              },
              {
                id: 'i1',
                type: 'INPUT',
                x: 60,
                y: 70,
                width: 200,
                height: 50,
                field: {
                  key: 'company_name',
                  label: 'Company Name',
                  dataType: 'TEXT',
                  required: false,
                },
              },
            ],
          },
        ],
      },
    ],
  },
  ...over,
});

/** The canvas overlays carry no accessible name — position identifies them. */
const overlayAt = (left) =>
  document.querySelector(`[class*="elementOverlay"][style*="left: ${left}px"]`);

const overlays = () => [...document.querySelectorAll('[class*="elementOverlay"]')];

const isSelected = (el) => /elementSelected/.test(el.className);
/*
 * An element the owner is TYPING into no longer wears the selection outline —
 * a box around the words is object vocabulary, and during an edit the thing in
 * hand is text (see `.elementEditing`). It is still the one object involved,
 * so tests that count "how many objects is this operation touching?" ask this
 * rather than the outline alone.
 */
const isInvolved = (el) => /elementSelected|elementEditing/.test(el.className);

const mockHooks = () => {
    vi.clearAllMocks();
    vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
      form: form(),
      setForm: vi.fn(),
      isLoading: false,
      error: null,
      fetchForm: vi.fn(),
    });
    vi.mocked(clientFormHooks.useUpdateFormLayout).mockReturnValue({
      updateLayout: vi.fn(),
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
};

const caret = () => document.querySelector('[contenteditable="true"]');

/*
 * Insert controls now live on the ribbon's Insert tab rather than in a sidebar
 * that was always open. Opening the tab is the gesture a Word user makes, so
 * the tests make it too — the assertions after it are unchanged.
 */
const openInsertTab = () => fireEvent.click(screen.getByRole('tab', { name: /insert/i }));
const addSection = () => {
  openInsertTab();
  fireEvent.click(screen.getByRole('button', { name: /add section/i }));
};


/**
 * Queries scoped to the sheet itself. The Format panel legitimately shows the
 * same label text beside the page, so an unscoped `getByDisplayValue` cannot
 * tell "editable on the page" from "editable in a side panel" — which is the
 * entire distinction these tests exist to prove.
 */
const onPage = () => within(document.querySelector('[data-page-id="p1"]'));

describe('FormBuilder — text editing vs object manipulation', () => {
  beforeEach(mockHooks);

  it('renders a text block as static text until it is asked to be edited', () => {
    render(<FormBuilder />);
    expect(screen.getByText('Hello paper')).toBeInTheDocument();
    expect(caret()).toBeNull();
  });

  /* Word: one click on a text box selects the BOX. It does not start typing. */
  it('single-clicking a text block selects the object without opening a caret', () => {
    render(<FormBuilder />);
    fireEvent.click(overlayAt(10));

    expect(isSelected(overlayAt(10))).toBe(true);
    expect(caret()).toBeNull();
  });

  /* Word: a second click — a double-click from idle — puts the caret inside. */
  it('double-clicking a text block puts a caret on the page, not in a sidebar', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(10));

    const editable = caret();
    expect(editable).not.toBeNull();
    // The caret must be INSIDE the sheet, not in a panel beside it: this is
    // the whole difference between editing a document and filling in a form
    // about a document.
    expect(editable.closest('[data-page-id="p1"]')).not.toBeNull();
  });

  it('leaves the caret unmounted for a non-text element', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(60));
    expect(caret()).toBeNull();
  });

  /* Escape steps out one level at a time — text -> object -> nothing. */
  it('Escape exits text editing back to object selection, and again to nothing', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(10));
    expect(caret()).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(caret()).toBeNull();
    expect(isSelected(overlayAt(10))).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(isSelected(overlayAt(10))).toBe(false);
  });

  /*
   * The destructive one. While a caret is live, Delete/Backspace/arrows belong
   * to the caret — an object-level Delete here would eat the element the user
   * is typing into.
   */
  it('does not delete the element when Delete is pressed inside the caret', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(10));

    fireEvent.keyDown(caret(), { key: 'Delete' });
    expect(overlayAt(10)).not.toBeNull();
  });

  it('does not nudge the element when an arrow key is pressed inside the caret', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(10));

    fireEvent.keyDown(caret(), { key: 'ArrowRight' });
    expect(overlayAt(10)).not.toBeNull();
    expect(overlayAt(11)).toBeNull();
  });
});

describe('FormBuilder — selection', () => {
  beforeEach(mockHooks);

  /* Word: Shift+click / Ctrl+click extends an object selection. */
  it('shift-clicking a second element extends the selection instead of replacing it', () => {
    render(<FormBuilder />);
    fireEvent.click(overlayAt(10));
    fireEvent.click(overlayAt(60), { shiftKey: true });

    expect(overlays().filter(isSelected)).toHaveLength(2);
  });

  it('ctrl-clicking an already-selected element removes it from the selection', () => {
    render(<FormBuilder />);
    fireEvent.click(overlayAt(10));
    fireEvent.click(overlayAt(60), { ctrlKey: true });
    fireEvent.click(overlayAt(60), { ctrlKey: true });

    expect(overlays().filter(isSelected)).toHaveLength(1);
  });

  it('a plain click after a multi-selection collapses back to one element', () => {
    render(<FormBuilder />);
    fireEvent.click(overlayAt(10));
    fireEvent.click(overlayAt(60), { shiftKey: true });
    fireEvent.click(overlayAt(10));

    expect(overlays().filter(isSelected)).toHaveLength(1);
  });

  /* Ctrl+A is context-sensitive: the document's objects, not the app's DOM. */
  it('Ctrl+A selects every element on the page', () => {
    render(<FormBuilder />);
    fireEvent.click(overlayAt(10));
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });

    expect(overlays().filter(isSelected)).toHaveLength(2);
  });

  it('Ctrl+A inside a caret belongs to the text, not the document', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(10));
    fireEvent.keyDown(caret(), { key: 'a', ctrlKey: true });

    // Still exactly one object involved — the one being typed into.
    expect(overlays().filter(isInvolved)).toHaveLength(1);
  });

  it('Delete removes every element in a multi-selection', () => {
    render(<FormBuilder />);
    fireEvent.click(overlayAt(10));
    fireEvent.click(overlayAt(60), { shiftKey: true });
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(overlays()).toHaveLength(0);
  });
});

describe('FormBuilder — section titles edit in place', () => {
  beforeEach(mockHooks);

  /*
   * The title input used to be permanently mounted on top of the rendered
   * heading, so the FIRST click on a section landed in a text field rather
   * than selecting the section — the same "everything is a form control"
   * confusion, in reverse.
   */
  it('shows the rendered heading, not an input, until the title is double-clicked', () => {
    render(<FormBuilder />);
    // The real <h3> the renderer draws is what the owner sees...
    expect(onPage().getByText('Company Information')).toBeInTheDocument();
    // ...not an input permanently parked on top of it.
    expect(onPage().queryByDisplayValue('Company Information')).not.toBeInTheDocument();

    fireEvent.doubleClick(document.querySelector('[class*="sectionDragHandle"]'));
    expect(onPage().getByDisplayValue('Company Information')).toBeInTheDocument();
  });

  it('selecting a section does not steal focus into its title', () => {
    render(<FormBuilder />);
    fireEvent.click(document.querySelector('[class*="sectionOverlay"]'));

    expect(onPage().queryByDisplayValue('Company Information')).not.toBeInTheDocument();
  });

  /* Word puts the caret in a text box the moment you insert one. */
  it('opens a newly inserted section with its title ready to type', () => {
    render(<FormBuilder />);
    addSection();

    expect(onPage().getByDisplayValue(/new section/i)).toBeInTheDocument();
  });
});

describe('FormBuilder — field labels edit in place', () => {
  beforeEach(mockHooks);

  it('double-clicking a field opens an inline label editor seeded with its label', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(60));

    expect(onPage().getByDisplayValue('Company Name')).toBeInTheDocument();
  });

  /*
   * Word treats a run of typing as ONE undo, not one per character.
   * `useHistory` already coalesces via beginInteraction/endInteraction — the
   * hazard is that FormCanvas ends the gesture group on the window `pointerup`
   * that follows the very click which opened the editor, after which every
   * keystroke pushes its own entry.
   */
  it('treats a run of label typing as a single undo entry', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(60));
    const input = onPage().getByDisplayValue('Company Name');

    fireEvent.change(input, { target: { value: 'Compan' } });
    fireEvent.change(input, { target: { value: 'Comp' } });
    fireEvent.change(input, { target: { value: 'Legal name' } });
    expect(onPage().getByDisplayValue('Legal name')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(onPage().getByText('Company Name')).toBeInTheDocument();
  });

  /*
   * TipTap's own history is switched off (`undoRedo: false`) because the canvas
   * owns undo — but the global handler skips every text-entry target, so Ctrl+Z
   * with a caret on the page reached nothing at all. A contenteditable is the
   * one text target where the document-level undo must still fire.
   */
  it('lets Ctrl+Z through from a caret on the page, since TipTap has no history of its own', () => {
    render(<FormBuilder />);
    addSection();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onPage().getByText(/new section/i)).toBeInTheDocument();

    fireEvent.doubleClick(overlayAt(10));
    fireEvent.keyDown(caret(), { key: 'z', ctrlKey: true });

    expect(onPage().queryByText(/new section/i)).not.toBeInTheDocument();
  });
});
