import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge/Badge';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import type { ValidityBadgeData } from '../../types/contract';

/** Reasons that are contract statuses; their words come from the labels the Administrator configured (FR-SET-07). */
const STATUS_REASONS = new Set(['DRAFT', 'PENDING_SIGNATURE', 'SUSPENDED', 'EXPIRED', 'CANCELLED']);

const VARIANT = { VALID: 'success', EXPIRING_SOON: 'warning', NOT_VALID: 'error' } as const;

/**
 * Whether a company has a contract valid today (FR-CON-21): "Valid until
 * dd.mm.yyyy", "Expiring soon", or "Not valid: reason". The words carry the
 * meaning, colour only repeats it. Everything shown was decided by the
 * server; nothing here compares dates (SRS §2.4).
 */
export const ValidityBadge: React.FC<{ validity: ValidityBadgeData }> = ({ validity }) => {
  const { t } = useTranslation('contracts');
  const dates = useDateFormat();
  const statusLabel = useStatusLabel();

  const until = validity.endsOn ? dates.date(validity.endsOn) : '';
  let text: string;
  if (validity.status === 'VALID') {
    text = t('validity.validUntil', { date: until });
  } else if (validity.status === 'EXPIRING_SOON') {
    text = t('validity.expiringSoon', { date: until });
  } else {
    const reason = validity.reason ?? 'NO_CONTRACT';
    const reasonText = STATUS_REASONS.has(reason) ? statusLabel.contract(reason) : t(`validity.reason.${reason}`);
    text = t('validity.notValid', { reason: reasonText });
  }

  return (
    <Badge variant={VARIANT[validity.status]} data-testid="validity-badge" title={validity.startsOn ? `${dates.date(validity.startsOn)} – ${until}` : undefined}>
      {text}
    </Badge>
  );
};
