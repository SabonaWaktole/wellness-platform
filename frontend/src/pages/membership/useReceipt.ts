import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob } from '../../utils/downloadBlob';
import { memberPaymentService } from '../../services/memberPaymentService';

/** Opens a payment's PDF receipt in a new tab, in the interface language (FR-MPAY-11). The browser's viewer prints it. */
export function useReceipt(tenantSlug: string | undefined) {
  const { i18n } = useTranslation('members');
  return useCallback(
    async (paymentId: string) => {
      if (!tenantSlug) return;
      try {
        const blob = await memberPaymentService.receipt(tenantSlug, paymentId, i18n.language.startsWith('sq') ? 'sq' : 'en');
        downloadBlob(blob, `receipt-${paymentId}.pdf`, { open: true });
      } catch (error) {
        console.error('Failed to open the receipt', error);
      }
    },
    [tenantSlug, i18n.language]
  );
}
