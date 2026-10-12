import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { modalVariants, overlayVariants } from '../../../lib/motion';
import { tourLayerProps } from '../../../lib/support/tourProps';
import styles from './Modal.module.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  /** Support tour id for the dialog; also marks it as a layer so a tour scopes to it while open. */
  tourId?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
  tourId,
}) => {
  const { t } = useTranslation('common');
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const maxWidthClass = styles[`maxWidth-${maxWidth}`] || styles['maxWidth-md'];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          {...tourLayerProps(tourId)}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className={`${styles.modal} ${maxWidthClass}`}
            onClick={(e) => e.stopPropagation()}
            variants={modalVariants}
          >
            <div className={styles.header}>
              <h3 className={styles.title}>{title}</h3>
              <button className={styles.closeButton} onClick={onClose} aria-label={t('a11y.closeModal')}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.content}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
