import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DashboardPoint } from '../../types/roleDashboard';
import { useDashboardFormat } from './useDashboardFormat';
import styles from './RoleDashboard.module.css';

interface ChartWithTableProps {
  title: string;
  points: DashboardPoint[];
  labelOf: (point: DashboardPoint) => string;
}

/**
 * A bar chart and a table of the same numbers (FR-DSH-06). Both are drawn from the one list the server
 * sent, so they cannot disagree; the bars are decoration, the table is what a screen reader reads. The
 * value column is there only when the server sent values (`commercial.view`).
 */
export const ChartWithTable: React.FC<ChartWithTableProps> = ({ title, points, labelOf }) => {
  const { t } = useTranslation('dashboard');
  const { figure, money } = useDashboardFormat();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const hasValues = points.some((point) => point.annualValue !== undefined);
  const widest = Math.max(1, ...points.map((point) => point.count));

  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <div className={styles.toggle} role="group" aria-label={t('role.view')}>
          {(['chart', 'table'] as const).map((choice) => (
            <button key={choice} type="button" className={styles.toggleButton} aria-pressed={view === choice} onClick={() => setView(choice)}>
              {t(`role.${choice}`)}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <ul className={styles.bars}>
          {points.map((point) => (
            <li key={point.key} className={styles.bar}>
              <span className={styles.barLabel}>{labelOf(point)}</span>
              <span className={styles.barTrack} aria-hidden="true">
                <span className={styles.barFill} style={{ width: `${(point.count / widest) * 100}%` }} />
              </span>
              <span className={styles.barValue}>{figure(point.count, 'count')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('role.columns.name')}</th>
                <th scope="col" className={styles.numeric}>
                  {t('role.columns.count')}
                </th>
                {hasValues && (
                  <th scope="col" className={styles.numeric}>
                    {t('role.columns.value')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key}>
                  <th scope="row">{labelOf(point)}</th>
                  <td className={styles.numeric}>{figure(point.count, 'count')}</td>
                  {hasValues && <td className={styles.numeric}>{money(point.annualValue ?? '0.00')}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
