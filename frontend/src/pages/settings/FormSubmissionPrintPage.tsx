import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PrintableForm } from '../../components/forms/FormRenderer';
import { useFormSubmission } from '../../hooks/useClientForm';

/**
 * Print view of one completed submission (spec §26, §27): renders against
 * the EXACT `FormVersion` document it was filled against, never the form's
 * current draft — the same guarantee `FormSubmissionsContent`'s detail
 * overlay already relies on, just as its own full page instead of a modal.
 */
export const FormSubmissionPrintPage: React.FC = () => {
  const { t } = useTranslation('forms');
  const navigate = useNavigate();
  const { tenantSlug, formId, submissionId } = useParams();
  const { submission, isLoading, fetchSubmission } = useFormSubmission();

  useEffect(() => {
    if (formId && submissionId) void fetchSubmission(formId, submissionId);
  }, [fetchSubmission, formId, submissionId]);

  const handleBack = () => navigate(`/${tenantSlug}/settings/client-management/forms/${formId}/submissions`);

  if (isLoading || !submission) {
    return <p>{t('print.loading')}</p>;
  }

  return (
    <PrintableForm
      title={t('submissions.detailTitle')}
      formDocument={submission.document}
      values={submission.data}
      onBack={handleBack}
    />
  );
};
