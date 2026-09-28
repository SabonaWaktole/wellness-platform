import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/Badge';
import { LookupListEditor, type LookupColumn } from '../../../components/settings/LookupListEditor/LookupListEditor';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import { useLookupList } from '../../../hooks/useLookupList';
import type { City } from '../../../services/lookupService';
import { lookupLabel } from '../../../utils/lookupLabel';
import { lookupErrorMessage } from './lookupErrorMessage';
import styles from './ListsSettingsContent.module.css';

const ALL_AREAS = '';

/**
 * Settings → Lists → Cities (FR-SET-04). Filtered by area: "All areas" reads
 * every city but disables reordering, since a display order only means
 * something within one area.
 */
export const CitiesList = () => {
  const { t, i18n } = useTranslation('settings');
  const areas = useLookupList('areas');
  const [areaFilter, setAreaFilter] = useState(ALL_AREAS);
  const filter = useMemo(() => (areaFilter ? { areaId: areaFilter } : undefined), [areaFilter]);
  const cities = useLookupList('cities', filter);

  useEffect(() => {
    areas.fetchItems();
  }, [areas.fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cities.fetchItems();
  }, [cities.fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const areaName = (id: string) => {
    const area = areas.items.find((a) => a.id === id);
    return area ? lookupLabel(area, i18n.language) : '—';
  };

  const columns: LookupColumn<City>[] = [
    {
      field: 'areaId',
      header: t('lists.columns.area'),
      render: (item) => <Badge variant="secondary">{areaName(item.areaId)}</Badge>,
      renderInput: ({ id, label, value, onChange }) => (
        <select id={id} className={editorStyles.select} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          {value === '' && <option value="">{t('lists.chooseArea')}</option>}
          {areas.items
            .filter((area) => area.active || area.id === value)
            .map((area) => (
              <option key={area.id} value={area.id}>
                {lookupLabel(area, i18n.language)}
                {area.active ? '' : ` (${t('lists.inactive')})`}
              </option>
            ))}
        </select>
      ),
      draftOf: (item) => item?.areaId ?? areaFilter ?? areas.items.find((area) => area.active)?.id ?? '',
    },
  ];

  if ((cities.loading || areas.loading) && cities.items.length === 0) {
    return <p className={styles.mutedText}>{t('lists.loading')}</p>;
  }
  if (cities.loadFailed || areas.loadFailed) {
    return <p className={styles.errorText} role="alert">{t('lists.loadFailed')}</p>;
  }

  return (
    <div className={styles.editorWithFilter}>
      <label className={styles.filterRow}>
        <span>{t('lists.columns.area')}</span>
        <select
          className={editorStyles.select}
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          aria-label={t('lists.columns.area')}
        >
          <option value={ALL_AREAS}>{t('lists.allAreas')}</option>
          {areas.items.map((area) => (
            <option key={area.id} value={area.id}>
              {lookupLabel(area, i18n.language)}
              {area.active ? '' : ` (${t('lists.inactive')})`}
            </option>
          ))}
        </select>
      </label>

      <LookupListEditor
        caption={t('lists.tabs.cities')}
        items={cities.items}
        columns={columns}
        toValues={(draft) => ({ areaId: draft.areaId })}
        onCreate={cities.create}
        onUpdate={cities.update}
        onReorder={cities.reorder}
        onSetActive={cities.setActive}
        onDelete={cities.remove}
        errorMessage={(err) => lookupErrorMessage(err, t)}
        reorderable={areaFilter !== ALL_AREAS}
      />
    </div>
  );
};
