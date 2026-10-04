import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal/Modal';
import styles from './OfferActions.module.css';

/**
 * The offer as its PDF (FR-OFR-05): the same file the download gives,
 * served inline and shown in the browser's own viewer, so preview and PDF
 * cannot differ. On a phone the PDF opens in a new tab instead (see
 * OfferActions), since an embedded viewer there is too small to read.
 */
export const OfferPdfPreview: React.FC<{ url: string | null; reference: string; onClose: () => void }> = ({ url, reference, onClose }) => {
  const { t } = useTranslation('offers');
  return (
    <Modal isOpen={url !== null} onClose={onClose} title={t('preview.title', { reference })} maxWidth="xl">
      {url && <iframe className={styles.preview} src={url} title={t('preview.title', { reference })} />}
    </Modal>
  );
};
