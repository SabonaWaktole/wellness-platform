// @ts-nocheck
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FormBuilder } from './FormBuilder';
import * as clientFormHooks from '../../../hooks/useClientForm';
import * as clientsHooks from '../../../hooks/useClients';
import { emptyPageGeometry } from '../../../types/form';

/*
 * THE INTERACTION AUDIT.
 *
 * The other canvas suites each test one feature. This one tests the seams
 * BETWEEN features — the places where two independently correct behaviours
 * meet and one of them wins wrongly. Every case here started as a defect
 * found by walking the running builder control by control:
 *
 *   - a command in the ribbon that the same keystroke could already do, but
 *     which the ribbon disabled or aimed at the wrong object;
 *   - a click inside a live caret that the sheet underneath answered;
 *   - a key that two handlers both claimed.
 *
 * They are grouped by the seam rather than by the component, because that is
 * what makes a regression here legible: "the ribbon and the keyboard disagree
 * about Copy" is the bug, not "HomeTab passes canCut".
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
            height: 300,
            elements: [
              { id: 't1', type: 'TEXT', x: 10, y: 10, width: 300, height: 40, content: textDoc('Hello paper') },
              {
                id: 'f1',
                type: 'INPUT',
                x: 10,
                y: 60,
                width: 200,
                height: 60,
                field: { key: 'first_name', label: 'First name', type: 'TEXT', required: false },
              },
              {
                id: 'f2',
                type: 'INPUT',
                x: 10,
                y: 140,
                width: 200,
                height: 60,
                field: { key: 'last_name', label: 'Last name', type: 'TEXT', required: false },
              },
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

/** Overlays in document order: t1, f1, f2. */
const overlays = () => [...document.querySelectorAll('[class*="elementOverlay"]')];
const sectionOverlay = () => document.querySelector('[class*="sectionOverlay"]');
const sheet = (pageId) => document.querySelector(`[data-page-id="${pageId}"] [class*="sheet"]`);
const tab = (name) => screen.getByRole('tab', { name });
const button = (name) => screen.getByRole('button', { name });

const selectElement = (index, options = {}) => fireEvent.click(overlays()[index], options);
const selectSection = () => fireEvent.click(sectionOverlay());

const openHome = () => fireEvent.click(tab(/home/i));

describe('Audit — the ribbon and the keyboard agree about the clipboard', () => {
  beforeEach(mockHooks);

  /*
   * Ctrl+C/X/D have worked on a whole section since the clipboard grew
   * `copySections`. The Home tab asked `sel.kind === 'element'` before
   * enabling any of the three, so the same three commands were greyed out for
   * exactly the selection the keyboard handled — a control that lies about
   * what it can do.
   */
  it('enables Cut, Copy and Duplicate for a selected section, as Ctrl+X/C/D already are', () => {
    render(<FormBuilder />);
    selectSection();
    openHome();

    expect(button(/^cut$/i)).toBeEnabled();
    expect(button(/^copy$/i)).toBeEnabled();
    expect(button(/^duplicate$/i)).toBeEnabled();
  });

  it('duplicates a section from Home, not just from Ctrl+D', () => {
    render(<FormBuilder />);
    selectSection();
    openHome();
    fireEvent.click(button(/^duplicate$/i));

    expect(document.querySelectorAll('[class*="sectionOverlay"]')).toHaveLength(2);
  });

  it('copies a section from Home and pastes it onto the page being worked on', () => {
    render(<FormBuilder />);
    selectSection();
    openHome();
    fireEvent.click(button(/^copy$/i));

    // Move to page 3 and paste there. The keyboard path passes the target page;
    // the ribbon dropped it and always landed the section on page 1.
    fireEvent.click(button(/go to page 3/i));
    fireEvent.click(tab(/home/i));
    fireEvent.click(button(/^paste$/i));

    expect(sheet('p3').querySelectorAll('[class*="sectionOverlay"]')).toHaveLength(1);
  });

  /*
   * A section in the clipboard needs a PAGE, not a section, to land on — which
   * is why Ctrl+V works with nothing selected. Home's Paste required a selected
   * section for both kinds of payload, so the one command that could still act
   * was the one shown as unavailable.
   */
  it('offers Paste for a copied section even with nothing selected', () => {
    render(<FormBuilder />);
    selectSection();
    openHome();
    fireEvent.click(button(/^copy$/i));
    fireEvent.keyDown(window, { key: 'Escape' });
    openHome();

    expect(button(/^paste$/i)).toBeEnabled();
  });

  /* The mirror image: an ELEMENT payload really does need a section, and the
   * button must say so rather than failing silently when clicked. */
  it('withholds Paste for copied elements while no section can receive them', () => {
    render(<FormBuilder />);
    selectElement(1);
    openHome();
    fireEvent.click(button(/^copy$/i));
    fireEvent.keyDown(window, { key: 'Escape' });
    openHome();

    expect(button(/^paste$/i)).toBeDisabled();
  });
});

