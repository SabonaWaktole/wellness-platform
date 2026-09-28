interface LookupNames {
  nameSq: string;
  nameEn?: string | null;
}

/**
 * A list value's name in the interface language (FR-LNG-03): Albanian in
 * Albanian, otherwise the English name, falling back to Albanian when the
 * value has no English name (only the Albanian one is required).
 */
export function lookupLabel(item: LookupNames, language: string): string {
  if (language.startsWith('sq')) return item.nameSq;
  return item.nameEn || item.nameSq;
}
