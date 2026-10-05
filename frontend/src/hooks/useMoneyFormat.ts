import { useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { formatMoney, formatMoneyWhole, formatMoneyCompact } from '../utils/formatMoney';

/**
 * Binds the money formatters to the signed-in user's tenant settings, so a
 * component calls `format(amount)` without threading currency through props.
 *
 * A user with no tenant (SUPER_ADMIN) or a session still loading falls back to
 * the same values as the database column defaults, so nothing renders blank
 * while /auth/me is in flight.
 */
export function useMoneyFormat() {
  const currency = useAuthStore((state) => state.user?.tenantCurrency);
  const locale = useAuthStore((state) => state.user?.tenantLocale);

  return useMemo(() => {
    const settings = { currency, locale };
    return {
      currency,
      locale,
      format: (value: number | string | null | undefined) => formatMoney(value, settings),
      formatWhole: (value: number | null | undefined) => formatMoneyWhole(value, settings),
      formatCompact: (value: number) => formatMoneyCompact(value, settings),
    };
  }, [currency, locale]);
}
