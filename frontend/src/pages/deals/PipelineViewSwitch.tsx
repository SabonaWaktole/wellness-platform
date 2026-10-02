import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Columns3, List } from 'lucide-react';
import styles from './PipelineViewSwitch.module.css';

/** Board or list: the same pipeline, two views (FR-DEAL-10, FR-DEAL-11). */
export const PipelineViewSwitch: React.FC<{ current: 'board' | 'list' }> = ({ current }) => {
  const { t } = useTranslation('deals');
  const { tenantSlug } = useParams();
  const views = [
    { id: 'board' as const, path: 'pipeline', label: t('views.board'), icon: <Columns3 size={16} aria-hidden="true" /> },
    { id: 'list' as const, path: 'pipeline/list', label: t('views.list'), icon: <List size={16} aria-hidden="true" /> },
  ];
  return (
    <nav className={styles.switch} aria-label={t('views.label')}>
      {views.map((view) => (
        <Link
          key={view.id}
          to={`/${tenantSlug}/${view.path}`}
          className={`${styles.option} ${view.id === current ? styles.active : ''}`}
          aria-current={view.id === current ? 'page' : undefined}
        >
          {view.icon}
          {view.label}
        </Link>
      ))}
    </nav>
  );
};
