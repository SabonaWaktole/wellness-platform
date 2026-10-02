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
import { FollowUpIntervalsList } from './FollowUpIntervalsList';
import { LostReasonsList } from './LostReasonsList';
import { ActivityResultsList } from './ActivityResultsList';
import { usePermission } from '../../../hooks/usePermission';
import styles from './ListsSettingsContent.module.css';

const LISTS: LookupListKey[] = [
  'risk-levels',
  'business-types',
  'areas',
  'cities',
  'follow-up-intervals',
  'lost-reasons',
  'activity-results',
];

/** The lists `activityResults.manage` reaches without `settings.manage` (SRS §9.2, FR-ACT-03). */
const ACTIVITY_RESULT_LISTS: LookupListKey[] = ['activity-results'];

const TAB_LABEL: Record<LookupListKey, string> = {
  'risk-levels': 'lists.tabs.riskLevels',
  'business-types': 'lists.tabs.businessTypes',
  areas: 'lists.tabs.areas',
  cities: 'lists.tabs.cities',
  'follow-up-intervals': 'lists.tabs.followUpIntervals',
  'lost-reasons': 'lists.tabs.lostReasons',
  'activity-results': 'lists.tabs.activityResults',
};

const HINT: Record<LookupListKey, string> = {
  'risk-levels': 'lists.hints.riskLevels',
  'business-types': 'lists.hints.businessTypes',
  areas: 'lists.hints.areas',
  cities: 'lists.hints.cities',
  'follow-up-intervals': 'lists.hints.followUpIntervals',
  'lost-reasons': 'lists.hints.lostReasons',
  'activity-results': 'lists.hints.activityResults',
};

const PANEL: Record<LookupListKey, ComponentType> = {
  'risk-levels': RiskLevelsList,
  'business-types': BusinessTypesList,
  areas: AreasList,
  cities: CitiesList,
  'follow-up-intervals': FollowUpIntervalsList,
  'lost-reasons': LostReasonsList,
  'activity-results': ActivityResultsList,
};

/**
 * Settings → Lists (Slices 8, 9, 10): the admin-managed values the company
 * form and, from Milestone 2, deals and activities offer. One tab per list;
 * the URL names the open one, so it can be linked. A role with only
 * `activityResults.manage` sees the activity results alone.
 */
export const ListsSettingsContent = () => {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { tenantSlug, list } = useParams();
  const lists = usePermission('settings.manage') ? LISTS : ACTIVITY_RESULT_LISTS;
  const active: LookupListKey = lists.includes(list as LookupListKey) ? (list as LookupListKey) : lists[0];
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
        tabs={lists.map((key) => ({ id: key, label: t(TAB_LABEL[key]) }))}
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
