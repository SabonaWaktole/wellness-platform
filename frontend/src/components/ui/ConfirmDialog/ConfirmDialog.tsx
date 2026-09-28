import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** May be async; the dialog shows a pending state and closes on success. */
  onConfirm: () => void | Promise<void>;
  title: string;
  /** The consequence, stated plainly. */
  message: ReactNode;
  /** Defaults to the translated "Confirm". */
  confirmLabel?: string;
  /** Defaults to the translated "Cancel". */
  cancelLabel?: string;
  /** `danger` for anything that destroys data. */
  tone?: 'danger' | 'primary';
  /** Blocks confirming until the message's own inputs are complete. */
  confirmDisabled?: boolean;
}

/**
 * The confirmation step before a destructive action.
 *
 * Deliberately keeps itself open when `onConfirm` rejects: closing on failure
 * would leave the user staring at an unchanged list with no idea why.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  confirmDisabled = false,
}) => {
  const { t } = useTranslation('common');
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // The caller surfaces the reason via a toast; keep the dialog open so
      // the action can be retried or abandoned deliberately.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isPending ? () => undefined : onClose}
      title={title}
      maxWidth="sm"
    >
      <div className={styles.content}>
        {tone === 'danger' && (
          <div className={styles.iconWrapper} aria-hidden="true">
            <AlertTriangle size={26} className={styles.icon} />
          </div>
        )}

        <div className={styles.message}>{message}</div>

        <div className={styles.actions}>
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            {cancelLabel ?? t('dialog.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            type="button"
            onClick={handleConfirm}
            isLoading={isPending}
            disabled={confirmDisabled}
          >
            {confirmLabel ?? t('dialog.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
