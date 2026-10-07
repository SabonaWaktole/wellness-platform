import type { DashboardLink } from '../../types/roleDashboard';

/** The route behind a figure, with its filters as the list reads them (FR-DSH-05). */
export function linkPath(tenantSlug: string, link: DashboardLink): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(link.filters)) {
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  const base = { FOLLOW_UPS: 'follow-ups', DEALS: 'pipeline/list', OFFERS: 'offers', PAYMENTS: 'payments', RENEWALS: 'renewals', MEMBERSHIP_REPORTS: 'members/reports' }[link.target];
  const search = query.toString();
  return `/${tenantSlug}/${base}${search ? `?${search}` : ''}`;
}
