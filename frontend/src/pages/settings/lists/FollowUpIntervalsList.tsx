import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LookupListEditor, type LookupColumn } from '../../../components/settings/LookupListEditor/LookupListEditor';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import { useLookupList } from '../../../hooks/useLookupList';
import type { FollowUpInterval } from '../../../services/lookupService';
import { lookupErrorMessage } from './lookupErrorMessage';
import styles from './ListsSettingsContent.module.css';

/** Settings → Lists → Follow-up intervals (FR-SET-05). */
export const FollowUpIntervalsList = () => {
  const { t } = useTranslation('settings');
  const intervals = useLookupList('follow-up-intervals');

  useEffect(() => {
    intervals.fetchItems();
  }, [intervals.fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: LookupColumn<FollowUpInterval>[] = [
    {
      field: 'days',
      header: t('lists.columns.days'),
      render: (item) => t('lists.daysValue', { count: item.days }),
      renderInput: ({ id, label, value, onChange }) => (
        <input
          id={id}
          className={editorStyles.input}
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ),
      draftOf: (item) => (item ? String(item.days) : ''),
    },
  ];

  if (intervals.loading && intervals.items.length === 0) {
    return <p className={styles.mutedText}>{t('lists.loading')}</p>;
  }
  if (intervals.loadFailed && intervals.items.length === 0) {
    return <p className={styles.errorText} role="alert">{t('lists.loadFailed')}</p>;
  }

  return (
    <LookupListEditor
      caption={t('lists.tabs.followUpIntervals')}
      items={intervals.items}
      columns={columns}
      toValues={(draft) => ({ days: Number(draft.days) })}
      onCreate={intervals.create}
      onUpdate={intervals.update}
      onReorder={intervals.reorder}
      onSetActive={intervals.setActive}
      onDelete={intervals.remove}
      errorMessage={(err) => lookupErrorMessage(err, t)}
    />
  );
};
