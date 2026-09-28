import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/Badge';
import { LookupListEditor, type LookupColumn } from '../../../components/settings/LookupListEditor/LookupListEditor';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import { useLookupList } from '../../../hooks/useLookupList';
import type { RiskLevel } from '../../../services/lookupService';
import { lookupErrorMessage } from './lookupErrorMessage';
import styles from './ListsSettingsContent.module.css';

/** Settings → Lists → Risk levels (FR-SET-02). */
export const RiskLevelsList = () => {
  const { t } = useTranslation('settings');
  const riskLevels = useLookupList('risk-levels');

  useEffect(() => {
    riskLevels.fetchItems();
  }, [riskLevels.fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: LookupColumn<RiskLevel>[] = [
    {
      field: 'level',
      header: t('lists.columns.level'),
      render: (item) => <Badge variant="secondary">{t('lists.levelBadge', { level: item.level })}</Badge>,
      renderInput: ({ id, label, value, onChange }) => (
        <input
          id={id}
          className={editorStyles.input}
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ),
      draftOf: (item) => (item ? String(item.level) : String(Math.max(0, ...riskLevels.items.map((r) => r.level)) + 1)),
    },
    {
      field: 'description',
      header: t('lists.columns.description'),
      render: (item) => item.description ?? <span className={editorStyles.muted}>—</span>,
      renderInput: ({ id, label, value, onChange }) => (
        <input id={id} className={editorStyles.input} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} />
      ),
      draftOf: (item) => item?.description ?? '',
    },
  ];

  if (riskLevels.loading && riskLevels.items.length === 0) {
    return <p className={styles.mutedText}>{t('lists.loading')}</p>;
  }
  if (riskLevels.loadFailed && riskLevels.items.length === 0) {
    return <p className={styles.errorText} role="alert">{t('lists.loadFailed')}</p>;
  }

  return (
    <LookupListEditor
      caption={t('lists.tabs.riskLevels')}
      items={riskLevels.items}
      columns={columns}
      toValues={(draft) => ({ level: Number(draft.level), description: draft.description.trim() || null })}
      onCreate={riskLevels.create}
      onUpdate={riskLevels.update}
      onReorder={riskLevels.reorder}
      onSetActive={riskLevels.setActive}
      onDelete={riskLevels.remove}
      errorMessage={(err) => lookupErrorMessage(err, t)}
    />
  );
};
