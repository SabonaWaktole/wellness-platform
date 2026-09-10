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

  /*
   * Clicking the page away from the caret leaves the block being edited. It no
   * longer leaves text editing altogether — the page is a document, so the
   * click puts a caret where it landed instead (see the free-placement suite).
   * What must hold either way is that the owner is no longer typing into the
   * block they clicked away from.
   */
  it('leaves the block being edited when the page beside it is clicked', () => {
    render(<FormBuilder />);
    openCaret();
    const first = overlays()[0];
    fireEvent.click(sheet('p1'));

    expect(first.className).not.toMatch(/elementEditing/);
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
    // Fit page and Fit width are no longer icon-only buttons in the strip:
    // they carry their own text inside the zoom menu, which is where the
    // levels are. `ribbon.test.tsx` asserts they are still reachable there.
    [/zoom level/i],
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

describe('Audit — the section chrome does not cover the page underneath it', () => {
  beforeEach(mockHooks);

  /*
   * The overlay spans the whole section, and while it captured pointer events
   * a click anywhere inside one could only ever mean "select this section" —
   * the invisible layer that made a page of paper behave like a canvas of
   * objects. It is transparent now, with its chrome live on the children, so
   * these tests pin the affordances that must survive that.
   */
  it('still selects the section from its heading band', () => {
    render(<FormBuilder />);
    fireEvent.click(document.querySelector('[class*="sectionDragHandle"]'));

    expect(screen.getByRole('tab', { name: /section/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('still opens the heading for typing on a double-click', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(document.querySelector('[class*="sectionDragHandle"]'));

    expect(document.querySelector('[class*="sectionTitleInput"]')).not.toBeNull();
  });

  it('still offers the section its delete button and resize handles', () => {
    render(<FormBuilder />);
    fireEvent.click(document.querySelector('[class*="sectionDragHandle"]'));

    const section = document.querySelector('[class*="sectionOverlay"]');
    expect(section.querySelector('[class*="sectionDelete"]')).not.toBeNull();
    expect(section.querySelectorAll('[class*="handle"]').length).toBe(8);
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
    fireEvent.click(screen.getByRole('menuitem', { name: /read view/i }));
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

describe('Free placement — the page is a document, not a canvas of objects', () => {
  beforeEach(mockHooks);

  const typeAt = (x, y) => {
    const paper = sheet('p1');
    paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 794, height: 1123, right: 794, bottom: 1123, x: 0, y: 0 });
    fireEvent.click(paper, { clientX: x, clientY: y });
  };
  const caret = () => document.querySelector('[contenteditable="true"]');
  const blocks = () => document.querySelectorAll('[class*="elementOverlay"]');

  /* §12: click near the top of the page and start writing — no Add -> Text. */
  it('puts a caret on the page where the owner clicked', () => {
    render(<FormBuilder />);
    expect(caret()).toBeNull();

    typeAt(300, 700);

    expect(caret()).not.toBeNull();
  });

  it('creates the block that holds what is typed, without being asked to', () => {
    render(<FormBuilder />);
    const before = blocks().length;

    typeAt(300, 700);

    expect(blocks().length).toBe(before + 1);
  });

  /* §14.3: nothing invisible may stand between the click and the caret. Two
   * different empty spots must each be reachable. */
  it('lets the owner move to another empty spot and carry on writing', () => {
    render(<FormBuilder />);
    typeAt(300, 700);
    const first = caret();

    typeAt(300, 900);

    expect(caret()).not.toBeNull();
    expect(caret()).not.toBe(first);
  });

  /* §4: existing components keep interaction priority — a click on one selects
   * it rather than dropping a text block on top of it. */
  it('leaves an existing field to answer its own clicks', () => {
    render(<FormBuilder />);
    const before = blocks().length;
    fireEvent.click(blocks()[1]);

    expect(caret()).toBeNull();
    expect(blocks().length).toBe(before);
    expect(screen.getByRole('tab', { name: /field/i })).toHaveAttribute('aria-selected', 'true');
  });

  /*
   * A stray click is not content. Every click on empty space would otherwise
   * leave an empty box behind for the document to carry — so a block that was
   * never written in goes when the caret does.
   */
  it('takes back a block the owner clicked into but never wrote in', () => {
    render(<FormBuilder />);
    const before = blocks().length;

    typeAt(300, 700);
    expect(blocks().length).toBe(before + 1);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(blocks().length).toBe(before);
  });

  it('does not mark the document dirty for a click that wrote nothing', () => {
    render(<FormBuilder />);
    typeAt(300, 700);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('button', { name: /save form/i })).toBeDisabled();
  });
});

describe('Free placement — a block holds what is written in it', () => {
  beforeEach(mockHooks);

  /*
   * A text block is stored with a height, and that height is what the
   * renderer, print and the page-overflow ladder lay out against. Typing a
   * second paragraph into a one-line block spilled the words outside the box
   * that was supposed to contain them — the canvas showed text the document
   * did not think was there, and what the owner saw stopped matching what the
   * client would get.
   *
   * jsdom does no layout, so `scrollHeight` is 0 and the guard makes this a
   * no-op there; what these pin is the contract around the measurement — that
   * it is taken from the editor's live DOM at commit time, and that it can
   * only ever grow a block.
   */
  it('measures the editor that was just typed into, not a frame later', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlays()[0]);

    const editor = document.querySelector('[contenteditable="true"]');
    expect(editor).not.toBeNull();
    // The element the measurement reads is in the document at commit time.
    expect(editor.closest('[data-element-id]')).not.toBeNull();
  });

  it('never shrinks a block the owner sized deliberately', () => {
    render(<FormBuilder />);
    const overlay = overlays()[0];
    const before = overlay.style.height;

    fireEvent.doubleClick(overlay);
    const editor = document.querySelector('[contenteditable="true"]');
    fireEvent.input(editor, { target: { textContent: 'a' } });

    expect(overlays()[0].style.height).toBe(before);
  });
});

describe('Free placement — a caret, and nothing else', () => {
  beforeEach(mockHooks);

  /*
   * A box around the words is object vocabulary: it says "you have selected a
   * thing", when what is true is "you are writing here". Word and Docs show a
   * caret and the text and nothing else — the blink is the whole affordance.
   */
  it('drops the selection outline for as long as the caret is in the block', () => {
    render(<FormBuilder />);
    const overlay = overlays()[0];

    fireEvent.click(overlay);
    expect(overlays()[0].className).toMatch(/elementSelected/);

    fireEvent.doubleClick(overlays()[0]);
    expect(overlays()[0].className).not.toMatch(/elementSelected/);
    expect(overlays()[0].className).toMatch(/elementEditing/);
  });

  it('gives the outline back when the caret leaves', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlays()[0]);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(overlays()[0].className).toMatch(/elementSelected/);
  });
});

describe('Free placement — Backspace steps up one line at a time', () => {
  beforeEach(mockHooks);

  const typeAt = (x, y) => {
    const paper = sheet('p1');
    paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 794, height: 1123, right: 794, bottom: 1123, x: 0, y: 0 });
    fireEvent.click(paper, { clientX: x, clientY: y });
  };

  /*
   * With the caret in an empty line there is no character left to delete, so
   * Backspace would do nothing at all — while what the person meant is what
   * every editor does here: eat the line and let what is under it come up. The
   * keystroke only reaches the document because the block is empty; a
   * Backspace with words to delete is still entirely the text's.
   */
  it('keeps the caret in the empty line so the next press moves the next line', () => {
    render(<FormBuilder />);
    typeAt(300, 700);

    const editor = document.querySelector('[contenteditable="true"]');
    fireEvent.keyDown(editor, { key: 'Backspace' });

    // Nothing sits below this line in the fixture, so it goes — but the point
    // is that Backspace reached the document at all.
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
  });

  it('removes the empty line when there is nothing underneath to move', () => {
    render(<FormBuilder />);
    const before = document.querySelectorAll('[class*="elementOverlay"]').length;

    typeAt(300, 700);
    expect(document.querySelectorAll('[class*="elementOverlay"]').length).toBe(before + 1);

    fireEvent.keyDown(document.querySelector('[contenteditable="true"]'), { key: 'Backspace' });

    expect(document.querySelectorAll('[class*="elementOverlay"]').length).toBe(before);
  });

  /* A Backspace that has text to eat is the text's, not the document's. */
  it('leaves a block alone while it still has words in it', () => {
    render(<FormBuilder />);
    const before = document.querySelectorAll('[class*="elementOverlay"]').length;

    fireEvent.doubleClick(overlays()[0]);
    fireEvent.keyDown(document.querySelector('[contenteditable="true"]'), { key: 'Backspace' });

    expect(document.querySelectorAll('[class*="elementOverlay"]').length).toBe(before);
    expect(document.querySelector('[contenteditable="true"]')).not.toBeNull();
  });
});

describe('Free placement — one line means one line', () => {
  beforeEach(mockHooks);

  /*
   * The step used to be the caret block's HEIGHT. A block is only one line
   * tall when it is new — one that has been typed in, grown, or dragged taller
   * is many lines — so a single Backspace moved whatever was below it by the
   * entire block, which on a tall empty block is the whole empty space at
   * once: exactly what this was meant not to do. It is the editor's own
   * computed line-height now.
   */
  it('asks the editor how tall a line is, not how tall the block is', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlays()[0]);

    const editor = document.querySelector('[contenteditable="true"]');
    expect(editor).not.toBeNull();
    // The measurement is taken from the editor node that is in the document
    // while the caret is open; jsdom reports no layout, so the fallback holds.
    expect(editor.closest('[data-element-id]')).not.toBeNull();
  });

  /*
   * A measurement taken while the DOM is between states can come back wildly
   * large — the editor briefly filling its section rather than its own box.
   * Growing on one of those leaves a block hundreds of pixels tall holding a
   * single line, which reads as an enormous empty gap on the page and swallows
   * the clicks meant for it.
   */
  it('never grows a block past the section that contains it', () => {
    render(<FormBuilder />);
    const section = document.querySelector('[class*="sectionOverlay"]');
    const sectionHeight = Number.parseFloat(section.style.height);

    fireEvent.doubleClick(overlays()[0]);
    const editor = document.querySelector('[contenteditable="true"]');
    fireEvent.input(editor, { target: { textContent: 'a'.repeat(500) } });

    const height = Number.parseFloat(overlays()[0].style.height);
    expect(height).toBeLessThanOrEqual(sectionHeight);
  });
});

