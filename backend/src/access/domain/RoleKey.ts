/** The five system roles FR-RBAC-01 requires every tenant to be seeded with. */
export enum RoleKey {
  SalesUser = 'SALES_USER',
  SalesManager = 'SALES_MANAGER',
  Reception = 'RECEPTION',
  Administrator = 'ADMINISTRATOR',
  Ceo = 'CEO',
}

/** `nameSq`/`nameEn` a fresh tenant's system roles are seeded with. */
export const SYSTEM_ROLE_NAMES: Record<RoleKey, { nameSq: string; nameEn: string }> = {
  [RoleKey.SalesUser]: { nameSq: 'Përdorues Shitjesh', nameEn: 'Sales User' },
  [RoleKey.SalesManager]: { nameSq: 'Menaxher Shitjesh', nameEn: 'Sales Manager' },
  [RoleKey.Reception]: { nameSq: 'Recepsion', nameEn: 'Reception' },
  [RoleKey.Administrator]: { nameSq: 'Administrator', nameEn: 'Administrator' },
  [RoleKey.Ceo]: { nameSq: 'CEO', nameEn: 'CEO' },
};

/**
 * The system role a role behaves as wherever behaviour still follows the
 * role itself rather than its permissions: who counts as a Sales User for
 * Team scope (D4), and the legacy `User.role` string written alongside
 * `roleId`. A custom role copied from Sales User (FR-RBAC-04) is still a
 * Sales User there; a system role is its own lineage.
 */
export function lineageKeyOf(role: { key: string; baseKey: string | null }): string {
  return role.baseKey ?? role.key;
}
