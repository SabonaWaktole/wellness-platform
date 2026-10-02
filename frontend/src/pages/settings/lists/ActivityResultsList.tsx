import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LookupListEditor } from '../../../components/settings/LookupListEditor/LookupListEditor';
import { useLookupList } from '../../../hooks/useLookupList';
import { lookupErrorMessage } from './lookupErrorMessage';
import styles from './ListsSettingsContent.module.css';

/** Settings → Lists → Activity results (FR-ACT-03). Labels only, no list-specific column. */
export const ActivityResultsList = () => {
  const { t } = useTranslation('settings');
  const results = useLookupList('activity-results');

  useEffect(() => {
    results.fetchItems();
  }, [results.fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  if (results.loading && results.items.length === 0) {
    return <p className={styles.mutedText}>{t('lists.loading')}</p>;
  }
  if (results.loadFailed && results.items.length === 0) {
    return <p className={styles.errorText} role="alert">{t('lists.loadFailed')}</p>;
  }

  return (
    <LookupListEditor
      caption={t('lists.tabs.activityResults')}
      items={results.items}
      onCreate={results.create}
      onUpdate={results.update}
      onReorder={results.reorder}
      onSetActive={results.setActive}
      onDelete={results.remove}
      errorMessage={(err) => lookupErrorMessage(err, t)}
    />
  );
};
