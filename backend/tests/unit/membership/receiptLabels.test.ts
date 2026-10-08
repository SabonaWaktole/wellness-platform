import { RECEIPT_LABELS } from '../../../src/membership/infrastructure/receiptPdfLabels';

describe('the receipt PDF labels', () => {
  it('FR-MPAY-11, NFR-I18N-02 Albanian and English carry the same keys and no empty text', () => {
    expect(Object.keys(RECEIPT_LABELS.sq).sort()).toEqual(Object.keys(RECEIPT_LABELS.en).sort());
    for (const language of ['sq', 'en'] as const) {
      for (const text of Object.values(RECEIPT_LABELS[language])) expect(text.trim()).not.toBe('');
    }
  });

  it('FR-MPAY-11 both languages say the receipt is not an invoice', () => {
    expect(RECEIPT_LABELS.en.notAnInvoice).toBe('This is a receipt, not an invoice.');
    expect(RECEIPT_LABELS.sq.notAnInvoice).toContain('jo një faturë');
  });
});
