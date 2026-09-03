import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, FileWarning } from 'lucide-react';
import { API_BASE_URL } from '../../api/baseUrl';
import { FormRenderer, ScaledPage } from '../../components/forms/FormRenderer';
import type { FormDocument } from '../../types/form';
import styles from './PublicFormPage.module.css';

interface PublicFormView {
  formId: string;
  formName: string;
  formDescription: string | null;
  document: FormDocument;
  successMessage: string | null;
}

const apiBase = API_BASE_URL;

/**
 * The client-facing form (spec §24, brief §6) — fill a shared link, submit,
 * done.
 *
 * Deliberately outside the authenticated app shell, same reasoning as
 * `PublicQuotationPage`: the person filling this has no account and never
 * will. Uses plain `fetch`, not the shared `apiClient` — that client sends
 * credentials and redirects on 401, neither of which belongs on a page an
 * anonymous visitor reached from a pasted link.
 *
 * Renders through the SAME `FormRenderer` the builder's preview and the
 * internal client create/edit page use, in `fill` mode — the "one path for
 * builder, preview, fill and print" guarantee (brief §6) means this page has
 * no field-specific code of its own.
 *
 * The A4 geometry is preserved and SCALED on a narrow viewport, never
 * reflowed — `ScaledPage` already does exactly this for the builder's own
 * preview, reused here unchanged (spec §25).
 */
export const PublicFormPage = () => {
  const { token } = useParams();
  const { t } = useTranslation('forms');

  const [view, setView] = useState<PublicFormView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { control, handleSubmit, getValues } = useForm<{ data: Record<string, unknown> }>({
    defaultValues: { data: {} },
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`${apiBase}/public/forms/${token}`);
        if (!response.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = (await response.json()) as PublicFormView;
        if (!cancelled) setView(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (values: { data: Record<string, unknown> }) => {
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const response = await fetch(`${apiBase}/public/forms/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: values.data }),
      });

      if (response.status === 404) {
        setNotFound(true);
        return;
      }

      const body = await response.json();

      if (response.status === 400 && body.fieldErrors) {
        setFieldErrors(body.fieldErrors);
        return;
      }

      if (!response.ok) {
        setSubmitError(t('public.submitError'));
        return;
      }

      setSubmitted(true);
    } catch {
      setSubmitError(t('public.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.centered}>{t('public.loading')}</div>;
  }

  if (notFound || !view) {
    // One message for every failure mode — unknown token, draft, archived,
    // not accepting responses — mirroring PublicQuotationPage: the server
    // deliberately does not distinguish them, so the page must not invent a
    // distinction the API refused to make.
    return (
      <div className={styles.centered}>
        <FileWarning size={32} strokeWidth={1.5} />
        <h1 className={styles.errorTitle}>{t('public.notFound')}</h1>
        <p className={styles.errorHint}>{t('public.notFoundHint')}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className={styles.centered}>
        <CheckCircle2 size={32} strokeWidth={1.5} className={styles.successIcon} />
        <h1 className={styles.errorTitle}>{view.successMessage || t('public.defaultSuccess')}</h1>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.formName}>{view.formName}</h1>
        {view.formDescription && <p className={styles.formDescription}>{view.formDescription}</p>}
      </div>

      {/* noValidate: this page's own errors (mirrored from the server's
          field-level validation) are what render, not the browser's native
          bubble on one field and nothing on the rest. */}
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <ScaledPage pageWidth={view.document.page.width} pageHeight={view.document.page.height * view.document.pages.length}>
          <FormRenderer
            layout={view.document}
            mode="fill"
            control={control}
            errors={fieldErrors}
            values={getValues('data')}
            // Never the tenant's staff roster on an unauthenticated page —
            // a USER_REFERENCE field (e.g. a stray "Assigned To") renders as
            // an empty picker rather than leaking who works there.
            userOptions={[]}
          />
        </ScaledPage>

        {submitError && (
          <p className={styles.errorBanner} role="alert">
            {submitError}
          </p>
        )}

        <div className={styles.submitRow}>
          <button type="submit" className={styles.submitButton} disabled={submitting}>
            {submitting ? t('public.submitting') : t('public.submit')}
          </button>
        </div>
      </form>

      <footer className={styles.footer}>{t('public.privateNotice')}</footer>
    </div>
  );
};
