import { useCallback, useState } from 'react';
import type { FormDocument } from '../../../types/form';

/**
 * Undo/redo over immutable document snapshots (spec §21).
 *
 * Snapshots rather than inverse operations: `layoutOps` already returns whole
 * new documents, so a snapshot is free, and an inverse-operation log would
 * have to stay in step with every future transform — including the overflow
 * ladder, where one operation can move a section AND insert a page.
 *
 * COALESCING is the part that matters. A continuous drag fires a state change
 * per `pointermove`; without grouping, one drag becomes one Ctrl+Z per pixel
 * moved and undo is useless exactly when it is most needed (spec §21's
 * "sensible history grouping so continuous dragging does not create hundreds
 * of tiny history entries"). `beginInteraction()`/`endInteraction()` bracket a
 * gesture: every commit in between updates the present without pushing, and
 * the single pre-gesture state is what one undo returns to.
 */

/** Deepest the stack goes. A multi-page document is a few hundred KB, so an
 *  unbounded stack is a real memory leak in a long editing session. */
export const HISTORY_LIMIT = 100;

export interface History {
  present: FormDocument;
  canUndo: boolean;
  canRedo: boolean;
  /** Records a new state. No-op if identical to the present. */
  commit: (next: FormDocument) => void;
  undo: () => void;
  redo: () => void;
  /** Opens a coalescing window — every commit until `endInteraction` folds
   *  into one entry. Safe to nest-call; only the outermost pair counts. */
  beginInteraction: () => void;
  endInteraction: () => void;
  /**
   * Updates the document WITHOUT recording anything.
   *
   * For provisional state only — content the editor puts on the page on the
   * user's behalf and will take away again if they do not use it. The empty
   * block a click on blank paper creates is the case this exists for: it is
   * not an edit until something is typed into it, and recording it made a
   * stray click cost an undo entry that appeared to do nothing when pressed
   * (one for the block, another for reclaiming it).
   *
   * Anything the USER did belongs in `commit`.
   */
  replacePresent: (next: FormDocument) => void;
  /** Replaces the document and discards history (a fresh load or a reload
   *  after a save conflict — the old stack no longer describes this form). */
  reset: (next: FormDocument) => void;
}

/**
 * All four fields live in ONE state object rather than four `useState`s.
 *
 * That is a correctness requirement, not a style choice: the first cut called
 * `setPast`/`setFuture` from inside `setPresent`'s updater, which is a side
 * effect in a function React may batch, replay or invoke twice. Under a
 * 40-commit drag the group flag was read stale and every move pushed its own
 * entry — exactly the failure coalescing exists to prevent. One updater, one
 * atomic transition, no cross-setter reads.
 */
interface HistoryState {
  past: FormDocument[];
  present: FormDocument;
  future: FormDocument[];
  /** Depth of open interactions; >0 means commits coalesce. */
  groupDepth: number;
  /** Whether the current interaction already pushed its one entry. */
  groupPushed: boolean;
}

export const useHistory = (initial: FormDocument): History => {
  const [state, setState] = useState<HistoryState>({
    past: [],
    present: initial,
    future: [],
    groupDepth: 0,
    groupPushed: false,
  });

  const commit = useCallback((next: FormDocument) => {
    setState((s) => {
      if (next === s.present) return s;

      const coalescing = s.groupDepth > 0;
      // Inside a gesture that already pushed, only advance the present — the
      // one pre-gesture entry is what a single undo returns to.
      if (coalescing && s.groupPushed) return { ...s, present: next };

      return {
        ...s,
        past: [...s.past, s.present].slice(-HISTORY_LIMIT),
        present: next,
        // Any new edit invalidates the redo branch.
        future: [],
        groupPushed: coalescing,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s;
      return {
        ...s,
        past: s.past.slice(0, -1),
        present: s.past[s.past.length - 1],
        future: [s.present, ...s.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s;
      return {
        ...s,
        past: [...s.past, s.present].slice(-HISTORY_LIMIT),
        present: s.future[0],
        future: s.future.slice(1),
      };
    });
  }, []);

  const beginInteraction = useCallback(() => {
    setState((s) => ({
      ...s,
      groupDepth: s.groupDepth + 1,
      groupPushed: s.groupDepth === 0 ? false : s.groupPushed,
    }));
  }, []);

  const endInteraction = useCallback(() => {
    setState((s) => {
      const groupDepth = Math.max(0, s.groupDepth - 1);
      return { ...s, groupDepth, groupPushed: groupDepth === 0 ? false : s.groupPushed };
    });
  }, []);

  const replacePresent = useCallback((next: FormDocument) => {
    setState((s) => (s.present === next ? s : { ...s, present: next }));
  }, []);

  const reset = useCallback((next: FormDocument) => {
    setState({ past: [], present: next, future: [], groupDepth: 0, groupPushed: false });
  }, []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    undo,
    redo,
    beginInteraction,
    endInteraction,
    replacePresent,
    reset,
  };
};
