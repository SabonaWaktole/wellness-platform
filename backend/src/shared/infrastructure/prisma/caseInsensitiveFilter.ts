/**
 * MySQL is the only provider, and the schema's `utf8mb4_unicode_ci` collation
 * already makes `contains` and `equals` case-insensitive — so these are plain
 * pass-throughs.
 *
 * They are kept rather than inlined at the call sites because they are the
 * record of WHY no `mode: 'insensitive'` appears anywhere in this codebase.
 * That option is Postgres-only; it is not a valid property on MySQL's
 * generated `StringFilter` at all, so reaching for it would not fail at
 * runtime but at compile time, in a place far from the reason. Routing every
 * case-insensitive comparison through here keeps the answer in one place.
 *
 * `_ci` is the whole mechanism: if the collation is ever changed to `_bin` or
 * `_cs`, these two functions are the only things that need to grow a LOWER()
 * — not the dozen call sites.
 */
export function insensitiveContains(value: string) {
  return { contains: value };
}

export function insensitiveEquals(value: string) {
  return { equals: value };
}
