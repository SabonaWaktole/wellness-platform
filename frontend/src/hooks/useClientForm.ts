import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { formService } from '../services/formService';
import { extractApiErrorMessage } from '../utils/apiError';
import type {
  ClientFormResponse,
  ClientFormSummary,
  FormDocument,
  FormStatus,
  FormVersionSummary,
  FormVersionDetail,
  FormSubmissionSummary,
  FormSubmissionDetail,
} from '../types/form';

/**
 * Reads a client intake form. Hand-rolled useState/useCallback to match the
 * rest of the hooks in this app — there is no react-query here.
 *
 * `formId` omitted means the tenant's default form, which is the one the
 * internal client create/edit page renders.
 */
export const useClientForm = (formId?: string) => {
  const { tenantSlug } = useParams();
  const [form, setForm] = useState<ClientFormResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForm = useCallback(async () => {
    if (!tenantSlug) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = formId
        ? await formService.getForm(tenantSlug, formId)
        : await formService.getDefaultForm(tenantSlug);
      setForm(data);
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to load the client form'));
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, formId]);

  return { form, setForm, isLoading, error, fetchForm };
};

export const useUpdateFormLayout = () => {
  const { tenantSlug } = useParams();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set when the server answers 409 — another session saved first, so the
   * builder is holding a layout based on state that no longer exists. Kept
   * separate from `error` because the only useful response is "reload", not
   * "fix your input".
   */
  const [hasConflict, setHasConflict] = useState(false);

  const updateLayout = useCallback(
    async (formId: string, layout: FormDocument, expectedVersion: number) => {
      if (!tenantSlug) return null;
      setIsSaving(true);
      setError(null);
      setHasConflict(false);
      try {
        return await formService.updateLayout(tenantSlug, formId, layout, expectedVersion);
      } catch (err: any) {
        if (err?.response?.status === 409) setHasConflict(true);
        setError(extractApiErrorMessage(err, 'Failed to save the form'));
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [tenantSlug]
  );

  return { updateLayout, isSaving, error, hasConflict, clearError: () => setError(null) };
};

/** The Forms tab's list of the tenant's forms. */
export const useClientForms = () => {
  const { tenantSlug } = useParams();
  const [forms, setForms] = useState<ClientFormSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    if (!tenantSlug) return;
    setIsLoading(true);
    setError(null);
    try {
      setForms(await formService.listForms(tenantSlug));
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to load forms'));
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  return { forms, isLoading, error, fetchForms };
};

export const useCreateClientForm = () => {
  const { tenantSlug } = useParams();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createForm = useCallback(
    async (name: string, description?: string) => {
      if (!tenantSlug) throw new Error('Missing tenant context');
      setIsCreating(true);
      setError(null);
      try {
        return await formService.createForm(tenantSlug, name, description);
      } catch (err: any) {
        setError(extractApiErrorMessage(err, 'Failed to create the form'));
        throw err;
      } finally {
        setIsCreating(false);
      }
    },
    [tenantSlug]
  );

  return { createForm, isCreating, error };
};

export const useUpdateFormSettings = () => {
  const { tenantSlug } = useParams();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSettings = useCallback(
    async (
      formId: string,
      changes: { name?: string; description?: string | null; status?: FormStatus; isDefault?: boolean },
      expectedVersion: number
    ) => {
      if (!tenantSlug) throw new Error('Missing tenant context');
      setIsSaving(true);
      setError(null);
      try {
        return await formService.updateSettings(tenantSlug, formId, changes, expectedVersion);
      } catch (err: any) {
        setError(extractApiErrorMessage(err, 'Failed to update the form'));
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [tenantSlug]
  );

  return { updateSettings, isSaving, error };
};

export const useDeleteClientForm = () => {
  const { tenantSlug } = useParams();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteForm = useCallback(
    async (formId: string) => {
      if (!tenantSlug) throw new Error('Missing tenant context');
      setIsDeleting(true);
      setError(null);
      try {
        await formService.deleteForm(tenantSlug, formId);
      } catch (err: any) {
        setError(extractApiErrorMessage(err, 'Failed to delete the form'));
        throw err;
      } finally {
        setIsDeleting(false);
      }
    },
    [tenantSlug]
  );

  return { deleteForm, isDeleting, error };
};

export const useDuplicateClientForm = () => {
  const { tenantSlug } = useParams();
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicateForm = useCallback(
    async (formId: string, name: string) => {
      if (!tenantSlug) throw new Error('Missing tenant context');
      setIsDuplicating(true);
      setError(null);
      try {
        return await formService.duplicateForm(tenantSlug, formId, name);
      } catch (err: any) {
        setError(extractApiErrorMessage(err, 'Failed to duplicate the form'));
        throw err;
      } finally {
        setIsDuplicating(false);
      }
    },
    [tenantSlug]
  );

  return { duplicateForm, isDuplicating, error };
};

/** Freezes the draft as a new published version — the toolbar's Publish button. */
export const usePublishForm = () => {
  const { tenantSlug } = useParams();
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publishForm = useCallback(
    async (formId: string, expectedVersion: number) => {
      if (!tenantSlug) throw new Error('Missing tenant context');
      setIsPublishing(true);
      setError(null);
      try {
        return await formService.publishForm(tenantSlug, formId, expectedVersion);
      } catch (err: any) {
        setError(extractApiErrorMessage(err, 'Failed to publish the form'));
        throw err;
      } finally {
        setIsPublishing(false);
      }
    },
    [tenantSlug]
  );

  return { publishForm, isPublishing, error, clearError: () => setError(null) };
};

/** The version-history panel's list — newest first, no document payload. */
export const useFormVersions = (formId: string | undefined) => {
  const { tenantSlug } = useParams();
  const [versions, setVersions] = useState<FormVersionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    if (!tenantSlug || !formId) return;
    setIsLoading(true);
    setError(null);
    try {
      setVersions(await formService.listVersions(tenantSlug, formId));
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to load version history'));
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, formId]);

  return { versions, isLoading, error, fetchVersions };
};

/** One frozen version's document — the version-history panel's "view" action. */
export const useFormVersion = () => {
  const { tenantSlug } = useParams();
  const [version, setVersion] = useState<FormVersionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVersion = useCallback(
    async (formId: string, versionNumber: number) => {
      if (!tenantSlug) return;
      setIsLoading(true);
      setError(null);
      try {
        setVersion(await formService.getVersion(tenantSlug, formId, versionNumber));
      } catch (err: any) {
        setError(extractApiErrorMessage(err, 'Failed to load that version'));
      } finally {
        setIsLoading(false);
      }
    },
    [tenantSlug]
  );

  return { version, isLoading, error, fetchVersion, clearVersion: () => setVersion(null) };
};

/** The submissions tab's list — newest first, no `data` payload. */
export const useFormSubmissions = (formId: string | undefined) => {
  const { tenantSlug } = useParams();
  const [submissions, setSubmissions] = useState<FormSubmissionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!tenantSlug || !formId) return;
    setIsLoading(true);
    setError(null);
    try {
      setSubmissions(await formService.listSubmissions(tenantSlug, formId));
    } catch (err: any) {
      setError(extractApiErrorMessage(err, 'Failed to load submissions'));
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, formId]);

  return { submissions, isLoading, error, fetchSubmissions };
};

/** One submission's detail, rendered against its own frozen version. */
export const useFormSubmission = () => {
  const { tenantSlug } = useParams();
  const [submission, setSubmission] = useState<FormSubmissionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmission = useCallback(
    async (formId: string, submissionId: string) => {
      if (!tenantSlug) return;
      setIsLoading(true);
      setError(null);
      try {
        setSubmission(await formService.getSubmission(tenantSlug, formId, submissionId));
      } catch (err: any) {
        setError(extractApiErrorMessage(err, 'Failed to load that submission'));
      } finally {
        setIsLoading(false);
      }
    },
    [tenantSlug]
  );

  return { submission, isLoading, error, fetchSubmission, clearSubmission: () => setSubmission(null) };
};

export const useUploadFormAsset = () => {
  const { tenantSlug } = useParams();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadAsset = useCallback(
    async (formId: string, file: File) => {
      if (!tenantSlug) throw new Error('Missing tenant context');
      setIsUploading(true);
      setError(null);
      try {
        return await formService.uploadAsset(tenantSlug, formId, file);
      } catch (err: any) {
        setError(extractApiErrorMessage(err, 'Failed to upload the image'));
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [tenantSlug]
  );

  return { uploadAsset, isUploading, error };
};
