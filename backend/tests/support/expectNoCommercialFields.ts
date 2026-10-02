import { COMMERCIAL_FIELDS } from '../../src/access/domain/redactFields';

/**
 * Fails when any field `commercial.view` guards appears in `json`, at any
 * depth (FR-RBAC-17). For asserting what Reception receives from a route.
 */
export function expectNoCommercialFields(json: unknown): void {
  const guarded = new Set(COMMERCIAL_FIELDS);
  const found: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (guarded.has(key)) found.push(`${path}.${key}`);
        walk(child, `${path}.${key}`);
      }
    }
  };
  walk(json, '$');
  if (found.length > 0) {
    throw new Error(`Commercial fields present without commercial.view: ${found.join(', ')}`);
  }
}