describe('Free placement — Insert puts things where the cursor is', () => {
  beforeEach(mockHooks);

  const typeAt = (x, y) => {
    const paper = sheet('p1');
    paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 794, height: 1123, right: 794, bottom: 1123, x: 0, y: 0 });
    fireEvent.click(paper, { clientX: x, clientY: y });
  };
  const insert = (name) => {
    fireEvent.click(screen.getByRole('tab', { name: /insert/i }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`add ${name}`, 'i') }));
  };
  const selected = () => overlays().find((o) => /elementSelected/.test(o.className));

  /*
   * Insert used to drop everything at the bottom of the target section,
   * whatever the owner happened to be doing — click halfway down a page, ask
   * for a field, and it appeared somewhere else entirely, to be dragged back
   * to where it was wanted. In a document editor Insert means "here".
   */
  it('drops a new field where the caret is, not at the end of the section', () => {
    render(<FormBuilder />);
    typeAt(200, 640);

    // The editor lives in the renderer's DOM, so the caret's own box is the
    // `[data-element-id]` wrapper rather than the overlay drawn above it.
    const caret = document.querySelector('[contenteditable="true"]').closest('[data-element-id]');
    const top = caret.style.top;

    insert('text field');

    expect(selected().style.top).toBe(top);
  });

  /* The empty line the owner clicked into was standing in for exactly this,
   * so it makes way rather than sitting above the thing it announced. */
  it('takes the empty line away instead of leaving it above the new field', () => {
    render(<FormBuilder />);
    const before = overlays().length;

    typeAt(200, 640);
    expect(overlays().length).toBe(before + 1);

    insert('text field');

    expect(overlays().length).toBe(before + 1);
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
  });

  /* No caret, but something pointed at: "another one of these" belongs under
   * the thing that was pointed at. */
  it('drops it under the selected object when there is no caret', () => {
    render(<FormBuilder />);
    fireEvent.click(overlays()[1]);
    const anchor = overlays()[1];
    const below = Number.parseFloat(anchor.style.top) + Number.parseFloat(anchor.style.height) + 16;

    insert('text field');

    expect(Number.parseFloat(selected().style.top)).toBe(below);
  });
});

