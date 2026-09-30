/**
 * The reviewed config that drives the Slice 14 legacy migration (FR-CMP-08).
 * One config per tenant, checked in and reviewed by a human before a run —
 * never guessed at runtime. `from` lists legacy custom-field **names**, in
 * priority order; the first one present on a client with a non-empty value
 * wins. `values` is an optional literal map from a legacy value to the
 * target lookup's label (Albanian or English), for values that do not read
 * as the same text, e.g. `"Hospitality"` -> `"Kafene"`.
 */
export interface LegacyFieldMapping {
  from: string[];
  values?: Record<string, string>;
}

export type LegacyMappedField =
  | 'businessType'
  | 'employeeCount'
  | 'area'
  | 'city'
  | 'streetAddress'
  | 'taxId'
  | 'website'
  | 'contactName';

export interface LegacyMappingConfig {
  tenant: string;
  fields: Partial<Record<LegacyMappedField, LegacyFieldMapping>>;
}

export function isLegacyMappingConfig(value: unknown): value is LegacyMappingConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.tenant !== 'string' || !candidate.tenant.trim()) return false;
  if (!candidate.fields || typeof candidate.fields !== 'object') return false;
  return Object.values(candidate.fields as Record<string, unknown>).every((mapping) => {
    if (!mapping || typeof mapping !== 'object') return false;
    const m = mapping as Record<string, unknown>;
    if (!Array.isArray(m.from) || !m.from.every((name) => typeof name === 'string')) return false;
    if (m.values !== undefined) {
      if (typeof m.values !== 'object' || m.values === null) return false;
      if (!Object.values(m.values as Record<string, unknown>).every((v) => typeof v === 'string')) return false;
    }
    return true;
  });
}

/** The first non-blank value found on `customFieldValues` for this mapping's `from` list, in order. */
export function firstMappedValue(
  mapping: LegacyFieldMapping | undefined,
  customFieldValues: Record<string, unknown>
): string | undefined {
  if (!mapping) return undefined;
  for (const fieldName of mapping.from) {
    const value = customFieldValues?.[fieldName];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

/** Applies the mapping's explicit `values` override, if the raw value is listed there. */
export function resolveMappedValue(mapping: LegacyFieldMapping | undefined, rawValue: string): string {
  return mapping?.values?.[rawValue] ?? rawValue;
}
