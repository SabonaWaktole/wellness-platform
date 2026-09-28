import type { ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/Card';
import { Tabs } from '../../../components/ui/Tabs';
import type { LookupListKey } from '../../../services/lookupService';
import { RiskLevelsList } from './RiskLevelsList';
import { BusinessTypesList } from './BusinessTypesList';
import { AreasList } from './AreasList';
import { CitiesList } from './CitiesList';
import styles from './ListsSettingsContent.module.css';

const LISTS: LookupListKey[] = ['risk-levels', 'business-types', 'areas', 'cities'];

const TAB_LABEL: Record<LookupListKey, string> = {
  'risk-levels': 'lists.tabs.riskLevels',
  'business-types': 'lists.tabs.businessTypes',
  areas: 'lists.tabs.areas',
  cities: 'lists.tabs.cities',
};

const HINT: Record<LookupListKey, string> = {
  'risk-levels': 'lists.hints.riskLevels',
  'business-types': 'lists.hints.businessTypes',
  areas: 'lists.hints.areas',
  cities: 'lists.hints.cities',
};

const PANEL: Record<LookupListKey, ComponentType> = {
  'risk-levels': RiskLevelsList,
  'business-types': BusinessTypesList,
  areas: AreasList,
  cities: CitiesList,
};

/**
 * Settings → Lists (Slices 8, 9): the admin-managed values the company form
 * offers. One tab per list; the URL names the open one, so it can be linked.
 */
export const ListsSettingsContent = () => {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { tenantSlug, list } = useParams();
  const active: LookupListKey = LISTS.includes(list as LookupListKey) ? (list as LookupListKey) : 'risk-levels';
  const Panel = PANEL[active];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>{t('lists.title')}</h2>
        <p className={styles.headerSubtitle}>{t('lists.subtitle')}</p>
      </div>

      <Tabs
        idBase="lists"
        label={t('lists.title')}
        tabs={LISTS.map((key) => ({ id: key, label: t(TAB_LABEL[key]) }))}
        activeId={active}
        onChange={(key) => navigate(`/${tenantSlug}/settings/lists/${key}`)}
      />

      <Card padding="md" className={styles.panel} id={`lists-panel-${active}`} role="tabpanel" aria-labelledby={`lists-tab-${active}`}>
        <p className={styles.mutedText}>{t(HINT[active])}</p>
        <Panel />
      </Card>
    </div>
  );
};
