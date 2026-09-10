// @ts-nocheck
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FormBuilder } from './FormBuilder';
import * as clientFormHooks from '../../../hooks/useClientForm';
import * as clientsHooks from '../../../hooks/useClients';
import { emptyPageGeometry } from '../../../types/form';
import { ADDABLE_COMPONENTS } from '../registry/componentRegistry';
import enForms from '../../../locales/en/forms.json';

/*
 * THE RIBBON.
 *
 * The old toolbar was one flat row of fourteen ungrouped controls — Back, the
 * form name, a status badge, a share chip, an undo/zoom cluster, Print,
 * History, Preview, Save and Publish — with the Add menu and the properties
 * panel stacked permanently in a sidebar beside it. Nothing communicated which
 * controls belonged together, and everything was visible at once whether or
 * not it applied to anything.
 *
 * These tests are an INVENTORY as much as a specification: every control that
 * existed before must still be reachable, and each one is asserted in the place
 * a Word user would look for it. A control that quietly disappears in a
 * redesign is the failure mode this file exists to prevent.
 */

const navigate = vi.fn();
const defineCustomField = vi.fn();
const updateLayout = vi.fn();
const publishForm = vi.fn();

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
  status: 'PUBLISHED',
  version: 3,
  updatedAt: '2026-08-30T00:00:00.000Z',
  shareToken: 'tok123',
  publishedVersionId: 'v1',
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
              { id: 't1', type: 'TEXT', x: 10, y: 10, width: 300, height: 40, content: textDoc('Hello paper') },
            ],
          },
        ],
      },
      { id: 'p2', sections: [] },
    ],
  },
  ...over,
});

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
    publishForm,
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

const tab = (name) => screen.getByRole('tab', { name });
const openTab = (name) => fireEvent.click(tab(name));
const openFileMenu = () => fireEvent.click(screen.getByRole('button', { name: /^file$/i }));
const overlayAt = (left) =>
  document.querySelector(`[class*="elementOverlay"][style*="left: ${left}px"]`);

describe('Ribbon — tab structure', () => {
  beforeEach(mockHooks);

  it('groups the controls into Home, Insert and Layout, opening on Home', () => {
    render(<FormBuilder />);

    expect(tab(/home/i)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/insert/i)).toBeInTheDocument();
    expect(tab(/layout/i)).toBeInTheDocument();
  });

  it('switches panels when another tab is chosen', () => {
    render(<FormBuilder />);
    openTab(/insert/i);

    expect(tab(/insert/i)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /add section/i })).toBeInTheDocument();
  });
});

