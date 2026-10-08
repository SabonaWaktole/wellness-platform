import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { Building2, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { useDebounce } from '../../hooks/useDebounce';
import { useDateFormat } from '../../hooks/useDateFormat';
import { downloadBlob } from '../../utils/downloadBlob';
import { clientService } from '../../services/clientService';
import {
  employeeImportService,
  importRefusalOf,
  type EmployeeImportOutcome,
  type EmployeeImportPreview,
  type EmployeeImportSummary,
} from '../../services/employeeImportService';
import styles from './Members.module.css';

interface Company {
  id: string;
  name: string;
}

/** The reasons the server gives for a row it classified, which have a translation. Anything else (a validation message) is shown as sent. */
const KNOWN_REASONS: Record<string, string> = {
  'Already linked to this company': 'alreadyLinked',
  'Repeated in the file': 'repeated',
  'Linked to another company': 'linkedElsewhere',
  'The member is closed': 'closed',
  'Matches more than one member': 'ambiguous',
};

/**
 * The corporate employee upload (M4 Slice 9, FR-EMP-01..07): choose a company, download the template, upload, read the
 * preview, confirm, then the result. The server judges the company's contract, the file, every row and the counts; the
 * screen shows them and calculates nothing. The company page links here with `?clientId=`.
 */
export const EmployeeUploadContent: React.FC = () => {
  const { t, i18n } = useTranslation('members');
  const { tenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const dates = useDateFormat();

  const [company, setCompany] = useState<Company | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Company[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmployeeImportPreview | null>(null);
  const [outcome, setOutcome] = useState<EmployeeImportOutcome | null>(null);
  const [history, setHistory] = useState<EmployeeImportSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    const clientId = searchParams.get('clientId');
    if (!tenantSlug || !clientId) return;
    clientService
      .getClient(tenantSlug, clientId)
      .then((client) => setCompany({ id: client.id, name: client.name }))
      .catch(() => setCompany(null));
  }, [tenantSlug, searchParams]);

  useEffect(() => {
    if (!tenantSlug || company || !debounced.trim()) {
      setMatches([]);
      return;
    }
    let current = true;
    clientService
      .searchClients(tenantSlug, { search: debounced.trim(), take: 8 })
      .then((result) => current && setMatches(result.items.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => current && setMatches([]));
    return () => {
      current = false;
    };
  }, [tenantSlug, company, debounced]);

  const loadHistory = useCallback(async () => {
    if (!tenantSlug || !company) return setHistory([]);
    try {
      setHistory(await employeeImportService.history(tenantSlug, company.id));
    } catch (err) {
      console.error('Failed to load the employee uploads', err);
      setHistory([]);
    }
  }, [tenantSlug, company]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setOutcome(null);
    setError(null);
  };

  const refusalText = (err: unknown): string => {
    const refusal = importRefusalOf(err);
    if (!refusal) return t('employees.failed');
    return t(`employees.refusal.${refusal.reason}`, { defaultValue: refusal.message || t('employees.failed') });
  };

  const reasonText = (reason: string | null) => (reason ? t(`employees.reason.${KNOWN_REASONS[reason] ?? 'other'}`, { defaultValue: reason }) : '');

  const downloadTemplate = async () => {
    if (!tenantSlug) return;
    try {
      downloadBlob(await employeeImportService.template(tenantSlug, i18n.language.startsWith('sq') ? 'sq' : 'en'), 'wellness-plus-employees.xlsx');
    } catch (err) {
      console.error('Failed to download the template', err);
      setError(t('employees.failed'));
    }
  };

  const upload = async () => {
    if (!tenantSlug || !company || !file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setOutcome(null);
    try {
      setPreview(await employeeImportService.preview(tenantSlug, company.id, file));
    } catch (err) {
      setError(refusalText(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!tenantSlug || !preview) return;
    setBusy(true);
    setError(null);
    try {
      setOutcome(await employeeImportService.confirm(tenantSlug, preview.id, preview.confirmToken));
      await loadHistory();
    } catch (err) {
      setError(refusalText(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadResult = async (importId: string, name: string) => {
    if (!tenantSlug) return;
    try {
      downloadBlob(await employeeImportService.result(tenantSlug, importId), `${name.replace(/\.xlsx$/i, '')}-result.xlsx`);
    } catch (err) {
      console.error('Failed to download the result file', err);
      setError(t('employees.failed'));
    }
  };

  const countLine = (c: { created: number; linked: number; skipped: number; refused: number; errors: number }) =>
    (['created', 'linked', 'skipped', 'refused', 'errors'] as const).map((key) => (
      <span key={key} className={styles.chip}>
        {t(`employees.counts.${key}`, { count: c[key] })}
      </span>
    ));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('employees.title')}</h1>
          <p className={styles.subtitle}>{t('employees.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={() => void downloadTemplate()}>{t('employees.template')}</Button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardBody}>
          <div className={styles.uploadField}>
            <span className={styles.sectionTitle}>{t('employees.company')}</span>
            {company ? (
              <div className={styles.companyChosen}>
                <Building2 size={18} aria-hidden="true" />
                <strong>{company.name}</strong>
                {!searchParams.get('clientId') && (
                  <Button variant="ghost" size="sm" type="button" onClick={() => { setCompany(null); reset(); }}>{t('employees.change')}</Button>
                )}
              </div>
            ) : (
              <div className={styles.companySearch}>
                <TextInput
                  aria-label={t('employees.search')}
                  placeholder={t('employees.searchPlaceholder')}
                  iconLeft={<Search size={16} />}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {debounced.trim() && (
                  <ul className={styles.matches}>
                    {matches.length === 0 && <li className={styles.muted}>{t('employees.noCompanies')}</li>}
                    {matches.map((match) => (
                      <li key={match.id}>
                        <button type="button" className={styles.match} onClick={() => setCompany(match)}>{match.name}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {company && (
            <div className={styles.uploadField}>
              <label className={styles.sectionTitle} htmlFor="employee-file">{t('employees.file')}</label>
              <input
                id="employee-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                  setOutcome(null);
                  setError(null);
                }}
              />
              <p className={styles.muted}>{t('employees.fileHelp')}</p>
              <div>
                <Button onClick={() => void upload()} disabled={!file || busy}>{t('employees.upload')}</Button>
              </div>
            </div>
          )}

          {error && <p role="alert" className={styles.formError}>{error}</p>}
        </div>
      </div>

      {preview && !outcome && (
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.sectionTitle}>{t('employees.preview.title', { file: preview.fileName })}</h2>
            <div className={styles.chips} aria-label={t('employees.preview.counts')}>{countLine(preview.counts)}</div>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('employees.columns.row')}</th>
                    <th scope="col">{t('employees.columns.name')}</th>
                    <th scope="col">{t('employees.columns.result')}</th>
                    <th scope="col">{t('employees.columns.reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.name ?? <span className={styles.muted}>—</span>}</td>
                      <td><span className={styles.chip}>{t(`employees.outcome.${r.outcome}`)}</span></td>
                      <td>{reasonText(r.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.muted}>{t('employees.preview.nothingCreated')}</p>
            <div className={styles.rowActions}>
              <Button onClick={() => void confirm()} disabled={busy || preview.counts.created + preview.counts.linked === 0}>{t('employees.confirm')}</Button>
              <Button variant="outline" onClick={reset} disabled={busy}>{t('employees.cancel')}</Button>
            </div>
          </div>
        </div>
      )}

      {outcome && preview && (
        <div className={styles.card} role="status">
          <div className={styles.cardBody}>
            <h2 className={styles.sectionTitle}>{t('employees.result.title')}</h2>
            <div className={styles.chips}>{countLine(outcome.counts)}</div>
            <div className={styles.rowActions}>
              {outcome.rows.length > 0 && <Button variant="outline" onClick={() => void downloadResult(outcome.id, preview.fileName)}>{t('employees.result.download')}</Button>}
              <Button variant="ghost" onClick={reset}>{t('employees.result.another')}</Button>
            </div>
          </div>
        </div>
      )}

      {company && (
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.sectionTitle}>{t('employees.history.title')}</h2>
            {history.length === 0 ? (
              <p>{t('employees.history.empty')}</p>
            ) : (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t('employees.history.when')}</th>
                      <th scope="col">{t('employees.history.who')}</th>
                      <th scope="col">{t('employees.history.file')}</th>
                      <th scope="col">{t('employees.history.counts')}</th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>{dates.dateTime(h.confirmedAt ?? h.createdAt)}</td>
                        <td>{h.uploadedByName ?? <span className={styles.muted}>—</span>}</td>
                        <td>{h.fileName} <span className={styles.chip}>{t(`employees.history.status.${h.status}`)}</span></td>
                        <td><div className={styles.chips}>{countLine(h)}</div></td>
                        <td>
                          {h.status === 'CONFIRMED' && h.skipped + h.refused + h.errors > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => void downloadResult(h.id, h.fileName)}>{t('employees.result.download')}</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
