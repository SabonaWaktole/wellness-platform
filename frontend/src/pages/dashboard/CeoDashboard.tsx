import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import type { DashboardPoint } from '../../types/roleDashboard';
import { ChartWithTable } from './ChartWithTable';
import { RoleDashboardFrame } from './RoleDashboardFrame';
import { useDashboardFormat } from './useDashboardFormat';
import { useRoleDashboard } from './useRoleDashboard';
import styles from './RoleDashboard.module.css';

/**
 * The CEO's dashboard (FR-DSH-12, FR-DSH-13): the whole workspace's pipeline, sales, revenue, contracts, payments,
 * team and company counts. It is read only: nothing on it edits anything, and the lists its figures open show no
 * edit control to a role without the permission. The place for the Wellness+ indicators is in the response and is
 * not drawn until Milestone 4. A figure or column the server left out (no commercial or payments permission) is
 * not drawn either.
 */
export const CeoDashboard: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const { figure, money } = useDashboardFormat();
  const statusLabel = useStatusLabel();
  const state = useRoleDashboard('CEO');
  const { data } = state;
  const locale = i18n.language.startsWith('sq') ? 'sq-AL' : 'en-GB';

  const team = data?.tables.team ?? [];
  const contracts = data?.tables.contracts ?? [];
  const payments = data?.tables.payments ?? [];
  const showsTeamValue = team.some((row) => row.figures.totalValue !== undefined);
  const showsContractValue = contracts.some((row) => row.annualValue !== undefined);
  const showsPaymentAmounts = payments.some((row) => row.amount !== undefined);

  const monthLabel = (point: DashboardPoint) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${point.key}-01T00:00:00Z`));
  const companyLabel = (point: DashboardPoint) => (point.key === 'NONE' ? t('role.ceo.noStatus') : statusLabel.client(point.key));
  const num = (value: number | null | undefined, format: 'count' | 'percent' = 'count') => <td className={styles.numeric}>{figure(value, format)}</td>;

  return (
    <RoleDashboardFrame title={t('role.ceo.title')} subtitle={t('role.ceo.subtitle')} state={state} showLocation={false}>
      {data?.charts.salesPerMonth && data.charts.salesPerMonth.length > 0 && (
        <ChartWithTable title={t('role.ceo.salesPerMonth')} points={data.charts.salesPerMonth} labelOf={monthLabel} />
      )}

      {team.length > 0 && (
        <section className={styles.panel} aria-label={t('role.ceo.team')}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t('role.ceo.team')}</h2>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('role.salesperson')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.offersCreated')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.offersSent')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.dealsWon')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.dealsLost')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.conversionRate')}</th>
                  {showsTeamValue && <th scope="col" className={styles.numeric}>{t('role.figures.salesValue')}</th>}
                  <th scope="col" className={styles.numeric}>{t('role.figures.followUpsOverdue')}</th>
                </tr>
              </thead>
              <tbody>
                {team.map((row) => (
                  <tr key={row.salesperson.id}>
                    <th scope="row">{row.salesperson.name}</th>
                    {num(row.figures.offersCreated)}
                    {num(row.figures.offersSent)}
                    {num(row.figures.dealsWon)}
                    {num(row.figures.dealsLost)}
                    {num(row.figures.conversionRate, 'percent')}
                    {showsTeamValue && <td className={styles.numeric}>{money(row.figures.totalValue ?? '0.00')}</td>}
                    {num(row.figures.followUpsOverdue)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className={styles.sections}>
        {contracts.length > 0 && (
          <section className={styles.panel} aria-label={t('role.ceo.contracts')}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t('role.ceo.contracts')}</h2>
            </div>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('role.ceo.contractGroup')}</th>
                    <th scope="col" className={styles.numeric}>{t('role.columns.count')}</th>
                    {showsContractValue && <th scope="col" className={styles.numeric}>{t('role.columns.value')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{t(`role.ceo.contractGroups.${row.key}`)}</th>
                      {num(row.count)}
                      {showsContractValue && <td className={styles.numeric}>{money(row.annualValue ?? '0.00')}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {payments.length > 0 && (
          <section className={styles.panel} aria-label={t('role.ceo.payments')}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t('role.ceo.payments')}</h2>
            </div>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('role.ceo.paymentStatus')}</th>
                    <th scope="col" className={styles.numeric}>{t('role.columns.count')}</th>
                    {showsPaymentAmounts && <th scope="col" className={styles.numeric}>{t('role.ceo.amount')}</th>}
                    {showsPaymentAmounts && <th scope="col" className={styles.numeric}>{t('role.ceo.outstanding')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={row.status}>
                      <th scope="row">{statusLabel.contractPayment(row.status)}</th>
                      {num(row.count)}
                      {showsPaymentAmounts && <td className={styles.numeric}>{money(row.amount ?? '0.00')}</td>}
                      {showsPaymentAmounts && <td className={styles.numeric}>{money(row.outstanding ?? '0.00')}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {data?.charts.companiesPerStatus && data.charts.companiesPerStatus.length > 0 && (
        <ChartWithTable title={t('role.ceo.companies')} points={data.charts.companiesPerStatus} labelOf={companyLabel} />
      )}
    </RoleDashboardFrame>
  );
};
