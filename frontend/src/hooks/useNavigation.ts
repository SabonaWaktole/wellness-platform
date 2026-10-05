import { useTranslation } from 'react-i18next';
import type { NavItem } from '../components/layout/Sidebar/Sidebar';
import { useOverdueFollowUpCount } from './useOverdueFollowUpCount';

/**
 * A nav entry before its label is resolved.
 *
 * Labels are `common:nav.*` keys rather than literal strings because these
 * arrays are module-level constants — evaluated once, at import, long before
 * any language is known. Translating at the module level would freeze the
 * sidebar into whatever language happened to be active on first import and
 * leave it there through every subsequent language change. Resolving inside
 * the hook re-runs on each render, so the sidebar follows the language like
 * the rest of the interface does.
 */
type NavItemSpec = Omit<NavItem, 'label'> & {
  labelKey: string;
  permission?: string;
  /** Only in a workspace on this quotation workflow (D6); the default is LEGACY_QUOTATIONS. */
  workflow?: SalesWorkflow;
};

type SalesWorkflow = 'LEGACY_QUOTATIONS' | 'SALES_PROCESS';

/**
 * The one tenant sidebar, filtered by permission (FR-RBAC-07) instead of
 * branching on role. An item with no `permission` is always shown to a
 * tenant user (dashboard, the user's own profile). This list must mirror the
 * `requirePermission(...)` on the matching backend route — see
 * `RequirePermission` in routes/index.tsx, which enforces the same keys.
 */
const tenantNavItems: NavItemSpec[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
  { id: 'clients', labelKey: 'nav.clients', icon: 'group', permission: 'companies.view' },
  // The sales pipeline (M2 Slice 6): the board, with the list one click away.
  { id: 'pipeline', labelKey: 'nav.pipeline', icon: 'pipeline', permission: 'deals.view' },
  // The offers list (M2 Slice 9, FR-OFR-14), in place of the legacy quotations.
  { id: 'offers', labelKey: 'nav.offers', icon: 'description', permission: 'commercial.view', workflow: 'SALES_PROCESS' },
  // Pending discount approvals (M2 Slice 10, FR-DSC-06): whoever may approve sees the queue.
  { id: 'approvals', labelKey: 'nav.approvals', icon: 'task_alt', permission: 'discounts.approve', workflow: 'SALES_PROCESS' },
  // My follow-ups (M2 Slice 11, FR-FUP-07), with the overdue count as a badge.
  { id: 'follow-ups', labelKey: 'nav.followUps', icon: 'follow_up', permission: 'calendar.view' },
  { id: 'appointments', labelKey: 'nav.appointments', icon: 'event', permission: 'calendar.view' },
  { id: 'inventory', labelKey: 'nav.inventory', icon: 'inventory_2', permission: 'inventory.manage' },
  { id: 'quotations', labelKey: 'nav.quotations', icon: 'description', permission: 'quotations.manage', workflow: 'LEGACY_QUOTATIONS' },
  // Same icon family as quotations — an invoice is a quotation's next state,
  // so `receipt_long` reads as "description, but final" without inventing a
  // third visual language for billing documents.
  { id: 'invoices', labelKey: 'nav.invoices', icon: 'receipt_long', permission: 'invoices.manage' },
  // Subscriptions sold to clients. Sits after invoices because it reads as the
  // ongoing commitment behind them rather than a separate part of the product.
  { id: 'contracts', labelKey: 'nav.contracts', icon: 'contract', permission: 'contracts.validity.view' },
  // The Payments overview (M3 Slice 9, FR-PAY-11): instalments in the viewer's scope, with totals.
  { id: 'payments', labelKey: 'nav.payments', icon: 'payments', permission: 'payments.view' },
  // The Renewals screen (M3 Slice 11, FR-REN-05): contracts about to end and just ended, with their renewal state.
  { id: 'renewals', labelKey: 'nav.renewals', icon: 'autorenew', permission: 'contracts.validity.view' },
  { id: 'reports', labelKey: 'nav.reports', icon: 'bar_chart', permission: 'reports.view' },
  // settings/profile carries no permission gate on the backend, so every
  // tenant user can reach their own profile.
  { id: 'settings', path: 'settings/profile', labelKey: 'nav.settings', icon: 'settings' },
];

