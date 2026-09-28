import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Pencil, Check, X } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ColorPicker } from '../../../components/ui/ColorPicker';
import { useStatusLabelsStore } from '../../../store/useStatusLabelsStore';
import { statusLabelService, type StatusDomain, type StatusLabelItem } from '../../../services/statusLabelService';
import { lookupLabel } from '../../../utils/lookupLabel';
import styles from './StatusesSettingsContent.module.css';

const DOMAINS: StatusDomain[] = ['contract', 'payment'];

interface Draft {
  labelSq: string;
  labelEn: string;
  colour: string;
}

function statusErrorMessage(err: any, t: (key: string) => string): string {
  const code = err?.response?.data?.code;
  if (code === 'STATUS_KEY_NOT_FOUND' || code === 'INVALID_STATUS_LABEL' || code === 'INVALID_STATUS_ORDER') {
    return t(`statuses.errors.${code}`);
  }
  return t('statuses.errors.generic');
}

/** One domain's statuses: label, colour and order, editable in place. */
function StatusDomainSection({ domain }: { domain: StatusDomain }) {
  const { t, i18n } = useTranslation('settings');
  const { tenantSlug } = useParams();
  const ensureLoaded = useStatusLabelsStore((state) => state.ensureLoaded);
  const items = useStatusLabelsStore((state) => (tenantSlug ? state.byDomain[`${tenantSlug}:${domain}`] : undefined));
  const loading = useStatusLabelsStore((state) => (tenantSlug ? state.loading[`${tenantSlug}:${domain}`] : false));

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ labelSq: '', labelEn: '', colour: '#64748B' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tenantSlug) ensureLoaded(tenantSlug, domain);
  }, [tenantSlug, domain, ensureLoaded]);

  if (loading && !items) {
    return <p className={styles.mutedText}>{t('statuses.loading')}</p>;
  }
  if (!items) {
    return <p className={styles.errorText} role="alert">{t('statuses.loadFailed')}</p>;
  }

  const startEdit = (item: StatusLabelItem) => {
    setEditingKey(item.key);
    setDraft({ labelSq: item.labelSq, labelEn: item.labelEn ?? '', colour: item.colour });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setError(null);
  };

  const save = async (key: string) => {
    if (!tenantSlug) return;
    setBusy(true);
    setError(null);
    try {
      await statusLabelService.update(tenantSlug, domain, key, {
        labelSq: draft.labelSq,
        labelEn: draft.labelEn.trim() || null,
        colour: draft.colour,
      });
      await ensureLoaded(tenantSlug, domain, true);
      setEditingKey(null);
    } catch (err) {
      setError(statusErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!tenantSlug) return;
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const keys = items.map((item) => item.key);
    [keys[index], keys[target]] = [keys[target], keys[index]];
    setBusy(true);
    setError(null);
    try {
      await statusLabelService.reorder(tenantSlug, domain, keys);
      await ensureLoaded(tenantSlug, domain, true);
    } catch (err) {
      setError(statusErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="md" className={styles.section}>
      <h3 className={styles.sectionTitle}>{t(`statuses.sections.${domain}`)}</h3>
      {error && <p className={styles.errorText} role="alert">{error}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('statuses.columns.order')}</th>
            <th>{t('statuses.columns.labelSq')}</th>
            <th>{t('statuses.columns.labelEn')}</th>
            <th>{t('statuses.columns.colour')}</th>
            <th>{t('statuses.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) =>
            editingKey === item.key ? (
              <tr key={item.key} className={styles.row}>
                <td className={styles.cell} colSpan={5}>
                  <div className={styles.editForm}>
                    <input
                      className={styles.input}
                      aria-label={t('statuses.columns.labelSq')}
                      value={draft.labelSq}
                      onChange={(e) => setDraft((d) => ({ ...d, labelSq: e.target.value }))}
                      maxLength={100}
                    />
                    <input
                      className={styles.input}
                      aria-label={t('statuses.columns.labelEn')}
                      placeholder={t('statuses.optional')}
                      value={draft.labelEn}
                      onChange={(e) => setDraft((d) => ({ ...d, labelEn: e.target.value }))}
                      maxLength={100}
                    />
                    <ColorPicker
                      label={t('statuses.columns.colour')}
                      value={draft.colour}
                      onChange={(value) => value && setDraft((d) => ({ ...d, colour: value }))}
                    />
                    <div className={styles.editActions}>
                      <Button size="sm" variant="primary" icon={<Check size={14} />} isLoading={busy} onClick={() => save(item.key)}>
                        {t('statuses.save')}
                      </Button>
                      <Button size="sm" variant="outline" icon={<X size={14} />} onClick={cancelEdit} disabled={busy}>
                        {t('statuses.cancel')}
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={item.key} className={styles.row}>
                <td className={styles.cell} data-label={t('statuses.columns.order')}>
                  <div className={styles.orderControls}>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t('statuses.moveUp', { name: item.labelSq })}
                      onClick={() => move(index, -1)}
                      disabled={busy || index === 0}
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t('statuses.moveDown', { name: item.labelSq })}
                      onClick={() => move(index, 1)}
                      disabled={busy || index === items.length - 1}
                    >
                      <ArrowDown size={14} />
                    </Button>
                  </div>
                </td>
                <td className={styles.cell} data-label={t('statuses.columns.labelSq')}>
                  <span className={styles.labelWithSwatch}>
                    <span className={styles.swatch} style={{ backgroundColor: item.colour }} aria-hidden="true" />
                    {lookupLabel({ nameSq: item.labelSq, nameEn: item.labelEn }, i18n.language)}
                  </span>
                </td>
                <td className={styles.cell} data-label={t('statuses.columns.labelEn')}>
                  {item.labelEn || <span className={styles.muted}>{t('statuses.fallsBackToSq')}</span>}
                </td>
                <td className={styles.cell} data-label={t('statuses.columns.colour')}>
                  {item.colour}
                </td>
                <td className={styles.cell} data-label={t('statuses.columns.actions')}>
                  <div className={styles.rowActions}>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t('statuses.edit', { name: item.labelSq })}
                      onClick={() => startEdit(item)}
                      disabled={busy}
                    >
                      <Pencil size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </Card>
  );
}

/** Settings → Statuses (Slice 10: FR-SET-07, 08). */
export const StatusesSettingsContent = () => {
  const { t } = useTranslation('settings');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>{t('statuses.title')}</h2>
        <p className={styles.headerSubtitle}>{t('statuses.subtitle')}</p>
      </div>
      {DOMAINS.map((domain) => (
        <StatusDomainSection key={domain} domain={domain} />
      ))}
      <p className={styles.mutedText}>{t('statuses.waivedNotice')}</p>
    </div>
  );
};
