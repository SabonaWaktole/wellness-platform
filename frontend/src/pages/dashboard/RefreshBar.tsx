import React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { useDashboardFormat } from './useDashboardFormat';
import styles from './RoleDashboard.module.css';

interface RefreshBarProps {
  calculatedAt: string | undefined;
  loading: boolean;
  onRefresh: () => void;
}

/** "Calculated at hh:mm" and a refresh button: the figures are worked out when the page is opened, not stored (FR-DSH-07). */
export const RefreshBar: React.FC<RefreshBarProps> = ({ calculatedAt, loading, onRefresh }) => {
  const { t } = useTranslation('dashboard');
  const { time } = useDashboardFormat();
  return (
    <div className={styles.refresh}>
      {calculatedAt && <span aria-live="polite">{t('role.calculatedAt', { time: time(calculatedAt) })}</span>}
      <Button variant="outline" icon={<RefreshCw size={16} />} onClick={onRefresh} disabled={loading}>
        {t('role.refresh')}
      </Button>
    </div>
  );
};
