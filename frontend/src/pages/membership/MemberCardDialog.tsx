import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Printer, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { memberCardService, type CardLink } from '../../services/memberCardService';
import { readableOn } from '../card/cardFormat';
import styles from './Members.module.css';
import printStyles from './MemberCardPrint.module.css';

type PrintSize = 'card' | 'a6';

/** The paper for each print option (FR-CRD-09): a credit card, and A6. */
const PAGE: Record<PrintSize, string> = { card: '85.6mm 54mm', a6: '105mm 148mm' };

interface Props {
  tenantSlug: string;
  member: { id: string; memberNumber: string; name: string; tierLabel: string; tierColour: string; valid: boolean };
  onClose: () => void;
}

/**
 * The member's card for staff (FR-CRD-09, FR-CRD-10): the QR to show on screen, the link to copy, the card to print
 * and the replacement of the link. The server draws the QR and builds the address; this dialog shows what it gets.
 * Replacing asks first, because the old link and every home-screen copy stop working at once.
 */
export const MemberCardDialog: React.FC<Props> = ({ tenantSlug, member, onClose }) => {
  const { t } = useTranslation('members');
  const [link, setLink] = useState<CardLink | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [copied, setCopied] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceState, setReplaceState] = useState<'idle' | 'done' | 'failed'>('idle');
  const [printing, setPrinting] = useState<PrintSize | null>(null);

  const load = useCallback(async () => {
    try {
      setLink(await memberCardService.link(tenantSlug, member.id));
      setState('ready');
    } catch {
      setState('failed');
    }
  }, [tenantSlug, member.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Printing: only the print card is shown on paper, at the chosen size. The style and the card are removed afterwards.
  useEffect(() => {
    if (!printing) return;
    const style = document.createElement('style');
    style.textContent = `@page { size: ${PAGE[printing]}; margin: 0 } @media print { body > *:not([data-member-card-print]) { display: none !important } }`;
    document.head.appendChild(style);
    const done = () => {
      style.remove();
      setPrinting(null);
    };
    window.addEventListener('afterprint', done, { once: true });
    // Let the card render before the print dialog opens.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      style.remove();
    };
  }, [printing]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  };

  const replace = async () => {
    setReplacing(true);
    try {
      await memberCardService.replace(tenantSlug, member.id);
      setConfirmingReplace(false);
      setReplaceState('done');
      setCopied(false);
      await load();
    } catch {
      setReplaceState('failed');
    } finally {
      setReplacing(false);
    }
  };

  const qr = link ? `data:image/svg+xml;utf8,${encodeURIComponent(link.qrSvg)}` : null;

  return (
    <>
      <Modal isOpen onClose={onClose} title={t('card.title')}>
        <div className={styles.modalBody}>
          {state === 'loading' && <p role="status">…</p>}
          {state === 'failed' && <p className={styles.formError} role="alert">{t('card.loadFailed')}</p>}

          {link && qr && (
            <>
              {!member.valid && <p className={styles.warning}>{t('card.notValid')}</p>}
              <div className={styles.cardQr}>
                <img src={qr} alt={t('card.qrAlt', { name: member.name })} width={220} height={220} />
              </div>
              <p className={styles.muted}>{t('card.help')}</p>

              <label className={styles.cardLinkLabel}>
                {t('card.link')}
                <input className={styles.cardLinkInput} readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
              </label>

              {replaceState === 'done' && <p role="status">{t('card.replaced')}</p>}
              {replaceState === 'failed' && <p className={styles.formError} role="alert">{t('card.replaceFailed')}</p>}
              {copied && <p role="status">{t('card.copied')}</p>}

              <div className={styles.modalActions}>
                <Button variant="outline" icon={<Copy size={16} />} onClick={() => void copy()}>{t('card.copy')}</Button>
                <Button variant="outline" icon={<Printer size={16} />} onClick={() => setPrinting('card')}>{t('card.printCard')}</Button>
                <Button variant="outline" icon={<Printer size={16} />} onClick={() => setPrinting('a6')}>{t('card.printA6')}</Button>
                <Button variant="danger" icon={<RefreshCw size={16} />} onClick={() => setConfirmingReplace(true)}>{t('card.replace')}</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={confirmingReplace} onClose={() => setConfirmingReplace(false)} title={t('card.replaceDialog.title')}>
        <div className={styles.modalBody}>
          <p>{t('card.replaceDialog.help')}</p>
          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={() => setConfirmingReplace(false)}>{t('card.replaceDialog.cancel')}</Button>
            <Button variant="danger" isLoading={replacing} onClick={() => void replace()}>{t('card.replaceDialog.confirm')}</Button>
          </div>
        </div>
      </Modal>

      {printing && qr && createPortal(
        <div data-member-card-print className={`${printStyles.sheet} ${printing === 'a6' ? printStyles.a6 : printStyles.card}`}>
          <div className={printStyles.band} style={{ backgroundColor: member.tierColour, color: readableOn(member.tierColour) }}>
            <span>Wellness+</span>
            <strong>{member.tierLabel}</strong>
          </div>
          <div className={printStyles.body}>
            <p className={printStyles.name}>{member.name}</p>
            <p className={printStyles.number}>{member.memberNumber}</p>
            <div className={printStyles.qrBox}><img src={qr} alt="" className={printStyles.qr} /></div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
