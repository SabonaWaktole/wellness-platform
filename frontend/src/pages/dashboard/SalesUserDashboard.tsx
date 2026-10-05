import React from 'react';
import { useTranslation } from 'react-i18next';
import { RoleDashboardFrame } from './RoleDashboardFrame';
import { useRoleDashboard } from './useRoleDashboard';

/**
 * The Sales User's dashboard (FR-DSH-09): their own leads, active deals, follow-ups, offers, deals won, sales
 * value and activity. Every figure is the server's, calculated for this user alone; a figure they may not
 * see is simply not there (FR-DSH-08).
 */
export const SalesUserDashboard: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const state = useRoleDashboard('SALES_USER');
  return <RoleDashboardFrame title={t('role.salesUserTitle')} subtitle={t('role.salesUserSubtitle')} state={state} />;
};
