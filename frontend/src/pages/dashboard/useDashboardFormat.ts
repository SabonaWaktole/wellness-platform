import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/formatMoney';
import type { DashboardFigure } from '../../types/roleDashboard';

/**
 * Writes a figure the server worked out, in the user's language (FR-DSH-06): money in EUR with two
 * decimals, in the Albanian or English number format. Money is a string that is formatted and never
 * calculated (NFR-ACC-03); a rate with nothing to divide arrives as null and is shown as "—", not 0%.
 */
export function useDashboardFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith('sq') ? 'sq-AL' : 'en-GB';

  const money = useCallback((value: string | number | null | undefined) => formatMoney(value, { currency: 'EUR', locale }), [locale]);

  const figure = useCallback(
    (value: DashboardFigure['value'] | undefined, format: DashboardFigure['format']): string => {
      if (value === null || value === undefined) return '—';
      if (format === 'money') return money(value);
      if (format === 'percent') return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value))}%`;
      return new Intl.NumberFormat(locale).format(Number(value));
    },
    [locale, money]
  );

  const time = useCallback(
    (iso: string) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),
    [locale]
  );

  return { figure, money, time };
}
