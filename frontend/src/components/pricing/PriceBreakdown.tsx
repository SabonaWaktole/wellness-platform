import React from 'react';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import styles from './PriceBreakdown.module.css';

export interface BreakdownRow {
  key: string;
  label: string;
  /** A two-decimal string from the server; absent for a viewer without `commercial.view`. */
  amount: string | null | undefined;
  /** A total: drawn with a rule above it. */
  total?: boolean;
  /** A deduction, such as the discount. */
  negative?: boolean;
}

/**
 * A price breakdown, as Settings → Pricing's test calculator and the pricing
 * screen show it. It only formats the amounts the server returned; it never
 * calculates one (NFR-ACC-02). A missing amount shows as a dash.
 */
export const PriceBreakdown: React.FC<{ rows: BreakdownRow[] }> = ({ rows }) => {
  const { format } = useMoneyFormat();
  return (
    <dl className={styles.breakdown}>
      {rows.map((row) => {
        const className = row.total ? styles.total : undefined;
        const text = row.amount == null ? '—' : `${row.negative ? '−' : ''}${format(Number(row.amount))}`;
        return (
          <div key={row.key} className={styles.row}>
            <dt className={className}>{row.label}</dt>
            <dd className={className} data-testid={`amount-${row.key}`}>
              {text}
            </dd>
          </div>
        );
      })}
    </dl>
  );
};
