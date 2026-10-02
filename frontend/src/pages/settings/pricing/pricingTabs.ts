import type { PricingConfigState } from '../../../hooks/usePricingConfig';
import type { PricingConfiguration } from '../../../services/pricingService';

/** Settings → Pricing's tabs, in order; the URL names the open one. */
export const PRICING_TABS = ['bands', 'risk', 'frequencies', 'zones', 'cap', 'services', 'packages', 'offer', 'calculator'] as const;
export type PricingTab = (typeof PRICING_TABS)[number];

/** What every panel receives: the loaded configuration and the writes that reload it. */
export interface PricingPanelProps {
  config: PricingConfiguration;
  pricing: PricingConfigState;
}
