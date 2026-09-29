import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge/Badge';
import type { BadgeProps } from '../ui/Badge/Badge';
import { lookupLabel } from '../../utils/lookupLabel';
import type { EnrichedRisk } from '../../types/client';

/** Lower risk levels read as calmer colours, higher ones as more urgent. */
const VARIANT_BY_LEVEL: Record<number, BadgeProps['variant']> = {
  1: 'success',
  2: 'warning',
};

export interface RiskBadgeProps {
  risk: EnrichedRisk | null;
}

/** A company's risk badge (FR-CMP-01, 03) — always derived from its business type, never edited directly. */
export const RiskBadge: React.FC<RiskBadgeProps> = ({ risk }) => {
  const { i18n } = useTranslation();
  if (!risk) return null;

  return <Badge variant={VARIANT_BY_LEVEL[risk.level] ?? 'error'}>{lookupLabel(risk, i18n.language)}</Badge>;
};
