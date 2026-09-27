import { PermissionScope } from './PermissionScope';
import { RoleKey } from './RoleKey';

/** A scoped permission's grant, or `true` for a plain capability. */
export type PermissionGrant = PermissionScope | true;

/** One role's full grant map: permission key → grant. Ungranted keys are absent. */
export type RoleGrantMap = Readonly<Record<string, PermissionGrant>>;

const { Own, Team, All } = PermissionScope;

/**
 * The default permission matrix from SRS §4.2 (FR-RBAC-01), with one
 * deliberate addition. Every tenant is seeded with this, and the
 * Administrator edits it from here on (Slice 6) — this table is the
 * *default*, not a live source ResolveAccessContext reads from directly.
 *
 * D3 (notes split): Reception's "notes only" right is `notes.view: ALL` +
 * `notes.add: ALL`, with no `activities.*` and no `commercial.view`/
 * `payments.view` — "All (basic)" companies access plus field redaction
 * (Slice 4) does the rest.
 *
 * D8 (modules the SRS doesn't mention): granted to Administrator only.
 *
 * Deviation from the literal §4.2 matrix: the SRS gives the Administrator
 * no `calendar.view` (only Sales User/Manager and CEO have it). Legacy
 * BUSINESS_OWNER users map to Administrator (D2), so seeding the matrix
 * exactly as written would take the Appointments/calendar feature away from
 * every existing business owner the moment this migration runs, with no
 * self-service way to grant it back until Slice 6. `calendar.view: ALL` is
 * added here so nothing already working regresses; flag this to Wellness
 * Albania to confirm at UAT (see the SRS review note after this table).
 */
export const DEFAULT_ROLE_MATRIX: Readonly<Record<RoleKey, RoleGrantMap>> = {
  [RoleKey.SalesUser]: {
    'companies.view': Own,
    'companies.edit': Own,
    'activities.view': Own,
    'activities.add': Own,
    'notes.view': Own,
    'notes.add': Own,
    'calendar.view': Own,
    'contracts.validity.view': Own,
    'contracts.manage': Own,
    'quotations.manage': Own,
    'invoices.manage': Own,
    'commercial.view': Own,
    'payments.view': Own,
    'performance.view': Own,
    // Deviation from D8's "Administrator only by default": D8's single
    // coarse inventory.manage key covers reads, creates and stock
    // adjustments too, not just deletes and bulk edits — today those are
    // open to every tenant user (scoped to the caller's own warehouse
    // inside the use cases). Seeding Administrator-only here would take
    // inventory away from every legacy STAFF user with no self-service fix
    // until Slice 6 — the same regression `calendar.view` would have been
    // for BUSINESS_OWNER, confirmed with the user for this key too. OWN
    // reads as "their own warehouse" (SearchProducts, AdjustStock,
    // TransferStock, GetWarehouses already scope this way); routes that
    // were BUSINESS_OWNER-only (bulk update, delete, warehouse/category
    // management) require ALL specifically — see inventoryRoutes.ts.
    'inventory.manage': Own,
  },
  [RoleKey.SalesManager]: {
    'companies.view': Team,
    'companies.edit': Team,
    'companies.delete': Team,
    'companies.reassign': Team,
    'activities.view': Team,
    'activities.add': Team,
    'notes.view': Team,
    'notes.add': Team,
    'calendar.view': Team,
    'contracts.validity.view': Team,
    'contracts.manage': Team,
    'quotations.manage': Team,
    'invoices.manage': Team,
    'commercial.view': Team,
    'payments.view': Team,
    'performance.view': Team,
  },
  [RoleKey.Reception]: {
    'companies.view': All,
    'notes.view': All,
    'notes.add': All,
    'contracts.validity.view': All,
  },
  [RoleKey.Administrator]: {
    'companies.view': All,
    'companies.edit': All,
    'companies.delete': All,
    'companies.reassign': All,
    'activities.view': All,
    'activities.add': All,
    // Deviation from the literal SRS matrix — see the doc comment above.
    'calendar.view': All,
    'notes.view': All,
    'notes.add': All,
    'contracts.validity.view': All,
    'contracts.manage': All,
    'quotations.manage': All,
    'quotations.approve': true,
    'invoices.manage': All,
    'commercial.view': All,
    'payments.view': All,
    'payments.update': true,
    'users.manage': true,
    'roles.manage': true,
    'pricing.manage': true,
    'settings.manage': true,
    'audit.view': true,
    'inventory.manage': All,
    'forms.manage': true,
    'integrations.manage': true,
    'reports.view': true,
  },
  [RoleKey.Ceo]: {
    'companies.view': All,
    'activities.view': All,
    'notes.view': All,
    'calendar.view': All,
    'contracts.validity.view': All,
    'commercial.view': All,
    'payments.view': All,
    'performance.view': All,
    'audit.view': true,
  },
};
