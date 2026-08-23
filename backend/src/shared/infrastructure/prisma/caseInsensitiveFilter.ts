import { IS_MYSQL } from './provider';

/**
 * `mode: 'insensitive'` is a Postgres-only Prisma filter option — it isn't a
 * valid property on MySQL's generated `StringFilter` type at all, so it can't
 * appear in code that has to compile against both clients. MySQL doesn't need
 * it: the schema's utf8mb4_unicode_ci collation already makes `contains` and
 * `equals` case-insensitive there. Untyped (`any`) return on purpose — the
 * two branches are structurally different objects, and only one of them is a
 * valid shape for whichever client is actually generated at build time.
 */
export function insensitiveContains(value: string): any {
  return IS_MYSQL ? { contains: value } : { contains: value, mode: 'insensitive' };
}

export function insensitiveEquals(value: string): any {
  return IS_MYSQL ? { equals: value } : { equals: value, mode: 'insensitive' };
}