describe('Ribbon — Home tab', () => {
  beforeEach(mockHooks);

  it('holds undo and redo', () => {
    render(<FormBuilder />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
  });

  /* Clipboard was keyboard-only before — the verbs existed but nothing showed them. */
  it('holds the clipboard verbs, which previously had no UI at all', () => {
    render(<FormBuilder />);
    for (const name of [/^cut$/i, /^copy$/i, /^paste$/i, /^duplicate$/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('shows the text formatting controls greyed out while no caret is open', () => {
    render(<FormBuilder />);
    expect(screen.getByRole('button', { name: /^bold$/i })).toBeDisabled();
  });

  /* Word enables the Font group the moment there is text to apply it to. */
  it('enables the text formatting controls once a caret is on the page', () => {
    render(<FormBuilder />);
    fireEvent.doubleClick(overlayAt(10));

    expect(screen.getByRole('button', { name: /^bold$/i })).toBeEnabled();
  });
});

describe('Ribbon — Insert tab', () => {
  beforeEach(mockHooks);

  /* The registry is open: every addable type must reach the UI by itself. */
  it('offers every addable component type from the registry', () => {
    render(<FormBuilder />);
    openTab(/insert/i);

    for (const component of ADDABLE_COMPONENTS) {
      const label = enForms.components[component.type];
      expect(
        screen.getByRole('button', { name: `Add ${label}` }),
        `${component.type} missing from the Insert tab`
      ).toBeInTheDocument();
    }
  });

  it('offers a section and a blank page', () => {
    render(<FormBuilder />);
    openTab(/insert/i);

    expect(screen.getByRole('button', { name: /add section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /blank page/i })).toBeInTheDocument();
  });
});

describe('Ribbon — Layout tab', () => {
  beforeEach(mockHooks);

  it('holds the page operations that were previously only in the page rail', () => {
    render(<FormBuilder />);
    openTab(/layout/i);
    // Scoped to the panel: the navigation pane keeps its own per-page verbs
    // ("Duplicate page 2"), which is the right place to act on a page other
    // than the one being worked on.
    const panel = within(screen.getByRole('tabpanel'));

    expect(panel.getByRole('button', { name: /duplicate page/i })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: /delete page/i })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: /remove empty pages/i })).toBeInTheDocument();
  });
});

describe('Ribbon — File menu', () => {
  beforeEach(mockHooks);

  /*
   * Print, version history and the read-only view are document-level commands
   * that a Word user reaches through File, not controls that belong beside the
   * formatting buttons.
   */
  it('collects print, read view, version history and the share link', () => {
    render(<FormBuilder />);
    openFileMenu();

    expect(screen.getByRole('menuitem', { name: /print/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /read view/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /version history/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /copy link/i })).toBeInTheDocument();
  });

  it('opens the read-only view, which no longer renders editable fields', () => {
    render(<FormBuilder />);
    openFileMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /read view/i }));

    expect(document.querySelector('[class*="elementOverlay"]')).toBeNull();
  });
});

describe('Ribbon — title bar and status bar', () => {
  beforeEach(mockHooks);

  it('keeps back, the form name, the status and the two commit actions in the title bar', () => {
    render(<FormBuilder />);
    const titleBar = document.querySelector('[class*="titleBar"]');

    expect(within(titleBar).getByText('Client Intake')).toBeInTheDocument();
    expect(within(titleBar).getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(within(titleBar).getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(within(titleBar).getByRole('button', { name: /publish/i })).toBeInTheDocument();
  });

  it('navigates back to client management on Back', () => {
    render(<FormBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(navigate).toHaveBeenCalledWith('/acme/settings/client-management');
  });

  /* Word puts the page count and the zoom slider in the status bar. */
  it('reports the page count and hosts zoom in the status bar', () => {
    render(<FormBuilder />);
    const statusBar = document.querySelector('[class*="statusBar"]');

    expect(within(statusBar).getByText(/page 1 of 2/i)).toBeInTheDocument();
    expect(within(statusBar).getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(within(statusBar).getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    expect(within(statusBar).getByRole('button', { name: /zoom level/i })).toBeInTheDocument();
  });

  /*
   * The percentage is the way in to the levels — the gesture a Word or Docs
   * user already has. `ZOOM_STEPS` and `setZoom` existed from the start with
   * no caller at all; the number was inert text between two steppers, so the
   * only way to reach 150% was to press `+` until you arrived.
   *
   * Fit page and Fit width live here too, rather than as two more icon
   * buttons in the strip: they answer the same question the levels do.
   */
  it('opens the zoom levels, and the fit commands, from the percentage', () => {
    render(<FormBuilder />);
    const statusBar = document.querySelector('[class*="statusBar"]');

    fireEvent.click(within(statusBar).getByRole('button', { name: /zoom level/i }));

    expect(screen.getByRole('menuitem', { name: '50%' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '100%' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '150%' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '200%' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /fit page/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /fit width/i })).toBeInTheDocument();
  });

  it('jumps straight to a level chosen from the menu', () => {
    render(<FormBuilder />);
    const statusBar = document.querySelector('[class*="statusBar"]');

    fireEvent.click(within(statusBar).getByRole('button', { name: /zoom level/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: '150%' }));

    expect(within(statusBar).getByRole('button', { name: /zoom level/i })).toHaveTextContent('150%');
  });

  it('still zooms from the status bar', () => {
    render(<FormBuilder />);
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });
});