describe('Audit — the contextual tab acts on the whole selection', () => {
  beforeEach(mockHooks);

  it('duplicates a section from its own tab', () => {
    render(<FormBuilder />);
    selectSection();
    fireEvent.click(tab(/section/i));
    fireEvent.click(button(/^duplicate$/i));

    expect(document.querySelectorAll('[class*="sectionOverlay"]')).toHaveLength(2);
  });

  /*
   * Delete from the contextual tab removed only the primary object while the
   * ribbon in front of the user said "2 selected" through its enabled align
   * buttons. Del has always removed all of them.
   */
  it('deletes every selected element, matching Del', () => {
    render(<FormBuilder />);
    selectElement(1);
    selectElement(2, { shiftKey: true });
    fireEvent.click(tab(/field/i));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(overlays()).toHaveLength(1);
  });
});

describe('Audit — the right-click menu acts on the whole selection', () => {
  beforeEach(mockHooks);

  /*
   * `handleContextMenu` deliberately KEEPS a multi-selection when the
   * right-click lands on one of its members, precisely so "delete these" works
   * from the menu. The menu's own delete then removed `sel.ids[0]` only.
   */
  it('deletes every selected element from the menu', () => {
    render(<FormBuilder />);
    selectElement(1);
    selectElement(2, { shiftKey: true });
    fireEvent.contextMenu(overlays()[2]);

    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /delete/i }));

    expect(overlays()).toHaveLength(1);
  });
});

describe('Audit — a live caret owns its own clicks', () => {
  beforeEach(mockHooks);

  const openCaret = () => {
    fireEvent.doubleClick(overlays()[0]);
    return document.querySelector('[contenteditable="true"]');
  };

  /*
   * The sheet answers a click by selecting its page. While a caret is open the
   * element overlay is pointer-transparent, so every click INSIDE the editor
   * reached the sheet underneath: the object being typed into was deselected
   * mid-word, its contextual tab vanished, and the format pane collapsed —
   * a layout jump caused by nothing but placing the caret.
   */
  it('keeps the object selected when the caret inside it is clicked', () => {
    render(<FormBuilder />);
    const editor = openCaret();
    fireEvent.click(editor);

    expect(screen.queryByRole('tab', { name: /text box/i })).toBeInTheDocument();
    expect(document.querySelector('[contenteditable="true"]')).not.toBeNull();
  });

  it('keeps the caret open when the label input inside a field is clicked', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlays()[1]);
    const input = document.querySelector('[class*="labelInput"]');
    expect(input).not.toBeNull();
    fireEvent.click(input);

    expect(document.querySelector('[class*="labelInput"]')).toBe(input);
  });

  /* Clicking the page AWAY from the caret is the ordinary way out of text
   * editing in any document editor; only Escape used to do it here. */
  it('closes the caret when the page beside it is clicked', () => {
    render(<FormBuilder />);
    openCaret();
    fireEvent.click(sheet('p1'));

    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
  });

  /* The browser's own menu wins inside a caret (spell-check, plain paste) —
   * but the sheet must not quietly reselect itself on the way past. */
  it('does not reselect the page when the caret is right-clicked', () => {
    render(<FormBuilder />);
    openCaret();
    fireEvent.contextMenu(document.querySelector('[contenteditable="true"]'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /text box/i })).toBeInTheDocument();
  });
});

