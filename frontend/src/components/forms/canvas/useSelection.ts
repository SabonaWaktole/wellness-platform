import { useCallback, useMemo, useState } from 'react';

/**
 * Canvas selection, single and multiple (spec §19, §21).
 *
 * The selection is an ORDERED LIST rather than a set: the last item added is
 * the "primary", which is what the properties panel inspects and what
 * align-to operations treat as the anchor. A Set would lose that, and the
 * panel would have to pick arbitrarily.
 */

export type SelectionKind = 'page' | 'section' | 'element';

export interface SelectionItem {
  type: SelectionKind;
  id: string;
}

export interface SelectOptions {
  /** Shift/Cmd-click: extend the selection instead of replacing it. */
  additive?: boolean;
}

export interface Selection {
  selection: SelectionItem[];
  ids: string[];
  /** Last item added — what the properties panel shows. */
  primary: SelectionItem | null;
  kind: SelectionKind | null;
  isSelected: (id: string) => boolean;
  select: (item: SelectionItem, options?: SelectOptions) => void;
  /** Replaces the selection wholesale — marquee, select-all. */
  selectMany: (type: SelectionKind, ids: string[]) => void;
  clear: () => void;
  /** Drops ids that no longer exist, after a delete or an undo. */
  retain: (aliveIds: Set<string>) => void;
}

export const useSelection = (): Selection => {
  const [selection, setSelection] = useState<SelectionItem[]>([]);

  const select = useCallback((item: SelectionItem, options: SelectOptions = {}) => {
    setSelection((current) => {
      if (!options.additive) return [item];

      // Mixing kinds has no coherent meaning — there is no operation that
      // takes "a page and an element" — so a different kind replaces.
      if (current.length > 0 && current[0].type !== item.type) return [item];

      const existing = current.findIndex((s) => s.id === item.id);
      if (existing >= 0) return current.filter((s) => s.id !== item.id);
      return [...current, item];
    });
  }, []);

  const selectMany = useCallback((type: SelectionKind, ids: string[]) => {
    setSelection(ids.map((id) => ({ type, id })));
  }, []);

  const clear = useCallback(() => setSelection([]), []);

  const retain = useCallback((aliveIds: Set<string>) => {
    setSelection((current) => {
      const kept = current.filter((s) => aliveIds.has(s.id));
      return kept.length === current.length ? current : kept;
    });
  }, []);

  const ids = useMemo(() => selection.map((s) => s.id), [selection]);
  const idSet = useMemo(() => new Set(ids), [ids]);
  const isSelected = useCallback((id: string) => idSet.has(id), [idSet]);

  return {
    selection,
    ids,
    primary: selection.length > 0 ? selection[selection.length - 1] : null,
    kind: selection.length > 0 ? selection[0].type : null,
    isSelected,
    select,
    selectMany,
    clear,
    retain,
  };
};
