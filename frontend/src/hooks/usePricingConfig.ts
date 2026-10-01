import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  pricingService,
  type CityWithoutZone,
  type PricingConfiguration,
  type PricingListKey,
  type PricingValues,
  type TestCalculationInput,
} from '../services/pricingService';

/**
 * The whole pricing configuration for Settings → Pricing (M2 Slice 3), with
 * the cities in no zone. It is small, and one value can change another screen
 * (a new zone city leaves the warning list), so every write reloads both
 * rather than patching a local copy: the screen always shows what was saved.
 */
export const usePricingConfig = () => {
  const { tenantSlug } = useParams();
  const [config, setConfig] = useState<PricingConfiguration | null>(null);
  const [citiesWithoutZone, setCitiesWithoutZone] = useState<CityWithoutZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const [nextConfig, nextCities] = await Promise.all([
        pricingService.config(tenantSlug),
        pricingService.citiesWithoutZone(tenantSlug),
      ]);
      setConfig(nextConfig);
      setCitiesWithoutZone(nextCities);
    } catch (error) {
      console.error('Failed to fetch the pricing configuration', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  /** Runs one write, then reloads. A refusal is rethrown for the caller to explain. */
  const write = (action: (slug: string) => Promise<unknown>) => async () => {
    await action(tenantSlug!);
    await fetchConfig();
  };

  return {
    config,
    citiesWithoutZone,
    loading,
    loadFailed,
    fetchConfig,
    create: (list: PricingListKey, values: PricingValues) => write((slug) => pricingService.create(slug, list, values))(),
    update: (list: PricingListKey, id: string, values: PricingValues) =>
      write((slug) => pricingService.update(slug, list, id, values))(),
    reorder: (list: 'frequencies' | 'zones', ids: string[]) => write((slug) => pricingService.reorder(slug, list, ids))(),
    setActive: (list: PricingListKey, id: string, active: boolean) =>
      write((slug) => pricingService.setActive(slug, list, id, active))(),
    remove: (list: PricingListKey, id: string) => write((slug) => pricingService.remove(slug, list, id))(),
    setZoneCities: (zoneId: string, cityIds: string[]) => write((slug) => pricingService.setZoneCities(slug, zoneId, cityIds))(),
    setRiskSurcharge: (riskLevelId: string, percent: string) =>
      write((slug) => pricingService.setRiskSurcharge(slug, riskLevelId, percent))(),
    setDiscountCap: (percent: string) => write((slug) => pricingService.setDiscountCap(slug, percent))(),
    /** Stores nothing, so nothing to reload. */
    testCalculation: (input: TestCalculationInput) => pricingService.testCalculation(tenantSlug!, input),
  };
};

export type PricingConfigState = ReturnType<typeof usePricingConfig>;
