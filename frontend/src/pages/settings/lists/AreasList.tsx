import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { LookupListEditor } from '../../../components/settings/LookupListEditor/LookupListEditor';
import { useLookupList } from '../../../hooks/useLookupList';
import { lookupLabel } from '../../../utils/lookupLabel';
import { lookupErrorMessage } from './lookupErrorMessage';
import styles from './ListsSettingsContent.module.css';

interface PendingCascade {
  id: string;
  name: string;
  activeCities: number;
}

const isAreaHasActiveCitiesError = (err: unknown): err is { response: { data: { activeCities: number } } } =>
  (err as any)?.response?.data?.code === 'AREA_HAS_ACTIVE_CITIES';

/**
 * Settings → Lists → Areas (FR-SET-03). Deactivating an area with active
 * cities is offered a cascade instead of a flat refusal (FR-SET-04).
 */
export const AreasList = () => {
  const { t, i18n } = useTranslation('settings');
  const areas = useLookupList('areas');
  const [pendingCascade, setPendingCascade] = useState<PendingCascade | null>(null);
  const [cascadeError, setCascadeError] = useState<string | null>(null);

  useEffect(() => {
    areas.fetchItems();
  }, [areas.fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetActive = async (id: string, active: boolean) => {
    if (active) {
      await areas.setActive(id, true);
      return;
    }
    try {
      await areas.setActive(id, false);
    } catch (err) {
      if (isAreaHasActiveCitiesError(err)) {
        const area = areas.items.find((a) => a.id === id);
        setCascadeError(null);
        setPendingCascade({ id, name: area ? lookupLabel(area, i18n.language) : '', activeCities: err.response.data.activeCities });
        return; // handled by the dialog below, not the editor's inline error
      }
      throw err;
    }
  };

  const confirmCascade = async () => {
    if (!pendingCascade) return;
    setCascadeError(null);
    try {
      await areas.setActive(pendingCascade.id, false, true);
      setPendingCascade(null);
    } catch (err) {
      setCascadeError(lookupErrorMessage(err, t));
      throw err; // rethrown so the dialog stays open with the reason showing
    }
  };

  if (areas.loading && areas.items.length === 0) {
    return <p className={styles.mutedText}>{t('lists.loading')}</p>;
  }
  if (areas.loadFailed && areas.items.length === 0) {
    return <p className={styles.errorText} role="alert">{t('lists.loadFailed')}</p>;
  }

  return (
    <>
      <LookupListEditor
        caption={t('lists.tabs.areas')}
        items={areas.items}
        onCreate={areas.create}
        onUpdate={areas.update}
        onReorder={areas.reorder}
        onSetActive={handleSetActive}
        onDelete={areas.remove}
        errorMessage={(err) => lookupErrorMessage(err, t)}
      />

      <ConfirmDialog
        isOpen={pendingCascade !== null}
        onClose={() => setPendingCascade(null)}
        onConfirm={confirmCascade}
        title={t('lists.cascadeConfirm.title')}
        confirmLabel={t('lists.cascadeConfirm.confirm')}
        tone="primary"
        message={
          <>
            <p>
              {t('lists.cascadeConfirm.message', { name: pendingCascade?.name ?? '', count: pendingCascade?.activeCities ?? 0 })}
            </p>
            {cascadeError && (
              <p className={styles.errorText} role="alert">
                {cascadeError}
              </p>
            )}
          </>
        }
      />
    </>
  );
};
