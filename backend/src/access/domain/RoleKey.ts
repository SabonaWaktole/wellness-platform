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
