import { useTranslation } from 'react-i18next';
import type { NavItem } from '../components/layout/Sidebar/Sidebar';

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
type NavItemSpec = Omit<NavItem, 'label'> & { labelKey: string; permission?: string };

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
  { id: 'appointments', labelKey: 'nav.appointments', icon: 'event', permission: 'calendar.view' },
  { id: 'inventory', labelKey: 'nav.inventory', icon: 'inventory_2', permission: 'inventory.manage' },
  { id: 'quotations', labelKey: 'nav.quotations', icon: 'description', permission: 'quotations.manage' },
  // Same icon family as quotations — an invoice is a quotation's next state,
  // so `receipt_long` reads as "description, but final" without inventing a
  // third visual language for billing documents.
  { id: 'invoices', labelKey: 'nav.invoices', icon: 'receipt_long', permission: 'invoices.manage' },
  // Subscriptions sold to clients. Sits after invoices because it reads as the
  // ongoing commitment behind them rather than a separate part of the product.
  { id: 'contracts', labelKey: 'nav.contracts', icon: 'contract', permission: 'contracts.validity.view' },
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

  // SUPER_ADMIN is matched explicitly rather than left to a permission check:
  // it sits outside the permission system (D2) and gets its own fixed list.
  const baseItems: NavItemSpec[] =
    role === 'SUPER_ADMIN'
      ? [...superAdminNavItems]
      : tenantNavItems.filter((item) => !item.permission || permissions[item.permission] !== undefined);

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
  const matchesPath = (id: string) => currentPath?.includes(`/${id}`) ?? false;
  const anotherItemMatches = baseItems.some(item => item.id !== 'dashboard' && matchesPath(item.id));

  return baseItems.map(({ labelKey, permission: _permission, ...item }) => ({
    ...item,
    label: t(labelKey),
    isActive:
      matchesPath(item.id) ||
      (item.id === 'dashboard' &&
        currentPath?.endsWith('/login') === false &&
        !anotherItemMatches),
  }));
};