describe('Audit — page navigation moves the document position', () => {
  beforeEach(mockHooks);

  /*
   * The rail highlighted `targetPageId`, which is derived from the SELECTION
   * when there is one. With a field selected on page 1, clicking page 3 in the
   * rail set `activePageId` and nothing else: the highlight snapped straight
   * back, the status bar still read "Page 1 of 3", and Layout's page commands
   * kept acting on page 1.
   */
  it('follows the rail to another page even while an object is selected', () => {
    render(<FormBuilder />);
    selectElement(1);
    fireEvent.click(button(/go to page 3/i));

    expect(screen.getByText(/page 3 of 3/i)).toBeInTheDocument();
  });
});

describe('Audit — one keystroke, one handler', () => {
  beforeEach(mockHooks);

  /*
   * `Tabs` moves between ribbon tabs with the arrow keys, as the ARIA pattern
   * requires. The canvas nudges the selected object with the same keys. With
   * focus on a tab both fired: choosing a tab with the keyboard moved the
   * selected field a pixel at a time, and the document was dirty for it.
   */
  it('does not nudge the selected object while the arrow keys are moving ribbon focus', () => {
    render(<FormBuilder />);
    selectElement(1);
    const overlay = overlays()[1];
    const before = overlay.style.top;

    const insert = tab(/insert/i);
    insert.focus();
    fireEvent.keyDown(insert, { key: 'ArrowDown' });

    // The keystroke really did reach the tab strip...
    expect(screen.getByRole('tab', { name: /home/i })).toHaveAttribute('aria-selected', 'true');
    // ...and stopped there.
    expect(overlays()[1].style.top).toBe(before);
  });

  it('still nudges when the arrow key belongs to the document', () => {
    render(<FormBuilder />);
    selectElement(1);
    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(overlays()[1].style.top).toBe('61px');
  });
});

describe('Audit — controls tell the truth about being unavailable', () => {
  beforeEach(mockHooks);

  /* The format pane is a grid COLUMN. Rendering its empty shell with nothing
   * selected left a third child in a two-track grid, which wrapped onto a row
   * of its own and took half the canvas height with it. */
  it('renders no format pane column while nothing is selected', () => {
    render(<FormBuilder />);
    expect(document.querySelector('[class*="sidebar"]')).toBeNull();
  });

  it('renders the format pane column once something is selected', () => {
    render(<FormBuilder />);
    selectElement(1);
    expect(document.querySelector('[class*="sidebar"]')).not.toBeNull();
  });

  /* Zoom is a ladder with ends. At either end the button stayed lit and did
   * nothing when pressed. */
  it('disables zoom out at the bottom of the ladder', () => {
    render(<FormBuilder />);
    for (let i = 0; i < 6; i += 1) fireEvent.click(button(/zoom out/i));

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(button(/zoom out/i)).toBeDisabled();
    expect(button(/zoom in/i)).toBeEnabled();
  });

  it('disables zoom in at the top of the ladder', () => {
    render(<FormBuilder />);
    for (let i = 0; i < 6; i += 1) fireEvent.click(button(/zoom in/i));

    expect(screen.getByText('300%')).toBeInTheDocument();
    expect(button(/zoom in/i)).toBeDisabled();
  });

  /* In the sidebar the Add menu carried a line explaining that a section has
   * to be selected first. The ribbon dropped the hint and kept the disabled
   * buttons, leaving no way to find out why they were grey. */
  it('explains on the Insert tab why a component cannot be added yet', () => {
    render(<FormBuilder />);
    fireEvent.click(tab(/insert/i));

    const dateButton = screen.getByRole('button', { name: /add date/i });
    expect(dateButton).toBeDisabled();
    expect(dateButton).toHaveAttribute('title', expect.stringMatching(/section/i));
  });
});

describe('Audit — icon-only controls carry a tooltip', () => {
  beforeEach(mockHooks);

  /*
   * §34 asks for a correct tooltip on every button. The quick-access,
   * zoom and page-rail clusters were icon-only with an `aria-label` and
   * nothing else, so a sighted user hovering them learned nothing.
   */
  it.each([
    [/^undo$/i],
    [/^redo$/i],
    [/zoom in/i],
    [/zoom out/i],
    [/fit page/i],
    [/fit width/i],
    [/go to page 2/i],
    [/duplicate page 2/i],
    [/delete page 2/i],
  ])('gives %s a hover tooltip', (name) => {
    render(<FormBuilder />);
    expect(button(name)).toHaveAttribute('title');
  });
});

