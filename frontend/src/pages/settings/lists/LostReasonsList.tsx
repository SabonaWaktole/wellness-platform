import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LookupListEditor } from '../../../components/settings/LookupListEditor/LookupListEditor';
import { useLookupList } from '../../../hooks/useLookupList';
import { lookupErrorMessage } from './lookupErrorMessage';
import styles from './ListsSettingsContent.module.css';

/** Settings → Lists → Lost-deal reasons (FR-SET-06). Labels only, no list-specific column. */
export const LostReasonsList = () => {
  const { t } = useTranslation('settings');
  const reasons = useLookupList('lost-reasons');

  useEffect(() => {
    reasons.fetchItems();
  }, [reasons.fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  if (reasons.loading && reasons.items.length === 0) {
    return <p className={styles.mutedText}>{t('lists.loading')}</p>;
  }
  if (reasons.loadFailed && reasons.items.length === 0) {
    return <p className={styles.errorText} role="alert">{t('lists.loadFailed')}</p>;
  }

  return (
    <LookupListEditor
      caption={t('lists.tabs.lostReasons')}
      items={reasons.items}
      onCreate={reasons.create}
      onUpdate={reasons.update}
      onReorder={reasons.reorder}
      onSetActive={reasons.setActive}
      onDelete={reasons.remove}
      errorMessage={(err) => lookupErrorMessage(err, t)}
    />
  );
};
