import { useRef, useState } from 'react';
import { AlertCircle, Download, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button/Button';
import type { ImportResult } from '../../../types/client';
import styles from './ExcelImportButton.module.css';

export const IMPORT_ACCEPT = '.xlsx,.xls,.csv';

export interface ExcelImportButtonProps {
  /** Uploads the picked file and resolves with the per-row outcome. */
  onImport: (file: File) => Promise<ImportResult>;
  /** Fetches the pre-filled template workbook for this importer. */
  onDownloadTemplate: () => Promise<Blob>;
  /** Suggested filename for the downloaded template. */
  templateFileName: string;
  /** Called after an import that created at least one record. */
  onImported?: () => void;
  label: string;
  disabled?: boolean;
}

/**
 * Upload-a-spreadsheet control shared by the custom-field and client importers.
 *
 * The file goes to the server untouched — parsing, validation and per-row error
 * reporting all happen there — so this only owns picking the file, surfacing
 * the outcome, and offering the matching template.
 */
export const ExcelImportButton: React.FC<ExcelImportButtonProps> = ({
  onImport,
  onDownloadTemplate,
  templateFileName,
  onImported,
  label,
  disabled = false,
}) => {
  const { t } = useTranslation('clients');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared immediately so picking the same file twice still fires a change.
    event.target.value = '';
    if (!file) return;

    setIsBusy(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await onImport(file);
      setResult(outcome);
      if (outcome.created > 0) onImported?.();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('import.failed'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleTemplate = async () => {
    setError(null);
    try {
      const blob = await onDownloadTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = templateFileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('import.templateFailed'));
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<Upload size={16} />}
          isLoading={isBusy}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {label}
        </Button>
        <button type="button" className={styles.templateLink} onClick={handleTemplate}>
          <Download size={14} />
          {t('import.downloadTemplate')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className={styles.fileInput}
          onChange={handleFile}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {error && (
        <p className={styles.error} role="alert">
          <AlertCircle size={14} />
          {error}
        </p>
      )}

      {result && (
        <div className={styles.result} role="status">
          <p className={styles.summary}>
            {t('import.summary', { created: result.created })}
            {result.skipped ? ` · ${t('import.skipped', { count: result.skipped })}` : ''}
          </p>
          {result.errors.length > 0 && (
            <ul className={styles.errorList}>
              {result.errors.map((rowError) => (
                <li key={rowError.row}>
                  {t('import.rowError', { row: rowError.row, message: rowError.message })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
