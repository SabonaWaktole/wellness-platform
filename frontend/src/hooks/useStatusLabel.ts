import { useTranslation } from 'react-i18next';
import {
  quotationStatusKey,
  invoiceStatusKey,
  clientStatusKey,
  productStatusKey,
  appointmentStatusKey,
  contractStatusKey,
  contractPaymentStatusKey,
  billingPeriodKey,
} from '../constants/statusKeys';

/**
 * Translated status labels.
 *
 * One hook rather than three, because a component showing a quotation status
 * frequently also shows a client status, and separate hooks would mean two
 * `useTranslation` calls for the same catalogue.
 *
 * An unknown status falls back to its raw value rather than to a blank or a
 * guessed label — see the note on `lookup` in statusKeys.ts.
 */
export function useStatusLabel() {
  const { t } = useTranslation();

  const translate = (key: string | null, raw: string) => (key ? t(key) : raw);

  return {
    quotation: (status: string) => translate(quotationStatusKey(status), status),
    invoice: (status: string) => translate(invoiceStatusKey(status), status),
    client: (status: string) => translate(clientStatusKey(status), status),
    product: (status: string) => translate(productStatusKey(status), status),
    appointment: (status: string) => translate(appointmentStatusKey(status), status),
    contract: (status: string) => translate(contractStatusKey(status), status),
    contractPayment: (status: string) => translate(contractPaymentStatusKey(status), status),
    billingPeriod: (period: string) => translate(billingPeriodKey(period), period),
  };
}
