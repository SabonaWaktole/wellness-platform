import { z } from 'zod';

const roleNames = z.object({
  nameSq: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
});

export const roleSchemas = {
  // The whole new permission set, one row per granted key. Which keys exist and
  // which take a scope is checked against the catalogue in the domain
  // (`toGrantMap`), not here, so the rule lives in one place.
  updatePermissions: z.object({
    permissions: z.array(
      z.object({
        key: z.string().min(1),
        scope: z.enum(['OWN', 'TEAM', 'ALL']).nullable(),
      })
    ),
  }),
  copyRole: roleNames,
  renameRole: roleNames,
};
