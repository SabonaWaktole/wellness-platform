// @ts-nocheck
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FormBuilder } from './FormBuilder';
import * as clientFormHooks from '../../../hooks/useClientForm';
import * as clientsHooks from '../../../hooks/useClients';
import { emptyPageGeometry } from '../../../types/form';

/*
 * CONTEXTUAL FORMATTING.
 *
 * Two problems this covers.
 *
 * First, the panel used to present the document's internals: untranslated `X`
 * and `Y` labels, "Width (px)", and the internal `field.key` sitting in plain
 * view. The owner is laying out a page, not editing rendering coordinates, and
 * the vocabulary should say so.
 *
 * Second, everything was visible at once for every selection — a section's
 * controls and a field's controls and an image's, in one column, whether or not
 * they applied. Word shows what the selected thing can do and nothing else.
 *
 * The rule these tests encode: NOTHING that could be configured before may
 * become unreachable. Relabelled, regrouped and hidden behind a disclosure are
 * all fine. Gone is not.
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
            title: 'Company Information',
            x: 20,
            y: 20,
            width: 400,
            height: 300,
            elements: [
              {
                id: 'i1',
                type: 'INPUT',
                x: 10,
                y: 10,
                width: 200,
                height: 50,
                field: { key: 'company_name', label: 'Company Name', dataType: 'TEXT', required: false },
              },
              {
                id: 'm1',
                type: 'IMAGE',
                x: 10,
                y: 90,
                width: 120,
                height: 80,
                content: { url: '/uploads/logo.png', alt: 'Logo' },
              },
              {
                id: 'd1',
                type: 'DIVIDER',
                x: 10,
                y: 190,
                width: 200,
                height: 20,
                content: { orientation: 'horizontal', thickness: 2 },
              },
            ],
          },
        ],
      },
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

const selectAt = (top) =>
  fireEvent.click(document.querySelector(`[class*="elementOverlay"][style*="top: ${top}px"]`));
const selectField = () => selectAt(10);
const selectImage = () => selectAt(90);
const selectDivider = () => selectAt(190);
const selectSection = () => fireEvent.click(document.querySelector('[class*="sectionOverlay"]'));
/* A stable hook: the ribbon's own panel shares the "panel" class name. */
const pane = () => within(document.querySelector('[data-format-pane]'));
const tabNames = () => screen.getAllByRole('tab').map((el) => el.textContent);

