import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button/Button';
import styles from './PickBanner.module.css';

interface PickBannerProps {
  /** The control under the pointer or the keyboard, announced politely as it changes. */
  candidateName: string;
  onCancel: () => void;
}

/** The bar that says point-and-ask is on, how to stop it, and (to a screen reader) which control is highlighted. */
export const PickBanner = ({ candidateName, onCancel }: PickBannerProps) => {
  const { t } = useTranslation('support');
  return (
    <div className={styles.banner} data-support-ui="">
      <span>{t('pick.banner')}</span>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        {t('pick.cancel')}
      </Button>
      <div className={styles.live} role="status" aria-live="polite" aria-atomic="true">
        {candidateName ? t('pick.highlighted', { name: candidateName }) : ''}
      </div>
    </div>
  );
};
