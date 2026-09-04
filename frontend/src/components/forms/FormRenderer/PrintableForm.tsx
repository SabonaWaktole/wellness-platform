import { useTranslation } from 'react-i18next';
import { ArrowLeft, Printer } from 'lucide-react';
import { FormRenderer } from './FormRenderer';
import type { FormDocument } from '../../../types/form';
import './print.css';
import styles from './PrintableForm.module.css';

export interface PrintableFormProps {
  title: string;
  formDocument: FormDocument;
  /** Present for a completed submission; absent for a blank form. */
  values?: Record<string, unknown>;
  userOptions?: { id: string; label: string }[];
  onBack: () => void;
}

/**
 * The print surface for both Phase 7 routes (spec §26): a blank form and a
 * completed submission. Always renders `FormRenderer` in `print` mode — the
 * "one path for builder, preview, fill and print" guarantee (brief §6) means
 * this component owns no field-specific rendering of its own, only the
 * screen-only action bar and print.css's sheet geometry.
 */
export const PrintableForm: React.FC<PrintableFormProps> = ({ title, formDocument, values, userOptions, onBack }) => {
  const { t } = useTranslation('forms');

  return (
    <div className={styles.page}>
      <div className={styles.actionBar} data-print-hide>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <ArrowLeft size={16} />
          {t('print.back')}
        </button>
        <span className={styles.title}>{title}</span>
        <button type="button" className={styles.printButton} onClick={() => window.print()}>
          <Printer size={16} />
          {t('print.action')}
        </button>
      </div>

      <div className={styles.sheetArea}>
        <FormRenderer layout={formDocument} mode="print" values={values} userOptions={userOptions} />
      </div>
    </div>
  );
};
