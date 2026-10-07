import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/Card';
import { Tabs } from '../../../components/ui/Tabs';
import { useAuthStore } from '../../../store/useAuthStore';
import { membershipSettingsService, type MembershipRules, type TierSetting } from '../../../services/membershipSettingsService';
import { TiersPanel } from './TiersPanel';
import { RulesPanel } from './RulesPanel';
import { RelationshipsPanel } from './RelationshipsPanel';
import { BenefitsPanel } from './BenefitsPanel';
import styles from './WellnessPlusSettings.module.css';

export const WELLNESS_PLUS_TABS = ['tiers', 'rules', 'relationships', 'benefits'] as const;
export type WellnessPlusTab = (typeof WELLNESS_PLUS_TABS)[number];

/**
 * Settings → Wellness+ (M4 Slice 3): tiers and fees, rules, relationships and
 * the benefit table. The Administrator (`wellnessplus.settings.manage`) sees
 * all four; anyone else who reaches the page (members.view or members.verify)
 * sees only the benefit table, read only (FR-BEN-04). The server checks every
 * call either way.
 */
export const WellnessPlusSettingsContent = () => {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { tenantSlug = '', tab } = useParams();
  const { user } = useAuthStore();
  const canManage = user?.permissions?.['wellnessplus.settings.manage'] !== undefined;
  const allowed: readonly WellnessPlusTab[] = canManage ? WELLNESS_PLUS_TABS : ['benefits'];
  const active: WellnessPlusTab = allowed.includes(tab as WellnessPlusTab) ? (tab as WellnessPlusTab) : allowed[0];

  const [tiers, setTiers] = useState<TierSetting[] | null>(null);
  const [rules, setRules] = useState<MembershipRules | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!canManage || !tenantSlug) return;
    membershipSettingsService
      .getSettings(tenantSlug)
      .then((data) => {
        setTiers(data.tiers);
        setRules(data.settings);
      })
      .catch(() => setLoadFailed(true));
  }, [canManage, tenantSlug]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>{t('wellnessPlus.title')}</h2>
        <p className={styles.headerSubtitle}>{t(canManage ? 'wellnessPlus.subtitle' : 'wellnessPlus.subtitleReadOnly')}</p>
      </div>

      {allowed.length > 1 && (
        <Tabs
          idBase="wellness-plus"
          label={t('wellnessPlus.title')}
          tabs={allowed.map((key) => ({ id: key, label: t(`wellnessPlus.tabs.${key}`) }))}
          activeId={active}
          onChange={(key) => navigate(`/${tenantSlug}/settings/wellness-plus/${key}`)}
        />
      )}

      <Card padding="md" id={`wellness-plus-panel-${active}`} role="tabpanel" aria-labelledby={`wellness-plus-tab-${active}`}>
        {active === 'benefits' ? (
          <BenefitsPanel tenantSlug={tenantSlug} canEdit={canManage} />
        ) : active === 'relationships' ? (
          <RelationshipsPanel tenantSlug={tenantSlug} />
        ) : loadFailed ? (
          <p className={styles.error} role="alert">
            {t('wellnessPlus.loadFailed')}
          </p>
        ) : active === 'tiers' && tiers ? (
          <TiersPanel tenantSlug={tenantSlug} tiers={tiers} onSaved={(next) => setTiers((all) => all?.map((x) => (x.tier === next.tier ? next : x)) ?? all)} />
        ) : active === 'rules' && rules ? (
          <RulesPanel tenantSlug={tenantSlug} rules={rules} onSaved={setRules} />
        ) : (
          <p className={styles.status}>{t('wellnessPlus.loading')}</p>
        )}
      </Card>
    </div>
  );
};
