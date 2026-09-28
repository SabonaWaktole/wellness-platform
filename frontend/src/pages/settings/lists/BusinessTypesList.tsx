import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/Badge';
import { LookupListEditor, type LookupColumn } from '../../../components/settings/LookupListEditor/LookupListEditor';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import { useLookupList } from '../../../hooks/useLookupList';
import type { BusinessType } from '../../../services/lookupService';
import { lookupLabel } from '../../../utils/lookupLabel';
import { lookupErrorMessage } from './lookupErrorMessage';
import styles from './ListsSettingsContent.module.css';

/**
 * Settings → Lists → Business types (FR-SET-01). Each type belongs to one risk
 * level; the select offers active risk levels only, plus the type's current
 * one when that has since been deactivated, so the row still reads correctly.
 */
export const BusinessTypesList = () => {
  const { t, i18n } = useTranslation('settings');
  const businessTypes = useLookupList('business-types');
  const riskLevels = useLookupList('risk-levels');

  useEffect(() => {
    businessTypes.fetchItems();
    riskLevels.fetchItems();
  }, [businessTypes.fetchItems, riskLevels.fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const riskLevelName = (id: string) => {
    const riskLevel = riskLevels.items.find((r) => r.id === id);
    return riskLevel ? lookupLabel(riskLevel, i18n.language) : '—';
  };

  const columns: LookupColumn<BusinessType>[] = [
    {
      field: 'riskLevelId',
      header: t('lists.columns.riskLevel'),
      render: (item) => <Badge variant="secondary">{riskLevelName(item.riskLevelId)}</Badge>,
      renderInput: ({ id, label, value, onChange }) => (
        <select id={id} className={editorStyles.select} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          {value === '' && <option value="">{t('lists.chooseRiskLevel')}</option>}
          {riskLevels.items
            .filter((riskLevel) => riskLevel.active || riskLevel.id === value)
            .map((riskLevel) => (
              <option key={riskLevel.id} value={riskLevel.id}>
                {lookupLabel(riskLevel, i18n.language)}
                {riskLevel.active ? '' : ` (${t('lists.inactive')})`}
              </option>
            ))}
        </select>
      ),
      draftOf: (item) => item?.riskLevelId ?? riskLevels.items.find((riskLevel) => riskLevel.active)?.id ?? '',
    },
  ];

  if ((businessTypes.loading || riskLevels.loading) && businessTypes.items.length === 0) {
    return <p className={styles.mutedText}>{t('lists.loading')}</p>;
  }
  if (businessTypes.loadFailed || riskLevels.loadFailed) {
    return <p className={styles.errorText} role="alert">{t('lists.loadFailed')}</p>;
  }

  return (
    <LookupListEditor
      caption={t('lists.tabs.businessTypes')}
      items={businessTypes.items}
      columns={columns}
      toValues={(draft) => ({ riskLevelId: draft.riskLevelId })}
      onCreate={businessTypes.create}
      onUpdate={businessTypes.update}
      onReorder={businessTypes.reorder}
      onSetActive={businessTypes.setActive}
      onDelete={businessTypes.remove}
      errorMessage={(err) => lookupErrorMessage(err, t)}
    />
  );
};
