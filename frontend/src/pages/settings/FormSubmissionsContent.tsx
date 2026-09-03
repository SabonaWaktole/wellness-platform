import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, Eye } from 'lucide-react';
import { SettingsLayout } from '../../components/layout/SettingsLayout';
import { Button } from '../../components/ui/Button/Button';
import { FormRenderer, ScaledPage } from '../../components/forms/FormRenderer';
import { useClientForm, useFormSubmissions, useFormSubmission } from '../../hooks/useClientForm';
import type { FormDocument } from '../../types/form';
import styles from './FormSubmissionsContent.module.css';

/** Every `field.key`/`label` in a document, flattened — mirrors the backend's
 *  own `fieldSpecsOf` (FormDocument.ts), which the frontend has no need to
 *  duplicate wholesale for the one place (CSV headers) that needs it. */
const fieldSpecsOf = (doc: FormDocument): { key: string; label: string }[] =>
  doc.pages.flatMap((page) =>
    page.sections.flatMap((section) =>
      section.elements
        .filter((el) => el.field !== undefined)
        .map((el) => ({ key: el.field!.key, label: el.field!.label }))
    )
  );

/**
 * The tenant-facing submissions tab (spec §6, brief §8): a list of what
 * clients actually sent in, and — the whole point of pinning a submission
 * to a `FormVersion` — a detail view that renders each one against the
 * EXACT document it was filled against, never the form's current draft.
 */
export const FormSubmissionsContent: React.FC = () => {
  const { t } = useTranslation('forms');
  const navigate = useNavigate();
  const { tenantSlug, formId } = useParams();

  const { form, fetchForm } = useClientForm(formId);
  const { submissions, isLoading, error, fetchSubmissions } = useFormSubmissions(formId);
  const { submission: detail, fetchSubmission, clearSubmission } = useFormSubmission();
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    fetchForm();
    fetchSubmissions();
  }, [fetchForm, fetchSubmissions]);

  const handleView = (submissionId: string) => {
    if (!formId) return;
    setViewingId(submissionId);
    void fetchSubmission(formId, submissionId);
  };

  const handleCloseDetail = () => {
    setViewingId(null);
    clearSubmission();
  };

  /**
   * CSV columns come from the CURRENT form's own fields — not a union
   * across every historical version — so the sheet stays readable even
   * when submissions span several redesigns. A value under a key the
   * current document no longer has is simply omitted from that row, the
   * same "the document is authoritative for shape" rule the builder
   * itself follows everywhere else.
   */
  const csvColumns = useMemo(() => {
    if (!form) return [] as { key: string; label: string }[];
    return fieldSpecsOf(form.layout).map((f) => ({ key: f.key, label: f.label }));
  }, [form]);

  const handleExportCsv = async () => {
    if (!tenantSlug || !formId || !form) return;
    const { formService } = await import('../../services/formService');
    const rows = await formService.listSubmissions(tenantSlug, formId);
    // The list endpoint carries no `data` — fetch each submission's detail
    // for the export. Submission counts are capped server-side (500), so
    // this is a bounded number of requests, not an unbounded fan-out.
    const details = await Promise.all(rows.map((r) => formService.getSubmission(tenantSlug, formId, r.id)));

    const header = ['Submitted', ...csvColumns.map((c) => c.label)];
    const lines = [header, ...details.map((d) => [
      new Date(d.submittedAt).toISOString(),
      ...csvColumns.map((c) => csvCell(d.data[c.key])),
    ])];
    const csv = lines.map((row) => row.map(escapeCsv).join(',')).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-submissions.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SettingsLayout activeNavId="client-management">
      <div className={styles.header}>
        <Button
          variant="outline"
          icon={<ArrowLeft size={16} />}
          onClick={() => navigate(`/${tenantSlug}/settings/client-management/forms/${formId}`)}
        >
          {t('submissions.backToForm')}
        </Button>
        <h1 className={styles.title}>
          {t('submissions.title')}
          {form ? ` — ${form.name}` : ''}
        </h1>
        <Button
          variant="outline"
          icon={<Download size={16} />}
          disabled={!form || submissions.length === 0}
          onClick={() => void handleExportCsv()}
        >
          {t('submissions.exportCsv')}
        </Button>
      </div>

      {error && <p role="alert">{error}</p>}
      {isLoading && <p>{t('submissions.loading')}</p>}

      {!isLoading && submissions.length === 0 && <p className={styles.empty}>{t('submissions.empty')}</p>}

      {!isLoading && submissions.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('submissions.columnSubmitted')}</th>
              <th>{t('submissions.columnSource')}</th>
              <th>{t('submissions.columnClient')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.submittedAt).toLocaleString()}</td>
                <td>{s.source === 'PUBLIC_LINK' ? t('submissions.sourcePublicLink') : t('submissions.sourceInternal')}</td>
                <td>
                  {s.clientId ? (
                    <a href={`/${tenantSlug}/clients/${s.clientId}`}>{t('submissions.viewClient')}</a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <Button variant="outline" icon={<Eye size={14} />} onClick={() => handleView(s.id)}>
                    {t('submissions.view')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewingId && (
        <div className={styles.detailOverlay} role="dialog" aria-modal="true">
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <h2>{t('submissions.detailTitle')}</h2>
              <Button variant="outline" onClick={handleCloseDetail}>
                ×
              </Button>
            </div>
            {detail && detail.id === viewingId ? (
              <ScaledPage pageWidth={detail.document.page.width} pageHeight={detail.document.page.height * detail.document.pages.length}>
                <FormRenderer layout={detail.document} mode="print" values={detail.data} />
              </ScaledPage>
            ) : (
              <p>{t('submissions.loading')}</p>
            )}
          </div>
        </div>
      )}
    </SettingsLayout>
  );
};

const csvCell = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
};

const escapeCsv = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
