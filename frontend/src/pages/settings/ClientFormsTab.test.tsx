// @ts-nocheck
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ClientFormsTab } from './ClientFormsTab';
import * as formHooks from '../../hooks/useClientForm';

const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ tenantSlug: 'acme' }),
  useNavigate: () => navigate,
}));

vi.mock('../../hooks/useClientForm', () => ({
  useClientForms: vi.fn(),
  useCreateClientForm: vi.fn(),
  useUpdateFormSettings: vi.fn(),
  useDeleteClientForm: vi.fn(),
  useDuplicateClientForm: vi.fn(),
  useFormTemplates: vi.fn(),
  useSaveAsTemplate: vi.fn(),
  useCreateFormFromTemplate: vi.fn(),
}));

const form = (over = {}) => ({
  id: 'f1',
  name: 'Client Intake',
  description: null,
  isDefault: true,
  isTemplate: false,
  status: 'DRAFT',
  version: 1,
  updatedAt: '2026-09-01T00:00:00.000Z',
  shareToken: null,
  publishedVersionId: null,
  hasUnpublishedChanges: false,
  ...over,
});

const template = (over = {}) => ({ ...form({ id: 't1', name: 'Intake Template', isTemplate: true }), ...over });

describe('ClientFormsTab', () => {
  const saveAsTemplate = vi.fn();
  const createFormFromTemplate = vi.fn();
  const fetchTemplates = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    formHooks.useClientForms.mockReturnValue({
      forms: [form()],
      isLoading: false,
      error: null,
      fetchForms: vi.fn(),
    });
    formHooks.useCreateClientForm.mockReturnValue({ createForm: vi.fn(), isCreating: false, error: null });
    formHooks.useUpdateFormSettings.mockReturnValue({ updateSettings: vi.fn() });
    formHooks.useDeleteClientForm.mockReturnValue({ deleteForm: vi.fn(), error: null });
    formHooks.useDuplicateClientForm.mockReturnValue({ duplicateForm: vi.fn(), error: null });
    formHooks.useFormTemplates.mockReturnValue({
      templates: [template()],
      isLoading: false,
      error: null,
      fetchTemplates,
    });
    formHooks.useSaveAsTemplate.mockReturnValue({ saveAsTemplate, error: null });
    formHooks.useCreateFormFromTemplate.mockReturnValue({ createFormFromTemplate, error: null });
  });

  it('saves a form as a template, naming it off the source form', async () => {
    saveAsTemplate.mockResolvedValue(template());
    render(<ClientFormsTab />);

    fireEvent.click(screen.getByText('Save as template'));

    await waitFor(() => expect(saveAsTemplate).toHaveBeenCalledWith('f1', 'Client Intake Template'));
  });

  it('opens the template picker and lists the tenant\'s templates', async () => {
    render(<ClientFormsTab />);

    fireEvent.click(screen.getByText('New from template'));

    await waitFor(() => expect(fetchTemplates).toHaveBeenCalled());
    expect(screen.getByText('Intake Template')).toBeInTheDocument();
  });

  it('creates a form from a template and opens the builder', async () => {
    createFormFromTemplate.mockResolvedValue(form({ id: 'new-form' }));
    render(<ClientFormsTab />);

    fireEvent.click(screen.getByText('New from template'));
    await waitFor(() => screen.getByText('Intake Template'));
    fireEvent.click(screen.getByText('Use'));

    await waitFor(() =>
      expect(createFormFromTemplate).toHaveBeenCalledWith('t1', 'Copy of Intake Template')
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/acme/settings/client-management/forms/new-form')
    );
  });

  it('shows an empty state when there are no templates yet', async () => {
    formHooks.useFormTemplates.mockReturnValue({
      templates: [],
      isLoading: false,
      error: null,
      fetchTemplates,
    });
    render(<ClientFormsTab />);

    fireEvent.click(screen.getByText('New from template'));
    await waitFor(() => expect(fetchTemplates).toHaveBeenCalled());
    expect(screen.getByText(/No templates yet/)).toBeInTheDocument();
  });
});