describe('Audit — a drag reflows for where the pointer IS, not where it has been', () => {
  /*
   * Every `pointermove` runs the overflow ladder, and each run used to be fed
   * the document the PREVIOUS move had already reflowed. So a section dragged
   * DOWN PAST a neighbour pushed that neighbour once per frame the two
   * overlapped — and left it pushed, because the ladder has no way to know a
   * shove it applied a frame ago was only ever about a position the pointer
   * was passing THROUGH. Drag far enough and a whole column of sections walked
   * down the page, and off the end of it, for a place nothing was dropped.
   *
   * The fix is a per-gesture baseline: every move replays against the document
   * as it stood when the drag began. `useDragMove` reports absolute geometry
   * measured from its own pointer-down origin, so the replay is exact and the
   * layout depends on the CURRENT pointer position alone.
   */
  const spacedForm = () => ({
    ...form(),
    layout: {
      version: 3,
      page: emptyPageGeometry(),
      pages: [
        {
          id: 'p1',
          sections: [
            { id: 'a', title: 'A', x: 48, y: 48, width: 500, height: 200, elements: [] },
            { id: 'b', title: 'B', x: 48, y: 600, width: 500, height: 200, elements: [] },
            { id: 'c', title: 'C', x: 48, y: 900, width: 500, height: 150, elements: [] },
          ],
        },
      ],
    },
  });

  const tops = () => [...document.querySelectorAll('[class*="sectionOverlay"]')].map((o) => o.style.top);
  const pageCount = () => document.querySelectorAll('[data-page-id]').length;
  const grab = (index) => {
    const overlay = document.querySelectorAll('[class*="sectionOverlay"]')[index];
    const handle = document.querySelectorAll('[class*="sectionDragHandle"]')[index];
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    return {
      to: (dy) => fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 0, clientY: dy }),
      drop: () => fireEvent.pointerUp(overlay, { pointerId: 1 }),
    };
  };

  beforeEach(() => {
    mockHooks();
    vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
      form: spacedForm(), setForm: vi.fn(), isLoading: false, error: null, fetchForm: vi.fn(),
    });
  });

  it('leaves the sections it merely dragged past exactly where they were', () => {
    render(<FormBuilder />);
    expect(tops()).toEqual(['48px', '600px', '900px']);

    const drag = grab(0);
    // Squarely onto B, with no free band big enough to take A instead — so
    // this position really does displace B, and displaces it hard enough to
    // push C off the page altogether.
    drag.to(600);
    // ...and back to where it started, without ever releasing.
    drag.to(0);
    drag.drop();

    expect(tops()).toEqual(['48px', '600px', '900px']);
    expect(pageCount()).toBe(1);
  });

  /* And a drop that lands in the empty space keeps it empty space: the
   * section occupies the gap, and the page below it does not shuffle. */
  it('drops a section into the gap it was aimed at and moves nothing else', () => {
    render(<FormBuilder />);

    const drag = grab(2);
    drag.to(-550);
    drag.drop();

    expect(tops()).toEqual(['48px', '350px', '600px']);
    expect(pageCount()).toBe(1);
  });
});