describe('Audit — text editing never moves the object it is inside', () => {
  beforeEach(mockHooks);

  /*
   * A section's heading band is its drag handle. It stayed live while the
   * heading was being typed into, so a pointer-down anywhere on the band —
   * including the margin either side of the input — dragged the section out
   * from under the caret.
   */
  it('suspends the section drag handle while its title is being typed into', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(document.querySelector('[class*="sectionDragHandle"]'));
    expect(document.querySelector('[class*="sectionTitleInput"]')).not.toBeNull();

    const overlay = sectionOverlay();
    const before = overlay.style.left;
    const handle = document.querySelector('[class*="sectionDragHandle"]');
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 120, clientY: 0 });

    expect(sectionOverlay().style.left).toBe(before);
  });
});

describe('Audit — an autosave is an acknowledgement, not a reload', () => {
  beforeEach(mockHooks);

  /**
   * Re-mocks `useClientForm` so `setForm` actually replaces the form, the way
   * the real hook does. With the default `setForm: vi.fn()` the form never
   * changes, the reset effect never re-runs, and this entire class of bug is
   * invisible to a test — which is exactly why it survived to be found by hand
   * in the running builder.
   */
  const statefulForm = () => {
    let current = form();
    vi.mocked(clientFormHooks.useClientForm).mockImplementation(() => ({
      form: current,
      setForm: (f) => { current = f; },
      isLoading: false,
      error: null,
      fetchForm: vi.fn(),
    }));
    vi.mocked(clientFormHooks.useUpdateFormLayout).mockReturnValue({
      // A save answers with the stored form, version bumped.
      updateLayout: vi.fn(async () => ({ ...current, version: current.version + 1 })),
      isSaving: false,
      error: null,
      hasConflict: false,
      clearError: vi.fn(),
    });
    return { load: (f) => { current = f; } };
  };

  /*
   * THE WORST DEFECT THE AUDIT FOUND.
   *
   * The effect that throws away local state when the form is replaced was
   * keyed to `form.version`. A save answers with the version bumped, so the
   * builder read its own acknowledgement as "the document was replaced from
   * the server" and reset to it — about a second after the owner started
   * typing. The caret closed mid-word, the selection cleared under them, and
   * `history.reset` emptied the undo stack, so Undo went dead after every
   * single autosave.
   */
  it('keeps the caret, the selection and the undo history across an autosave', async () => {
    vi.useFakeTimers();
    statefulForm();
    const { rerender } = render(<FormBuilder />);

    fireEvent.doubleClick(overlays()[0]);
    expect(document.querySelector('[contenteditable="true"]')).not.toBeNull();

    fireEvent.click(overlays()[1]);
    fireEvent.keyDown(window, { key: 'ArrowDown' }); // an edit, so there is something to save
    const undoBefore = screen.getByRole('button', { name: /^undo$/i });
    expect(undoBefore).toBeEnabled();

    await vi.advanceTimersByTimeAsync(4000);
    rerender(<FormBuilder />);

    expect(screen.getByRole('button', { name: /^undo$/i })).toBeEnabled();
    expect(overlays()[1].className).toMatch(/elementSelected/);
    vi.useRealTimers();
  });

  /* The other half of the contract: a version this session did NOT produce is
   * a real reload — a conflict recovery, or another tab's save — and must
   * still replace local state wholesale. */
  it('still resets local state when the form is genuinely replaced', async () => {
    const { load } = statefulForm();
    const { rerender } = render(<FormBuilder />);

    fireEvent.click(overlays()[1]);
    expect(overlays()[1].className).toMatch(/elementSelected/);

    load({ ...form(), version: 99 });
    rerender(<FormBuilder />);

    expect(document.querySelector('[class*="elementSelected"]')).toBeNull();
  });
});

