/**
 * The fixed, in-code catalogue of permission keys (FR-RBAC-02: "Permissions
 * are a fixed catalogue defined in code; roles and their permissions are
 * data"). A `RolePermission.permissionKey` that isn't listed here is inert —
 * nothing in the codebase checks it — which is what lets `roles.manage`
 * grant or revoke a key with no deployment.
 *
 * `supportsScope: true` means the permission is meaningless without a scope
 * (OWN/TEAM/ALL) and a `RolePermission` row for it always carries one — see
 * `AccessContext.scopeOf`. `supportsScope: false` is a plain capability:
 * holding the row is the grant, and its `scope` column is always NULL.
 *
 * `milestone` marks a key the SRS defines now so the Administrator can
 * configure it, but whose screen or enforcement point doesn't exist until
 * that milestone (cross-cutting rule 9: build the configuration, not the
 * feature). Those keys are seeded and check `can()`/`scopeOf()` like any
 * other, they just have no call site yet.
 */
export interface PermissionCatalogueEntry {
  key: string;
  group: string;
  supportsScope: boolean;
  /** Milestone the enforcement point ships in, when later than Milestone 1. */
  milestone?: 'M2' | 'M3';
}

export const PERMISSION_CATALOGUE: readonly PermissionCatalogueEntry[] = [
  // Companies & contacts
  { key: 'companies.view', group: 'companies', supportsScope: true },
  { key: 'companies.edit', group: 'companies', supportsScope: true },
  { key: 'companies.delete', group: 'companies', supportsScope: true },
  { key: 'companies.reassign', group: 'companies', supportsScope: true },

  // Activities & notes (D3: split from a single "notes only" right)
  { key: 'activities.view', group: 'activities', supportsScope: true },
  { key: 'activities.add', group: 'activities', supportsScope: true },
  { key: 'notes.view', group: 'activities', supportsScope: true },
  { key: 'notes.add', group: 'activities', supportsScope: true },
  { key: 'calendar.view', group: 'activities', supportsScope: true },

  // Contracts
  { key: 'contracts.validity.view', group: 'contracts', supportsScope: true },
  { key: 'contracts.manage', group: 'contracts', supportsScope: true },

  // Quotations
  { key: 'quotations.manage', group: 'quotations', supportsScope: true },
  { key: 'quotations.approve', group: 'quotations', supportsScope: false },

  // Invoices
  { key: 'invoices.manage', group: 'invoices', supportsScope: true },

  // Sales (Milestone 2, SRS M2 §9.1, FR-RBAC-15).
  { key: 'script.view', group: 'sales', supportsScope: false, milestone: 'M2' },
  { key: 'script.edit', group: 'sales', supportsScope: false, milestone: 'M2' },
  { key: 'deals.view', group: 'sales', supportsScope: true, milestone: 'M2' },
  // Create, edit and change stage.
  { key: 'deals.edit', group: 'sales', supportsScope: true, milestone: 'M2' },
  { key: 'deals.reopen', group: 'sales', supportsScope: true, milestone: 'M2' },
  { key: 'deals.delete', group: 'sales', supportsScope: true, milestone: 'M2' },
  // Create, edit and download.
  { key: 'offers.edit', group: 'sales', supportsScope: true, milestone: 'M2' },
  { key: 'commercial.view', group: 'sales', supportsScope: true, milestone: 'M2' },
  // A discount up to the workspace cap; above it needs discounts.approve.
  { key: 'discounts.apply', group: 'sales', supportsScope: true, milestone: 'M2' },
  { key: 'discounts.approve', group: 'sales', supportsScope: true, milestone: 'M2' },
  { key: 'pricing.manage', group: 'sales', supportsScope: false, milestone: 'M2' },
  { key: 'followups.manage', group: 'sales', supportsScope: true, milestone: 'M2' },
  // Activity results and deal stage labels.
  { key: 'activityResults.manage', group: 'sales', supportsScope: false, milestone: 'M2' },

  // Payments (M3) — groundwork only, per cross-cutting rule 9.
  { key: 'payments.view', group: 'payments', supportsScope: true, milestone: 'M3' },
  { key: 'payments.update', group: 'payments', supportsScope: false, milestone: 'M3' },
  { key: 'performance.view', group: 'performance', supportsScope: true, milestone: 'M3' },

  // Administration
  { key: 'users.manage', group: 'admin', supportsScope: false },
  { key: 'roles.manage', group: 'admin', supportsScope: false },
  { key: 'settings.manage', group: 'admin', supportsScope: false },
  { key: 'audit.view', group: 'admin', supportsScope: false },

  // D8: modules the SRS doesn't mention, kept behind coarse permissions.
  { key: 'inventory.manage', group: 'modules', supportsScope: true },
  { key: 'forms.manage', group: 'modules', supportsScope: false },
  { key: 'integrations.manage', group: 'modules', supportsScope: false },
  { key: 'reports.view', group: 'modules', supportsScope: false },
];

const BY_KEY = new Map(PERMISSION_CATALOGUE.map((entry) => [entry.key, entry]));

/** The catalogue entry for `key`, or `undefined` if it isn't a real permission. */
export function catalogueEntry(key: string): PermissionCatalogueEntry | undefined {
  return BY_KEY.get(key);
}

/** True when `key` is a scoped permission (OWN/TEAM/ALL), per the catalogue. */
export function keySupportsScope(key: string): boolean {
  return BY_KEY.get(key)?.supportsScope ?? false;
}
