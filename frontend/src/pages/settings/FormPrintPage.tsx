import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PrintableForm } from '../../components/forms/FormRenderer';
import { useClientForm } from '../../hooks/useClientForm';

/**
 * Print view of a blank form (spec §26) — the owner's own copy, e.g. to hand
 * out where a client can't fill the public link. Owner-only, mirroring the
 * builder's own restriction (see routes/index.tsx); intentionally bare, no
 * app shell — nothing on this page should end up on the printed sheet.
 */
export const FormPrintPage: React.FC = () => {
  const { t } = useTranslation('forms');
  const navigate = useNavigate();
  const { tenantSlug, formId } = useParams();
  const { form, isLoading, fetchForm } = useClientForm(formId);

  useEffect(() => {
    fetchForm();
  }, [fetchForm]);

  const handleBack = () => navigate(`/${tenantSlug}/settings/client-management/forms/${formId}`);

  if (isLoading || !form) {
    return <p>{t('print.loading')}</p>;
  }

  return <PrintableForm title={form.name} formDocument={form.layout} onBack={handleBack} />;
};
