import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import styles from './RoleDashboard.module.css';

/** A dashboard with nothing to show yet says so, instead of a wall of zeros (FR-DSH-06). */
export const EmptyState: React.FC = () => {
  const { t } = useTranslation('dashboard');
  return (
    <div className={styles.empty} role="status">
      <BarChart3 size={32} aria-hidden="true" />
      <h2 className={styles.emptyTitle}>{t('role.emptyTitle')}</h2>
      <p className={styles.emptyText}>{t('role.emptyText')}</p>
    </div>
  );
};
