import { useCallback } from 'react';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import type { FigureChange } from '../../types/performance';
import type { FigureFormat } from './performanceColumns';

/**
 * Writes a figure the server worked out. Money is a string that is formatted and never calculated
 * (NFR-ACC-03); a rate with nothing to divide arrives as null and is shown as "—", not 0%.
 */
export function usePerformanceFormat() {
  const { format: formatMoney } = useMoneyFormat();

  const figure = useCallback(
    (value: number | string | null | undefined, format: FigureFormat, daysUnit: string): string => {
      if (value === null || value === undefined) return '—';
      switch (format) {
        case 'money':
          return formatMoney(value);
        case 'percent':
          return `${value}%`;
        case 'days':
          return `${value} ${daysUnit}`;
        default:
          return String(value);
      }
    },
    [formatMoney]
  );

  /** "+3", "-2", "+1.7 pp" or a signed money amount: the change against the previous period (FR-PRF-06). */
  const change = useCallback(
    (value: FigureChange, format: FigureFormat, daysUnit: string): string => {
      const sign = value.direction === 'UP' ? '+' : '';
      if (format === 'money') return `${sign}${formatMoney(value.delta)}`;
      if (format === 'percent') return `${sign}${value.delta} pp`;
      if (format === 'days') return `${sign}${value.delta} ${daysUnit}`;
      return `${sign}${value.delta}`;
    },
    [formatMoney]
  );

  return { figure, change };
}