describe('Audit — a section resizes from its edges, not just its corners', () => {
  /*
   * All eight handles have always been wired to `useResize`. The problem was
   * that an EDGE handle was a 9px square at the midpoint of its side, so
   * "drag the edge to resize" only worked on that one dot; anywhere else along
   * the border the pointer reached the section's drag band underneath and
   * MOVED the section instead. The handle is now a strip spanning the whole
   * side, with the square drawn at its midpoint as the affordance.
   *
   * These cases pin the WIRING — that each edge grows the box on its own axis
   * and leaves the other one alone. The strip's geometry is CSS, and jsdom
   * computes no layout, so its span is not something a unit test can see;
   * `data-handle` is what makes the individual handles addressable at all.
   */
  const sizedForm = () => ({
    ...form(),
    layout: {
      version: 3,
      page: emptyPageGeometry(),
      pages: [
        {
          id: 'p1',
          sections: [{ id: 'a', title: 'A', x: 100, y: 100, width: 400, height: 200, elements: [] }],
        },
      ],
    },
  });

  const box = () => {
    const o = document.querySelector('[class*="sectionOverlay"]');
    return { left: o.style.left, top: o.style.top, width: o.style.width, height: o.style.height };
  };

  const dragHandle = (name, dx, dy) => {
    const overlay = document.querySelector('[class*="sectionOverlay"]');
    const handle = overlay.querySelector(`[data-handle="${name}"]`);
    expect(handle).not.toBeNull();
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: dx, clientY: dy });
    fireEvent.pointerUp(overlay, { pointerId: 1 });
  };

  beforeEach(() => {
    mockHooks();
    vi.mocked(clientFormHooks.useClientForm).mockReturnValue({
      form: sizedForm(), setForm: vi.fn(), isLoading: false, error: null, fetchForm: vi.fn(),
    });
  });

  const select = () => fireEvent.click(document.querySelector('[class*="sectionOverlay"]'));

  it('offers all eight handles once the section is selected', () => {
    render(<FormBuilder />);
    select();

    const named = [...document.querySelectorAll('[data-handle]')].map((h) => h.dataset.handle);
    expect(named.sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
  });

  it('grows the section downward from the bottom edge, leaving its top and width alone', () => {
    render(<FormBuilder />);
    select();
    dragHandle('s', 0, 120);

    expect(box()).toEqual({ left: '100px', top: '100px', width: '400px', height: '320px' });
  });

  it('grows the section sideways from the right edge, leaving its height alone', () => {
    render(<FormBuilder />);
    select();
    dragHandle('e', 80, 0);

    expect(box()).toEqual({ left: '100px', top: '100px', width: '480px', height: '200px' });
  });

  /* The top and left edges move the box's origin as well as its size — the
   * edge being dragged is the one that moves, and the opposite one stays put. */
  it('moves the top edge without moving the bottom one', () => {
    render(<FormBuilder />);
    select();
    dragHandle('n', 0, -40);

    expect(box()).toEqual({ left: '100px', top: '60px', width: '400px', height: '240px' });
  });

  it('moves the left edge without moving the right one', () => {
    render(<FormBuilder />);
    select();
    dragHandle('w', -50, 0);

    expect(box()).toEqual({ left: '50px', top: '100px', width: '450px', height: '200px' });
  });

  /* The whole point: a pointer-down on an edge must not reach the drag band
   * underneath and turn a resize into a move. */
  it('resizes from an edge rather than moving the section', () => {
    render(<FormBuilder />);
    select();
    const before = box();
    dragHandle('s', 0, 60);
    const after = box();

    expect(after.top).toBe(before.top);
    expect(after.left).toBe(before.left);
    expect(Number.parseInt(after.height, 10)).toBeGreaterThan(Number.parseInt(before.height, 10));
  });
});