describe('Contextual ribbon tabs', () => {
  beforeEach(mockHooks);

  it('shows only the permanent tabs while nothing is selected', () => {
    render(<FormBuilder />);
    expect(tabNames()).toEqual(['Home', 'Insert', 'Layout']);
  });

  /* Word raises a Picture Format tab the moment a picture is selected. */
  it('raises a picture tab for an image, and drops it on deselect', () => {
    render(<FormBuilder />);
    selectImage();
    expect(screen.getByRole('tab', { name: /picture/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tab', { name: /picture/i })).not.toBeInTheDocument();
  });

  it('raises a field tab for a form field, not a picture tab', () => {
    render(<FormBuilder />);
    selectField();

    expect(screen.getByRole('tab', { name: /field/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /picture/i })).not.toBeInTheDocument();
  });

  it('raises a section tab for a section', () => {
    render(<FormBuilder />);
    selectSection();
    expect(screen.getByRole('tab', { name: /section/i })).toBeInTheDocument();
  });

  /* Word activates the contextual tab, so the relevant commands are in front. */
  it('activates the contextual tab on selection', () => {
    render(<FormBuilder />);
    selectImage();
    expect(screen.getByRole('tab', { name: /picture/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('returns to Home when the selection goes away', () => {
    render(<FormBuilder />);
    selectImage();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('tab', { name: /home/i })).toHaveAttribute('aria-selected', 'true');
  });

  /*
   * `alignBoxes`/`distributeBoxes` were written and tested when the canvas was
   * built and never given a caller, so two fields could be nudged into rough
   * alignment by eye but never actually aligned.
   */
  it('offers align only once two things are selected', () => {
    render(<FormBuilder />);
    selectField();
    const panel = () => within(screen.getByRole('tabpanel'));
    expect(panel().getByRole('button', { name: /align left/i })).toBeDisabled();

    fireEvent.click(document.querySelector('[class*="elementOverlay"][style*="top: 90px"]'), { shiftKey: true });
    expect(panel().getByRole('button', { name: /align left/i })).toBeEnabled();
  });

  it('aligns both selected elements to the same left edge', () => {
    render(<FormBuilder />);
    selectAt(90);
    fireEvent.click(document.querySelector('[class*="elementOverlay"][style*="top: 190px"]'), { shiftKey: true });
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: /align left/i }));

    const lefts = [...document.querySelectorAll('[class*="elementOverlay"]')].map((el) => el.style.left);
    expect(lefts.filter((l) => l === '10px').length).toBeGreaterThanOrEqual(3);
  });

  it('offers delete from the contextual tab', () => {
    render(<FormBuilder />);
    selectImage();
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: /delete/i }));

    expect(document.querySelector('[class*="elementOverlay"][style*="top: 90px"]')).toBeNull();
  });
});

describe('Format pane — vocabulary', () => {
  beforeEach(mockHooks);

  it('stays out of the way until something is selected', () => {
    render(<FormBuilder />);
    expect(document.querySelector('[data-format-pane]')).toBeNull();
  });

  it('names the kind of object being formatted', () => {
    render(<FormBuilder />);
    selectImage();
    expect(pane().getByRole('heading', { name: /image/i })).toBeInTheDocument();
  });

  /*
   * "Width (px)" put a unit in the label; `X` and `Y` were raw coordinates and
   * were never even translated. A page is laid out in width, height and
   * position, which is what the owner is actually thinking about.
   */
  it('talks about size and position, not coordinates', () => {
    render(<FormBuilder />);
    selectField();
    fireEvent.click(pane().getByText(/^position$/i));

    expect(pane().getByLabelText(/^width$/i)).toBeInTheDocument();
    expect(pane().getByLabelText(/^height$/i)).toBeInTheDocument();
    expect(pane().getByLabelText(/horizontal/i)).toBeInTheDocument();
    expect(pane().getByLabelText(/vertical/i)).toBeInTheDocument();
    expect(pane().queryByLabelText('X')).not.toBeInTheDocument();
    expect(pane().queryByLabelText('Y')).not.toBeInTheDocument();
  });

  /* Still reachable, still read-only — just no longer the third thing you see. */
  it('keeps the storage key, tucked under Advanced', () => {
    render(<FormBuilder />);
    selectField();
    // Present but collapsed: the claim is that it is not in the way, not that
    // it was removed. `toBeVisible` understands a closed <details>.
    expect(pane().getByDisplayValue('company_name')).not.toBeVisible();

    fireEvent.click(pane().getByText(/advanced/i));
    const key = pane().getByDisplayValue('company_name');
    expect(key).toBeVisible();
    expect(key).toHaveAttribute('readonly');
  });

  it('offers size and position exactly once for a section', () => {
    render(<FormBuilder />);
    selectSection();
    expect(pane().getAllByLabelText(/^width$/i)).toHaveLength(1);
  });
});

describe('Format pane — every capability survives', () => {
  beforeEach(mockHooks);

  it('keeps every field control', () => {
    render(<FormBuilder />);
    selectField();

    expect(pane().getByLabelText(/label/i)).toBeInTheDocument();
    expect(pane().getByText(/field type/i)).toBeInTheDocument();
    expect(pane().getByLabelText(/placeholder/i)).toBeInTheDocument();
    expect(pane().getByText(/required/i)).toBeInTheDocument();
  });

  it('keeps the image description', () => {
    render(<FormBuilder />);
    selectImage();
    expect(pane().getByLabelText(/image description/i)).toBeInTheDocument();
  });

  it('keeps the divider orientation', () => {
    render(<FormBuilder />);
    selectDivider();
    expect(pane().getByText(/orientation/i)).toBeInTheDocument();
  });

  it('keeps all three element colours', () => {
    render(<FormBuilder />);
    selectField();
    fireEvent.click(pane().getByText(/fill & line/i));

    expect(pane().getByText(/text colour/i)).toBeInTheDocument();
    expect(pane().getByText(/background colour/i)).toBeInTheDocument();
    expect(pane().getByText(/border colour/i)).toBeInTheDocument();
  });

  it('keeps the section title and its two colours', () => {
    render(<FormBuilder />);
    selectSection();

    expect(pane().getByLabelText(/section title/i)).toBeInTheDocument();
    expect(pane().getByText(/background colour/i)).toBeInTheDocument();
    expect(pane().getByText(/border colour/i)).toBeInTheDocument();
  });
});
