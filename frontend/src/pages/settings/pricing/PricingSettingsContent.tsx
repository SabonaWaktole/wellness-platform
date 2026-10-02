import { useEffect } from 'react';
import type { ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/Card';
import { Tabs } from '../../../components/ui/Tabs';
import { usePricingConfig } from '../../../hooks/usePricingConfig';
import { EmployeeBandsPanel } from './EmployeeBandsPanel';
import { RiskSurchargesPanel } from './RiskSurchargesPanel';
import { VisitFrequenciesPanel } from './VisitFrequenciesPanel';
import { PriceZonesPanel } from './PriceZonesPanel';
import { DiscountCapPanel } from './DiscountCapPanel';
import { TestCalculatorPanel } from './TestCalculatorPanel';
import { ServicesPanel } from './ServicesPanel';
import { PackagesPanel } from './PackagesPanel';
import { OfferSettingsPanel } from './OfferSettingsPanel';
import { PRICING_TABS, type PricingPanelProps, type PricingTab } from './pricingTabs';
import styles from './PricingSettings.module.css';

const PANEL: Record<PricingTab, ComponentType<PricingPanelProps>> = {
  bands: EmployeeBandsPanel,
  risk: RiskSurchargesPanel,
  frequencies: VisitFrequenciesPanel,
  zones: PriceZonesPanel,
  cap: DiscountCapPanel,
  services: ServicesPanel,
  packages: PackagesPanel,
  offer: OfferSettingsPanel,
  calculator: TestCalculatorPanel,
};

/**
 * Settings → Pricing (M2 Slices 3 and 4: FR-PCF-01..09): every number of the
 * pricing model, the services and packages the offer describes, the offer
 * settings, one tab per part, and a test calculator. The URL names the
 * open tab, so it can be linked. Only for `pricing.manage`; the route checks.
 */
export const PricingSettingsContent = () => {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { tenantSlug, tab } = useParams();
  const active: PricingTab = PRICING_TABS.includes(tab as PricingTab) ? (tab as PricingTab) : 'bands';
  const pricing = usePricingConfig();
  const Panel = PANEL[active];

  useEffect(() => {
    pricing.fetchConfig();
  }, [pricing.fetchConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>{t('pricing.title')}</h2>
        <p className={styles.headerSubtitle}>{t('pricing.subtitle')}</p>
      </div>

      <Tabs
        idBase="pricing"
        label={t('pricing.title')}
        tabs={PRICING_TABS.map((key) => ({ id: key, label: t(`pricing.tabs.${key}`) }))}
        activeId={active}
        onChange={(key) => navigate(`/${tenantSlug}/settings/pricing/${key}`)}
      />

      <Card padding="md" className={styles.panel} id={`pricing-panel-${active}`} role="tabpanel" aria-labelledby={`pricing-tab-${active}`}>
        <p className={styles.mutedText}>{t(`pricing.hints.${active}`)}</p>
        {pricing.config ? (
          <Panel config={pricing.config} pricing={pricing} />
        ) : pricing.loadFailed ? (
          <p className={styles.errorText} role="alert">
            {t('pricing.loadFailed')}
          </p>
        ) : (
          <p className={styles.mutedText}>{t('pricing.loading')}</p>
        )}
      </Card>
    </div>
  );
};
