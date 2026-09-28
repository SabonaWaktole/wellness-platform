interface RoleNames {
  nameSq?: string | null;
  nameEn?: string | null;
}

/**
 * A role's name in the interface language (FR-LNG-03): Albanian in Albanian,
 * otherwise the English name, falling back to the Albanian one when a role
 * has no English name.
 */
export function roleLabel(role: RoleNames, language: string): string {
  if (language.startsWith('sq')) return role.nameSq || role.nameEn || '';
  return role.nameEn || role.nameSq || '';
}
