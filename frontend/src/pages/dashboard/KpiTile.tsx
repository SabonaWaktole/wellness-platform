import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DashboardFigure, DashboardPreset } from '../../types/roleDashboard';
import { linkPath } from './dashboardLinks';
import { useDashboardFormat } from './useDashboardFormat';
import styles from './RoleDashboard.module.css';

interface KpiTileProps {
  figure: DashboardFigure;
  tenantSlug: string;
  /** The period the figure follows, written in words, when it follows one. */
  preset: DashboardPreset;
}

/** One figure: its value, its label, whether it follows the period or is "as of now", and the list behind it (FR-DSH-05). */
export const KpiTile: React.FC<KpiTileProps> = ({ figure, tenantSlug, preset }) => {
  const { t } = useTranslation('dashboard');
  const { figure: write } = useDashboardFormat();
  const label = t(`role.figures.${figure.key}`, { defaultValue: figure.label });
  const basis = figure.basis === 'asOfNow' ? t('role.asOfNow') : t(`role.presets.${preset}`);
  const value = write(figure.value, figure.format);

  const body = (
    <>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileBasis} data-basis={figure.basis}>
        {basis}
      </span>
    </>
  );

  return (
    <li className={styles.tile} data-figure={figure.key}>
      {figure.link ? (
        <Link className={styles.tileLink} to={linkPath(tenantSlug, figure.link)} aria-label={t('role.openList', { label, value })}>
          {body}
        </Link>
      ) : (
        <div className={styles.tileBody}>{body}</div>
      )}
    </li>
  );
};
