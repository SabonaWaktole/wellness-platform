import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { roleDashboardService } from '../../services/dashboardService';
import type { DashboardKind } from '../../types/roleDashboard';
import { AdministratorDashboard } from './AdministratorDashboard';
import { CeoDashboard } from './CeoDashboard';
import { RoleDashboardPage } from './RoleDashboardPage';
import { SalesManagerDashboard } from './SalesManagerDashboard';
import { SalesUserDashboard } from './SalesUserDashboard';

/**
 * Where a user lands after login and from the menu (FR-DSH-01): the dashboard of their role. Sales User and
 * Sales Manager, Administrator and CEO have theirs; Reception has none and goes to the company search. The
 * dashboard the workspace had before (`fallback`) is only what a user gets when the server cannot say which is theirs.
 */
export const DashboardLanding: React.FC<{ fallback: React.ReactElement }> = ({ fallback }) => {
  const { tenantSlug } = useParams();
  const [kind, setKind] = useState<DashboardKind | 'FALLBACK' | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    roleDashboardService
      .home(tenantSlug)
      .then((value) => !cancelled && setKind(value))
      // If the server cannot say, the user still gets a dashboard rather than a blank page.
      .catch(() => !cancelled && setKind('FALLBACK'));
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  if (kind === null) return null;
  if (kind === 'RECEPTION') return <Navigate to={`/${tenantSlug}/clients`} replace />;
  if (kind === 'SALES_USER') {
    return (
      <RoleDashboardPage>
        <SalesUserDashboard />
      </RoleDashboardPage>
    );
  }
  if (kind === 'SALES_MANAGER') {
    return (
      <RoleDashboardPage>
        <SalesManagerDashboard />
      </RoleDashboardPage>
    );
  }
  if (kind === 'ADMINISTRATOR') {
    return (
      <RoleDashboardPage>
        <AdministratorDashboard />
      </RoleDashboardPage>
    );
  }
  if (kind === 'CEO') {
    return (
      <RoleDashboardPage>
        <CeoDashboard />
      </RoleDashboardPage>
    );
  }
  return fallback;
};
