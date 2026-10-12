import type { StepKind, StepSafety } from './types';

/**
 * Reusable guidance for the control families that appear on many pages. A
 * step says `use: 'shared.pagination'` and gets this kind's explanation (copy
 * under `support:shared.<kind>.*`), safety class and disabled hint, with its
 * own subject filled in. A kind is added here only when a second page needs it.
 */
export interface SharedKind {
  kind: StepKind;
  safety: StepSafety;
  /** The step's flag for text that needs care. None of today's kinds is destructive. */
  warning?: boolean;
  /** The kind has a `disabled` hint in the copy. */
  disabledHint?: boolean;
}

export const SHARED = {
  search: { kind: 'field', safety: 'explain-only' },
  filterSelect: { kind: 'filter', safety: 'explain-only' },
  dateRange: { kind: 'filter', safety: 'explain-only' },
  statusChips: { kind: 'filter', safety: 'explain-only' },
  sortHeader: { kind: 'control', safety: 'explain-only' },
  pagination: { kind: 'control', safety: 'explain-only', disabledHint: true },
  rowMenu: { kind: 'menu', safety: 'explain-only', disabledHint: true },
  statusBadge: { kind: 'info', safety: 'explain-only' },
  tabs: { kind: 'tab', safety: 'explain-only' },
  bulkSelect: { kind: 'control', safety: 'explain-only', disabledHint: true },
  export: { kind: 'control', safety: 'explain-only', disabledHint: true },
  refresh: { kind: 'control', safety: 'explain-only', disabledHint: true },
  backLink: { kind: 'control', safety: 'explain-only' },
  saveBar: { kind: 'submit', safety: 'explain-only', disabledHint: true },
  confirmDialog: { kind: 'region', safety: 'explain-only' },
  emptyAction: { kind: 'control', safety: 'explain-only', disabledHint: true },
} satisfies Record<string, SharedKind>;

export type SharedKindId = keyof typeof SHARED;

export const SHARED_KINDS = Object.keys(SHARED) as SharedKindId[];

export const isSharedKind = (id: string): id is SharedKindId => Object.hasOwn(SHARED, id);

/** The copy keys of a kind, in the `support` namespace. */
export const sharedCopyKeys = (kind: SharedKindId) => ({
  title: `shared.${kind}.title`,
  body: `shared.${kind}.body`,
  when: `shared.${kind}.when`,
  disabled: `shared.${kind}.disabled`,
});
