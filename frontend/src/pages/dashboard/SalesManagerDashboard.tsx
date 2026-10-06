import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { lookupLabel } from '../../utils/lookupLabel';
import type { DashboardPoint, SalespersonRow } from '../../types/roleDashboard';
import { ChartWithTable } from './ChartWithTable';
import { RoleDashboardFrame } from './RoleDashboardFrame';
import { useDashboardFormat } from './useDashboardFormat';
import { useRoleDashboard } from './useRoleDashboard';
import styles from './RoleDashboard.module.css';

type Person = SalespersonRow['salesperson'];

/**
 * The Sales Manager's dashboard (FR-DSH-10): the sales team's figures in total and per salesperson, the pipeline,
 * and the lost-deal analysis by predefined reason. The totals are the server's, worked out from the same counts
 * the rows show, so won plus lost per salesperson adds up to the team.
 */
export const SalesManagerDashboard: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const { figure, money } = useDashboardFormat();
  const state = useRoleDashboard('SALES_MANAGER');
  const { data } = state;

  // The list to pick from is the team as the unfiltered dashboard shows it: filtering to one person must not shrink it.
  const [team, setTeam] = useState<Person[]>([]);
  useEffect(() => {
    if (data?.tables.perSalesperson && !state.salespersonId) setTeam(data.tables.perSalesperson.map((row) => row.salesperson));
  }, [data, state.salespersonId]);

  const rows = data?.tables.perSalesperson ?? [];
  const showsValue = rows.some((row) => row.salesValue !== undefined);
  const showsFollowUps = rows.some((row) => row.followUpsOverdue !== undefined);
  const reasonLabel = (point: DashboardPoint) =>
    point.key === 'NO_REASON' ? t('role.noReason') : lookupLabel({ nameSq: point.labelSq ?? point.label, nameEn: point.labelEn }, i18n.language);

  const num = (value: number | null | undefined, format: 'count' | 'percent' = 'count') => <td className={styles.numeric}>{figure(value, format)}</td>;

  const picker = (
    <SelectInput label={t('role.salesperson')} value={state.salespersonId} onChange={(event) => state.setSalespersonId(event.target.value)}>
      <option value="">{t('role.allSalespeople')}</option>
      {team.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </SelectInput>
  );

  return (
    <RoleDashboardFrame title={t('role.salesManagerTitle')} subtitle={t('role.salesManagerSubtitle')} state={state} extraFilters={picker}>
      {rows.length > 0 && (
        <section className={styles.panel} aria-label={t('role.perSalesperson')}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t('role.perSalesperson')}</h2>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('role.salesperson')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.leads')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.activeDeals')}</th>
                  {showsFollowUps && <th scope="col" className={styles.numeric}>{t('role.figures.followUpsOverdue')}</th>}
                  <th scope="col" className={styles.numeric}>{t('role.figures.offersCreated')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.offersSent')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.dealsWon')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.dealsLost')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.conversionRate')}</th>
                  {showsValue && <th scope="col" className={styles.numeric}>{t('role.figures.salesValue')}</th>}
                  <th scope="col" className={styles.numeric}>{t('role.figures.calls')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.emails')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.visits')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.figures.meetings')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.salesperson.id}>
                    <th scope="row">{row.salesperson.name}</th>
                    {num(row.leads)}
                    {num(row.activeDeals)}
                    {showsFollowUps && num(row.followUpsOverdue)}
                    {num(row.offersCreated)}
                    {num(row.offersSent)}
                    {num(row.dealsWon)}
                    {num(row.dealsLost)}
                    {num(row.conversionRate, 'percent')}
                    {showsValue && <td className={styles.numeric}>{money(row.salesValue ?? '0.00')}</td>}
                    {num(row.calls)}
                    {num(row.emails)}
                    {num(row.visits)}
                    {num(row.meetings)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data?.charts.lostReasons && data.charts.lostReasons.length > 0 && (
        <ChartWithTable title={t('role.lostReasons')} points={data.charts.lostReasons} labelOf={reasonLabel} />
      )}
    </RoleDashboardFrame>
  );
};
