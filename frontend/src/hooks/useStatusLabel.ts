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
  dealStageKey,
  dealTypeKey,
} from '../constants/statusKeys';
import { useStatusLabels } from './useStatusLabels';
import { lookupLabel } from '../utils/lookupLabel';

/**
 * Translated status labels.
 *
 * One hook rather than three, because a component showing a quotation status
 * frequently also shows a client status, and separate hooks would mean two
 * `useTranslation` calls for the same catalogue.
 *
 * An unknown status falls back to its raw value rather than to a blank or a
 * guessed label — see the note on `lookup` in statusKeys.ts.
 *
 * Contract and payment statuses are the two domains an Administrator can
 * relabel (FR-SET-07, 08, Settings → Statuses). `contract`/`contractPayment`
 * prefer that tenant-set label over the built-in translation, falling back
 * to it while the tenant label is still loading or was never set (WAIVED,
 * which has none). Renaming "Active" there is then reflected on every badge
 * without a code change or a redeploy. Deal stages work the same way (M2
 * Slice 6, FR-DEAL-06).
 */
export function useStatusLabel() {
  const { t, i18n } = useTranslation();
  const contractLabels = useStatusLabels('contract');
  const paymentLabels = useStatusLabels('payment');
  const dealLabels = useStatusLabels('deal');

  const translate = (key: string | null, raw: string) => (key ? t(key) : raw);

  const fromCatalogue = (labels: ReturnType<typeof useStatusLabels>, status: string, fallback: string) => {
    const item = labels.find((l) => l.key === status);
    return item ? lookupLabel({ nameSq: item.labelSq, nameEn: item.labelEn }, i18n.language) : fallback;
  };

  return {
    quotation: (status: string) => translate(quotationStatusKey(status), status),
    invoice: (status: string) => translate(invoiceStatusKey(status), status),
    client: (status: string) => translate(clientStatusKey(status), status),
    product: (status: string) => translate(productStatusKey(status), status),
    appointment: (status: string) => translate(appointmentStatusKey(status), status),
    contract: (status: string) => fromCatalogue(contractLabels, status, translate(contractStatusKey(status), status)),
    contractPayment: (status: string) => fromCatalogue(paymentLabels, status, translate(contractPaymentStatusKey(status), status)),
    billingPeriod: (period: string) => translate(billingPeriodKey(period), period),
    deal: (stage: string) => fromCatalogue(dealLabels, stage, translate(dealStageKey(stage), stage)),
    dealType: (type: string) => translate(dealTypeKey(type), type),
  };
}