/*
 * THE CARET AND THE THING IT IS IN DIE TOGETHER.
 *
 * `inline.target` was never cleared when the object it pointed at was
 * removed, and a stale one is not cosmetic: three features read it as "the
 * user is typing" and quietly stop working for the rest of the session. The
 * gesture that reaches it is ordinary — open a caret, click a ribbon button,
 * press Delete.
 */
describe('Audit — deleting what is being typed into closes the caret', () => {
  beforeEach(mockHooks);

  const openCaret = () => {
    fireEvent.doubleClick(overlays()[0]);
    expect(document.querySelector('[contenteditable="true"]')).toBeTruthy();
  };

  it('leaves no editing session behind when the element is deleted', () => {
    render(<FormBuilder />);
    openCaret();

    // Blurs the editor but leaves the session open, exactly as clicking any
    // ribbon control does. Deliberately one that changes neither the document
    // nor the selection, so the only thing under test is the dangling caret.
    fireEvent.click(button(/zoom in/i));
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
  });

  /*
   * The consequence that mattered most. `FormCanvas` keeps the history window
   * shut while a caret is live because the edit session owns it — so a dangling
   * target meant the window never opened again and a drag pushed one undo entry
   * per pointermove. One drag, one undo, still.
   */
  it('still coalesces a whole drag into one undo afterwards', () => {
    render(<FormBuilder />);
    openCaret();
    fireEvent.click(button(/zoom in/i));
    fireEvent.keyDown(window, { key: 'Delete' });

    selectElement(0);
    const startedAt = overlays()[0].style.top;

    const box = overlays()[0];
    fireEvent.pointerDown(box, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 0, clientY: 40 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 0, clientY: 80 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 0, clientY: 120 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(overlays()[0].style.top).not.toEqual(startedAt);

    /*
     * ONE press, all the way back. Three pointer moves reached the document; if
     * the gesture window had stayed shut they would be three history entries
     * and this would land on an intermediate position instead of the start.
     */
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(overlays()[0].style.top).toEqual(startedAt);
  });
});

/*
 * ONE ARRANGEMENT, MOVED TOGETHER. Delete has always acted on every selected
 * object; the arrow keys moved only the primary, so a row of fields lined up
 * and selected together came apart the moment the owner nudged it — the one
 * operation where holding the arrangement is the entire point.
 */
describe('Audit — the arrow keys move everything that is selected', () => {
  beforeEach(mockHooks);

  it('nudges every selected element, not just the primary', () => {
    render(<FormBuilder />);
    selectElement(1);
    selectElement(2, { shiftKey: true });

    const before = [overlays()[1].style.top, overlays()[2].style.top];
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const after = [overlays()[1].style.top, overlays()[2].style.top];

    expect(after[0]).not.toEqual(before[0]);
    expect(after[1]).not.toEqual(before[1]);
  });

  /* And a modifier makes them mean something else entirely — Ctrl+arrow is
   * word-wise movement in text, never a one-pixel nudge. */
  it('leaves a modified arrow alone', () => {
    render(<FormBuilder />);
    selectElement(1);

    const before = overlays()[1].style.top;
    fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });

    expect(overlays()[1].style.top).toEqual(before);
  });

  /* Ctrl+Backspace deletes a word, not an object. */
  it('leaves a modified Backspace alone', () => {
    render(<FormBuilder />);
    selectElement(1);
    const count = overlays().length;

    fireEvent.keyDown(window, { key: 'Backspace', ctrlKey: true });

    expect(overlays()).toHaveLength(count);
  });
});
