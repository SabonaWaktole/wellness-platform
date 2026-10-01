import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import { useMoneyFormat } from '../../../hooks/useMoneyFormat';
import type { EmployeeBand } from '../../../services/pricingService';
import type { PricingPanelProps } from './pricingTabs';
import { pricingErrorMessage } from './pricingErrorMessage';

const NEW_ROW = 'new';

type BandDraft = { minEmployees: string; maxEmployees: string; baseFee: string; perEmployeeFee: string };

/**
 * Employee bands (FR-PCF-01): from and to number of employees, the base fee
 * for the band's first employee and the fee per extra employee. The server
 * refuses overlapping bands and explains which band it overlaps. Laid out
 * like the lists editor, whose styles turn each row into a card below 640px.
 */
export const EmployeeBandsPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t } = useTranslation('settings');
  const { format } = useMoneyFormat();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<BandDraft>({ minEmployees: '', maxEmployees: '', baseFee: '', perEmployeeFee: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<EmployeeBand | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const range = (band: Pick<EmployeeBand, 'minEmployees' | 'maxEmployees'>) =>
    t('pricing.employeesRange', { min: band.minEmployees, max: band.maxEmployees });

  const startEdit = (band?: EmployeeBand) => {
    setError(null);
    setEditing(band ? band.id : NEW_ROW);
    const next = Math.max(0, ...config.bands.map((b) => b.maxEmployees)) + 1;
    setDraft({
      minEmployees: String(band?.minEmployees ?? next),
      maxEmployees: String(band?.maxEmployees ?? ''),
      baseFee: band?.baseFee ?? '',
      perEmployeeFee: band?.perEmployeeFee ?? '',
    });
  };

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(pricingErrorMessage(err, t));
      return false;
    }
  };

  const save = async () => {
    // Employees as whole numbers; amounts as typed, so the server judges the
    // decimals (FR-PCF-03) rather than a float conversion here.
    const values = {
      minEmployees: Number(draft.minEmployees),
      maxEmployees: Number(draft.maxEmployees),
      baseFee: draft.baseFee.trim(),
      perEmployeeFee: draft.perEmployeeFee.trim(),
    };
    setSaving(true);
    const saved = await run(() => (editing === NEW_ROW ? pricing.create('bands', values) : pricing.update('bands', editing!, values)));
    setSaving(false);
    if (saved) setEditing(null);
  };

  const field = (name: keyof BandDraft) => (e: ChangeEvent<HTMLInputElement>) =>
    setDraft((current) => ({ ...current, [name]: e.target.value }));

  const columns: Array<{ key: keyof BandDraft; label: string; numeric: 'whole' | 'amount' }> = [
    { key: 'minEmployees', label: t('pricing.columns.minEmployees'), numeric: 'whole' },
    { key: 'maxEmployees', label: t('pricing.columns.maxEmployees'), numeric: 'whole' },
    { key: 'baseFee', label: t('pricing.columns.baseFee'), numeric: 'amount' },
    { key: 'perEmployeeFee', label: t('pricing.columns.perEmployeeFee'), numeric: 'amount' },
  ];

  const editCells = (rowId: string) => (
    <>
      {columns.map((column, index) => (
        <td key={column.key} className={editorStyles.cell} data-label={column.label}>
          <input
            id={`band-${rowId}-${column.key}`}
            className={editorStyles.input}
            aria-label={column.label}
            inputMode={column.numeric === 'whole' ? 'numeric' : 'decimal'}
            value={draft[column.key]}
            onChange={field(column.key)}
            autoFocus={index === 0}
          />
        </td>
      ))}
      <td className={editorStyles.cell} />
      <td className={`${editorStyles.cell} ${editorStyles.actionsCell}`}>
        <div className={editorStyles.actions}>
          <Button size="sm" variant="primary" onClick={save} isLoading={saving}>
            <Check size={16} aria-hidden="true" />
            {t('lists.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
            <X size={16} aria-hidden="true" />
            {t('lists.cancel')}
          </Button>
        </div>
      </td>
    </>
  );

  return (
    <div className={editorStyles.editor}>
      {error && (
        <p className={editorStyles.errorText} role="alert">
          {error}
        </p>
      )}

      <table className={editorStyles.table}>
        <caption className={editorStyles.srOnly}>{t('pricing.tabs.bands')}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.label}
              </th>
            ))}
            <th scope="col">{t('lists.columns.status')}</th>
            <th scope="col">
              <span className={editorStyles.srOnly}>{t('lists.columns.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {config.bands.map((band) => (
            <tr key={band.id} className={`${editorStyles.row} ${band.active ? '' : editorStyles.inactiveRow}`} data-testid={`band-row-${band.id}`}>
              {editing === band.id ? (
                editCells(band.id)
              ) : (
                <>
                  <td className={`${editorStyles.cell} ${editorStyles.nameCell}`} data-label={columns[0].label}>
                    {band.minEmployees}
                  </td>
                  <td className={editorStyles.cell} data-label={columns[1].label}>
                    {band.maxEmployees}
                  </td>
                  <td className={editorStyles.cell} data-label={columns[2].label}>
                    {format(Number(band.baseFee))}
                  </td>
                  <td className={editorStyles.cell} data-label={columns[3].label}>
                    {format(Number(band.perEmployeeFee))}
                  </td>
                  <td className={editorStyles.cell} data-label={t('lists.columns.status')}>
                    <Badge variant={band.active ? 'success' : 'outline'}>{band.active ? t('lists.active') : t('lists.inactive')}</Badge>
                  </td>
                  <td className={`${editorStyles.cell} ${editorStyles.actionsCell}`}>
                    <div className={editorStyles.actions}>
                      <button
                        type="button"
                        className={editorStyles.iconButton}
                        onClick={() => startEdit(band)}
                        disabled={editing !== null}
                        aria-label={t('pricing.editBand', { range: range(band) })}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={editorStyles.iconButton}
                        onClick={() => void run(() => pricing.setActive('bands', band.id, !band.active))}
                        disabled={editing !== null}
                        aria-label={t(band.active ? 'pricing.deactivateBand' : 'pricing.reactivateBand', { range: range(band) })}
                        title={t(band.active ? 'pricing.deactivateBand' : 'pricing.reactivateBand', { range: range(band) })}
                      >
                        <Power size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`${editorStyles.iconButton} ${editorStyles.dangerButton}`}
                        onClick={() => {
                          setDeleteError(null);
                          setToDelete(band);
                        }}
                        disabled={editing !== null}
                        aria-label={t('pricing.deleteBand', { range: range(band) })}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
          {editing === NEW_ROW && <tr className={`${editorStyles.row} ${editorStyles.newRow}`}>{editCells(NEW_ROW)}</tr>}
        </tbody>
      </table>

      {config.bands.length === 0 && editing !== NEW_ROW && <p className={editorStyles.muted}>{t('lists.empty')}</p>}

      <div>
        <Button variant="outline" size="sm" onClick={() => startEdit()} disabled={editing !== null}>
          <Plus size={16} aria-hidden="true" />
          {t('pricing.addBand')}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          setDeleteError(null);
          try {
            await pricing.remove('bands', toDelete.id);
          } catch (err) {
            setDeleteError(pricingErrorMessage(err, t));
            throw err;
          }
        }}
        title={t('lists.deleteConfirm.title')}
        confirmLabel={t('lists.deleteConfirm.confirm')}
        message={
          <>
            <p>{t('pricing.deleteBandConfirm', { range: toDelete ? range(toDelete) : '' })}</p>
            {deleteError && (
              <p className={editorStyles.errorText} role="alert">
                {deleteError}
              </p>
            )}
          </>
        }
      />
    </div>
  );
};
