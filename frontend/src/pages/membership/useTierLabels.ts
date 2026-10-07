import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { membershipSettingsService, type Tier } from '../../services/membershipSettingsService';

interface TierStyle {
  label: string;
  colour: string | null;
}

const loaded = new Map<string, Promise<Array<{ tier: Tier; labelSq: string; labelEn: string; colour: string }>>>();

/**
 * The workspace's own tier labels and colours (FR-TIR-01), read from the benefit table every Wellness+
 * user may see. Until they arrive, or if they cannot be read, the default names stand in.
 */
export function useTierLabels(tenantSlug: string | undefined) {
  const { t, i18n } = useTranslation('members');
  const [tiers, setTiers] = useState<Awaited<ReturnType<typeof membershipSettingsService.getBenefits>>['tiers']>([]);

  useEffect(() => {
    if (!tenantSlug) return;
    if (!loaded.has(tenantSlug)) {
      loaded.set(
        tenantSlug,
        membershipSettingsService.getBenefits(tenantSlug).then(
          (table) => table.tiers,
          () => {
            loaded.delete(tenantSlug);
            return [];
          }
        )
      );
    }
    let live = true;
    void loaded.get(tenantSlug)!.then((rows) => live && setTiers(rows));
    return () => {
      live = false;
    };
  }, [tenantSlug]);

  return (tier: Tier): TierStyle => {
    const row = tiers.find((r) => r.tier === tier);
    if (!row) return { label: t(`tiers.${tier}`), colour: null };
    return { label: i18n.language.startsWith('sq') ? row.labelSq : row.labelEn, colour: row.colour };
  };
}