/**
 * Platform administration, not a business's workspace.
 *
 * SUPER_ADMIN used to fall through to the owner list — the hook branched only
 * on `role === 'STAFF'`, so every other role silently inherited it. That gave
 * the platform console links to Clients, Appointments, Inventory, Quotations,
 * Reports and Settings: six dead ends, because SUPER_ADMIN gets **zero**
 * access to any individual tenant's business data, and `resolveTenant`
 * enforces exactly that with a 403.
 *
 * So this is not a routing fix. The links were correct to fail; the list was
 * wrong. It now contains only what a platform-level role can actually reach.
 * TD-008. Left as its own role-branched list, unlike the tenant list above:
 * SUPER_ADMIN sits outside the permission system entirely (D2), same as
 * `RoleGuard` staying on the `/admin/*` routes.
 */
const superAdminNavItems: NavItemSpec[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
  // `domain` (Building) rather than a new name: Sidebar's iconMap falls back to
  // the dashboard icon for anything it does not know, so an unmapped name would
  // silently give two identical icons instead of an error.
  { id: 'tenants', labelKey: 'nav.tenants', icon: 'domain' },
  // People is platform-wide and therefore legitimately reachable: it reads from
  // /api/tenants/users, a SUPER_ADMIN route with no :tenantSlug, so it does not
  // reintroduce any of the dead tenant-scoped links TD-008 removed.
  { id: 'people', labelKey: 'nav.people', icon: 'group' },
  // Platform-wide defaults + bulk apply to selected tenants — reads/writes
  // /api/platform-settings and /api/tenants/bulk-settings, both SUPER_ADMIN
  // routes with no :tenantSlug, same rationale as People above.
  { id: 'setting', labelKey: 'nav.settings', icon: 'settings' },
];

export const useNavigation = (user?: any | null, currentPath?: string): NavItem[] => {
  const { t } = useTranslation('common');
  const role = user?.role;
  const permissions: Record<string, unknown> = user?.permissions ?? {};
  const workflow: SalesWorkflow = user?.tenantSalesWorkflow === 'SALES_PROCESS' ? 'SALES_PROCESS' : 'LEGACY_QUOTATIONS';

  // SUPER_ADMIN is matched explicitly rather than left to a permission check:
  // it sits outside the permission system (D2) and gets its own fixed list.
  const baseItems: NavItemSpec[] =
    role === 'SUPER_ADMIN'
      ? [...superAdminNavItems]
      : tenantNavItems.filter(
          (item) =>
            (!item.permission || permissions[item.permission] !== undefined) && (!item.workflow || item.workflow === workflow)
        );

  /*
   * Dashboard doubles as the fallback highlight when the path matches nothing
   * else. That used to be spelled as a hand-maintained exclusion list
   * (`!includes('/clients') && !includes('/settings') && ...`) which named only
   * three of the seven destinations — so on /inventory or /quotations the
   * sidebar lit up Dashboard as well as the real page.
   *
   * Deriving the exclusions from the item list itself cannot fall behind it,
   * and it is what lets a new entry work without another manual edit.
   */
  // FR-FUP-07: polled only where the item is shown.
  const showsFollowUps = baseItems.some((item) => item.id === 'follow-ups');
  const overdueFollowUps = useOverdueFollowUpCount(user?.tenantSlug, showsFollowUps);

  const matchesPath = (id: string) => currentPath?.includes(`/${id}`) ?? false;
  const anotherItemMatches = baseItems.some(item => item.id !== 'dashboard' && matchesPath(item.id));

  return baseItems.map(({ labelKey, permission: _permission, workflow: _workflow, ...item }) => ({
    ...item,
    label: t(labelKey),
    ...(item.id === 'follow-ups' && overdueFollowUps > 0
      ? { badge: overdueFollowUps, badgeLabel: t('nav.followUpsOverdue', { count: overdueFollowUps }) }
      : {}),
    isActive:
      matchesPath(item.id) ||
      (item.id === 'dashboard' &&
        currentPath?.endsWith('/login') === false &&
        !anotherItemMatches),
  }));
};