describe('Audit — the section chrome does not cover the caret inside it', () => {
  beforeEach(mockHooks);

  /*
   * `CanvasElement` turns itself pointer-transparent while it is being typed
   * into, so the editor underneath receives the clicks. A TEXT block's editor
   * lives in the RENDERER's DOM, which the section's chrome is also drawn over
   * — and nothing made the section step aside. `elementFromPoint` at the caret
   * returned `.sectionOverlay`, so clicking to place the cursor selected the
   * surrounding section and closed the editor: the owner could type into a
   * text block but could not click their own words.
   *
   * jsdom does not hit-test, so the assertion is on the contract that makes
   * hit-testing come out right — and on the chrome staying live as children.
   */
  it('lets pointer events through the section while a caret is open inside it', () => {
    render(<FormBuilder />);
    const section = document.querySelector('[class*="sectionOverlay"]');
    expect(section.className).not.toMatch(/sectionPassThrough/);

    fireEvent.doubleClick(overlays()[0]);
    expect(document.querySelector('[contenteditable="true"]')).not.toBeNull();

    expect(document.querySelector('[class*="sectionOverlay"]').className).toMatch(/sectionPassThrough/);
  });

  it('takes the section chrome out of the way again once the caret closes', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlays()[0]);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(document.querySelector('[class*="sectionOverlay"]').className).not.toMatch(/sectionPassThrough/);
  });

  /* Editing a section's own HEADING is not the same thing: the heading input
   * is the section's own child, so the box must keep answering for it. */
  it('keeps the section solid while its own heading is being typed into', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(document.querySelector('[class*="sectionDragHandle"]'));
    expect(document.querySelector('[class*="sectionTitleInput"]')).not.toBeNull();

    expect(document.querySelector('[class*="sectionOverlay"]').className).not.toMatch(/sectionPassThrough/);
  });
});

describe('Audit — the tab order belongs to the editor, not to the form being drawn', () => {
  beforeEach(mockHooks);

  /*
   * The canvas renders REAL inputs so that it and the filled form can never
   * disagree about how a field looks. The author cannot fill them — the
   * selection overlay takes the clicks — but they were still in the tab
   * order: on a modest form, two dozen dead stops between the page rail and
   * the format pane, each one focusable and none of them doing anything.
   */
  it('keeps the preview controls out of reach of the keyboard', () => {
    render(<FormBuilder />);
    const wrappers = [...document.querySelectorAll('[data-element-id]')];
    expect(wrappers.length).toBeGreaterThan(0);
    expect(wrappers.every((w) => w.hasAttribute('inert'))).toBe(true);
  });

  /* The element being typed into is the exception: its editor has to keep
   * both focus and pointer events. */
  it('releases the element being edited so its caret can be reached', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlays()[0]);

    const editor = document.querySelector('[contenteditable="true"]');
    expect(editor).not.toBeNull();
    expect(editor.closest('[data-element-id]').hasAttribute('inert')).toBe(false);
    expect(document.querySelectorAll('[data-element-id]:not([inert])')).toHaveLength(1);
  });
});

describe('Audit — the read view shows the form, not a printout of it', () => {
  beforeEach(mockHooks);

  /*
   * "Read view" answers the question "what will my client get?", and a form's
   * answer to that is a form. It rendered `mode="print"` — the question a
   * printer asks — so every field came out as a label over an em dash and the
   * owner could not tell whether what they had built was fillable at all.
   *
   * It is the same mode and the same renderer the public `/f/` page uses,
   * which is what makes it a preview rather than an impression of one.
   */
  const openReadView = () => {
    fireEvent.click(screen.getByRole('button', { name: /^file$/i }));
    fireEvent.click(screen.getByRole('button', { name: /read view/i }));
  };

  it('gives every field a working control, not a dash', () => {
    render(<FormBuilder />);
    openReadView();

    const preview = document.querySelector('[data-print-document]');
    expect(preview).not.toBeNull();
    expect(preview.querySelectorAll('input, select, textarea').length).toBeGreaterThan(0);
    expect(preview.textContent).not.toMatch(/—/);
  });

  it('leaves the controls usable, since a client will use them', () => {
    render(<FormBuilder />);
    openReadView();

    const controls = [...document.querySelectorAll('[data-print-document] input, [data-print-document] select')];
    expect(controls.every((c) => !c.disabled && !c.readOnly)).toBe(true);
    expect(controls.every((c) => !c.closest('[inert]'))).toBe(true);
  });

  /* The canvas keeps its preview controls out of reach — there the author is
   * laying the form out, not filling it. The two must not be confused. */
  it('still keeps the editing canvas out of the tab order', () => {
    render(<FormBuilder />);
    expect([...document.querySelectorAll('[data-element-id]')].every((w) => w.hasAttribute('inert'))).toBe(true);
  });
});
