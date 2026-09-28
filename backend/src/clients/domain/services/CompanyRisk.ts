import { BusinessType, RiskLevel } from '../../../lookups/domain/LookupItem';

/**
 * A company's risk level is never stored (SRS §7.1) — it always follows its
 * business type, so recolouring or reclassifying a business type on Settings
 * updates every company's risk without a migration. This is the one place
 * that derivation happens.
 */
export function riskFor(
  businessTypeId: string | null | undefined,
  businessTypes: BusinessType[],
  riskLevels: RiskLevel[]
): RiskLevel | null {
  if (!businessTypeId) return null;
  const businessType = businessTypes.find((bt) => bt.id === businessTypeId);
  if (!businessType) return null;
  return riskLevels.find((rl) => rl.id === businessType.riskLevelId) ?? null;
}
