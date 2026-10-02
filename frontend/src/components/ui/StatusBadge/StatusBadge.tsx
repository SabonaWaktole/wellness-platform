import React from 'react';
import { Badge } from '../Badge/Badge';
import type { BadgeProps } from '../Badge/Badge';
import { useStatusLabels } from '../../../hooks/useStatusLabels';
import { useStatusLabel } from '../../../hooks/useStatusLabel';
import type { StatusDomain } from '../../../services/statusLabelService';

const FALLBACK_VARIANT: Record<StatusDomain, Record<string, BadgeProps['variant']>> = {
  contract: {
    DRAFT: 'secondary',
    PENDING_SIGNATURE: 'warning',
    ACTIVE: 'success',
    SUSPENDED: 'error',
    EXPIRED: 'warning',
    CANCELLED: 'error',
  },
  payment: {
    NOT_INVOICED: 'secondary',
    INVOICE_ISSUED: 'secondary',
    PAYMENT_PENDING: 'warning',
    PARTIALLY_PAID: 'warning',
    PAID: 'success',
    OVERDUE: 'error',
    WAIVED: 'secondary',
  },
  deal: {
    NEW_LEAD: 'secondary',
    CONTACTED: 'secondary',
    INTERESTED: 'primary',
    OFFER_PREPARED: 'primary',
    OFFER_SENT: 'primary',
    FOLLOW_UP: 'warning',
    NEGOTIATION: 'warning',
    WON: 'success',
    LOST: 'error',
  },
};

export interface StatusBadgeProps {
  domain: StatusDomain;
  status: string;
}

/**
 * A contract, payment or deal-stage badge that shows the tenant's own colour
 * (Settings → Statuses, FR-SET-07, 08) once it has loaded, and otherwise
 * falls back to a fixed variant — for the moment before the tenant's
 * labels arrive, and for a legacy key like WAIVED that has no tenant row.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ domain, status }) => {
  const items = useStatusLabels(domain);
  const statusLabel = useStatusLabel();
  const item = items.find((i) => i.key === status);
  const label =
    domain === 'contract' ? statusLabel.contract(status) : domain === 'deal' ? statusLabel.deal(status) : statusLabel.contractPayment(status);

  if (!item) {
    return <Badge variant={FALLBACK_VARIANT[domain][status] ?? 'secondary'}>{label}</Badge>;
  }

  return (
    <Badge
      style={{
        backgroundColor: `color-mix(in srgb, ${item.colour} 15%, transparent)`,
        color: item.colour,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${item.colour} 35%, transparent)`,
      }}
    >
      {label}
    </Badge>
  );
};
