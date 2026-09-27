import { PermissionScope } from './PermissionScope';
import { RoleKey } from './RoleKey';

/** A scoped permission's grant, or `true` for a plain capability. */
export type PermissionGrant = PermissionScope | true;

/** One role's full grant map: permission key → grant. Ungranted keys are absent. */
export type RoleGrantMap = Readonly<Record<string, PermissionGrant>>;

const { Own, Team, All } = PermissionScope;

/**
 * The default permission matrix from SRS §4.2 (FR-RBAC-01). Every tenant is
 * seeded with exactly this, and the Administrator edits it from here on
 * (Slice 6) — this table is the *default*, not a live source ResolveAccessContext
 * reads from directly.
 *
 * D3 (notes split): Reception's "notes only" right is `notes.view: ALL` +
 * `notes.add: ALL`, with no `activities.*` and no `commercial.view`/
 * `payments.view` — "All (basic)" companies access plus field redaction
 * (Slice 4) does the rest.
 *
 * D8 (modules the SRS doesn't mention): granted to Administrator only.
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
