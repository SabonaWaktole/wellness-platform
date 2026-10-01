import { DealType } from './DealType';

/**
 * The Albanian name of each deal type, for the one place the server needs a
 * deal's name rather than its fields: the audit log, which records labels in
 * the workspace's language as StatusLabel and the lookups do. Screens render
 * the default title in the reader's own language instead.
 */
const DEAL_TYPE_LABELS_SQ: Record<DealType, string> = {
  [DealType.NewContract]: 'Kontratë e re',
  [DealType.Renewal]: 'Rinovim',
  [DealType.ExtraServices]: 'Shërbime shtesë',
};

/** The deal's title, or the default "<company> – <type>" (FR-DEAL-01). */
export function dealLabel(title: string | null, companyName: string, type: DealType): string {
  return title ?? `${companyName} – ${DEAL_TYPE_LABELS_SQ[type]}`;
}
