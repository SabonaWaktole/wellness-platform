import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormPageRenderer } from '../FormRenderer';
import { CanvasSection } from './CanvasSection';
import { CanvasElement } from './CanvasElement';
import type { ResizedBox } from './useResize';
import { CANVAS_GUTTER, type CanvasViewport } from './useCanvasViewport';
import { GuideOverlay } from './GuideOverlay';
import { computeSnap, type Guide } from './snapping';
import { findSection, pageContainingSection, sectionContaining } from './layoutOps';
import { useVisiblePages } from './useVisiblePages';
import type { EditTarget } from './useInlineEditing';
import type { Editor } from '@tiptap/react';
import type { ComponentType, DocumentPage, ElementContent, FormDocument } from '../../../types/form';
import styles from './FormCanvas.module.css';

const EMPTY_GUIDES: Guide[] = [];

/**
 * Whether a pointer/click event started inside whatever currently holds the
 * caret.
 *
 * The sheet answers a click by selecting its page. While a caret is open the
 * element's overlay is deliberately pointer-transparent (see `CanvasElement`),
 * so every click INSIDE the editor — placing the caret, selecting a word —
 * reached the sheet underneath and deselected the object being typed into: the
 * contextual tab vanished, the format pane collapsed, and the page jumped, all
 * from putting the cursor where the user wanted it.
 *
 * Two markers are needed because the two kinds of editor live in different
 * trees: the label/title inputs are inside this component's own overlay
 * chrome (`data-editing-surface`), while a TEXT block's rich editor is drawn by
 * `FormPageRenderer` inside the element's own box (`data-element-id`).
 */
const isInsideCaret = (event: React.SyntheticEvent, editing: EditTarget | null | undefined): boolean => {
  if (!editing) return false;
  const target = event.target as Element | null;
  if (!target?.closest) return false;
  return !!target.closest(`[data-editing-surface="true"], [data-element-id="${editing.id}"]`);
};

export type CanvasSelection =
  | { type: 'page'; id: string }
  | { type: 'section'; id: string }
  | { type: 'element'; id: string }
  | null;

export interface FormCanvasProps {
  layout: FormDocument;
  viewport: CanvasViewport;
  selection: CanvasSelection;
  /**
   * Every selected id when more than one object is selected. Optional: with
   * it absent, `selection` alone decides, which is exactly the single-select
   * behaviour this component had before.
   */
  selectedIds?: ReadonlySet<string>;
  onSelect: (selection: CanvasSelection, options?: { additive?: boolean }) => void;
  /** Which piece of text currently holds the caret, if any (spec §7). */
  editing?: EditTarget | null;
  onBeginEdit: (target: EditTarget) => void;
  onChangeElementContent: (elementId: string, content: ElementContent) => void;
  onRenameField: (elementId: string, label: string) => void;
  onEditorReady: (editor: Editor | null) => void;
  /** Opens the `/` insert menu inside whichever TEXT block currently holds
   *  the caret — see FormPageRenderer's own doc for why this is gated the
   *  same way as `onChangeElementContent`. */
  onInsertComponent?: (type: ComponentType) => void;
  /** Right-click. The target decides which menu is built. */
  onContextMenu: (
    event: React.MouseEvent,
    target: { type: 'element' | 'section' | 'page'; id: string }
  ) => void;
  onMoveSection: (sectionId: string, x: number, y: number) => void;
  onResizeSection: (sectionId: string, box: ResizedBox) => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onMoveElement: (elementId: string, x: number, y: number) => void;
  onResizeElement: (elementId: string, box: ResizedBox) => void;
  onDeleteElement: (elementId: string) => void;
  /**
   * A click landed on unoccupied page space: put a caret there and let the
   * owner write. Coordinates are PAGE coordinates, already divided by zoom.
   */
  onTypeAt: (pageId: string, x: number, y: number) => void;
  /** Brackets a drag/resize/click gesture so useHistory coalesces every
   *  intermediate commit into one undo entry (spec §21). */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  /**
   * Fired on every pointer down and every pointer release, WHETHER OR NOT a
   * history window opens. `onGestureStart`/`onGestureEnd` deliberately stay
   * shut while a caret is live; the builder's drag baseline must not, or a
   * drag begun during an edit session would reflow against a stale document.
   */
  onGestureReset?: () => void;
}

/**
 * The document: an ordered STACK OF A4 SHEETS with visible boundaries and
 * whitespace around them, so a page reads as a sheet of paper (spec §5).
 *
 * Each sheet draws its content with `FormPageRenderer` — the very same
 * component the preview, the client-facing form and print use — and this
 * component layers selection/drag/resize chrome on top at identical
 * coordinates. That is what keeps the builder and the rendered form from ever
 * disagreeing about layout (brief §6).
 *
 * ZOOM is applied as a single CSS transform on the stack and never reaches
 * document coordinates (spec §5/§25). Pointer math stays in document space
 * because `useDragMove`/`useResize` divide their deltas by `viewport.getScale()`.
 */
export const FormCanvas: React.FC<FormCanvasProps> = ({
  layout,
  viewport,
  selection,
  selectedIds,
  onSelect,
  editing,
  onBeginEdit,
  onChangeElementContent,
  onRenameField,
  onEditorReady,
  onInsertComponent,
  onContextMenu,
  onMoveSection,
  onResizeSection,
  onRenameSection,
  onDeleteSection,
  onMoveElement,
  onResizeElement,
  onDeleteElement,
  onTypeAt,
  onGestureStart,
  onGestureEnd,
  onGestureReset,
}) => {
  const [guides, setGuides] = useState<Guide[]>([]);
  // Which page's overlay the current guides belong to — a drag on page 2
  // must never bleed guide lines onto page 1 or 3's identical page-coordinate
  // positions.
  const [guidePageId, setGuidePageId] = useState<string | null>(null);
  const altHeld = useRef(false);

  // Alt is spec §19's "temporary way to disable snapping for fine
  // positioning" — tracked globally, not per-element, since it can be
  // pressed or released mid-drag.
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Alt') altHeld.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Alt') altHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Guides only make sense while a gesture is live; a global pointerup is
  // what reliably marks the end of one regardless of where the pointer was
  // released (setPointerCapture can move it outside the sheet).
  useEffect(() => {
    const clear = () => {
      setGuides([]);
      setGuidePageId(null);
      onGestureReset?.();
      // Same rule as `onPointerDownCapture` above: an edit session brackets
      // its own history entry, so a stray release must not close it early.
      if (!editing) onGestureEnd?.();
    };
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
  }, [onGestureEnd, onGestureReset, editing]);

  /**
   * Snaps a section move against its page siblings and the page edges/centre,
   * in PAGE coordinates — the space GuideOverlay draws in directly.
   */
  const handleMoveSection = (id: string, x: number, y: number) => {
    const found = findSection(layout, id);
    if (!found) return onMoveSection(id, x, y);
    const siblings = found.page.sections
      .filter((s) => s.id !== id)
      .map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }));
    const snap = computeSnap(
      { x, y, width: found.section.width, height: found.section.height },
      siblings,
      { width: layout.page.width, height: layout.page.height },
      { disabled: altHeld.current }
    );
    setGuides(snap.guides);
    setGuidePageId(found.page.id);
    onMoveSection(id, snap.x, snap.y);
  };

  /**
   * Snaps an element move against its section's other elements and the
   * section's own edges/centre — computed in the SECTION's local space (what
   * `computeSnap` needs to compare against sibling boxes), then offset by the
   * section's page position before it reaches GuideOverlay.
   */
  const handleMoveElement = (id: string, x: number, y: number) => {
    const section = layout.pages.flatMap((p) => p.sections).find((s) => s.elements.some((e) => e.id === id));
    const element = section?.elements.find((e) => e.id === id);
    if (!section || !element) return onMoveElement(id, x, y);

    const siblings = section.elements
      .filter((e) => e.id !== id)
      .map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
    const snap = computeSnap(
      { x, y, width: element.width, height: element.height },
      siblings,
      { width: section.width, height: section.height },
      { disabled: altHeld.current }
    );
    setGuides(
      snap.guides.map((g) => ({
        axis: g.axis,
        position: g.position + (g.axis === 'x' ? section.x : section.y),
      }))
    );
    setGuidePageId(pageContainingSection(layout, section.id)?.id ?? null);
    onMoveElement(id, snap.x, snap.y);
  };
  // A throwaway form instance purely so FormPageRenderer has a `control` to
  // bind to — nothing here is ever submitted. This is what makes the canvas a
  // REAL preview: the same inputs, styling and control variants an end user
  // would get.
  const { control } = useForm({ defaultValues: { data: {} } });

  // The section "Add …" will target: the directly selected section, or the
  // one containing the selected element.
  const targetSectionId =
    selection?.type === 'section'
      ? selection.id
      : selection?.type === 'element'
        ? layout.pages
            .flatMap((p) => p.sections)
            .find((s) => s.elements.some((el) => el.id === selection.id))?.id ?? null
        : null;

  // Virtualisation (spec §35): pages far outside the viewport skip rendering
  // their FormPageRenderer + canvas chrome — real cost on a 10-page, 300+
  // component document. The page holding the current selection is always
  // force-rendered regardless of visibility, so drag/resize handles never
  // vanish out from under an in-progress gesture just because a resize
  // elsewhere scrolled it off-screen. The page holding the CARET is force-
  // rendered for the same reason and a worse failure: unmounting a live
  // editor mid-word loses both the focus and the keystrokes in flight.
  const pageIds = layout.pages.map((p) => p.id);
  const { isVisible, setPageRef } = useVisiblePages(pageIds);
  /*
   * EVERY page holding a selected object, not just the primary's.
   *
   * This used to resolve `selection` alone — the primary — so a shift-click
   * selection spanning two pages force-rendered one of them and left the other
   * to virtualisation. On the unrendered page the outlines, handles and delete
   * buttons simply did not exist, while Delete, Ctrl+D and the arrow keys went
   * on acting for all of it: objects the user could not see being changed by
   * commands aimed at the ones they could.
   */
  const pageOfObject = (id: string): string | null =>
    pageContainingSection(layout, id)?.id ??
    pageContainingSection(layout, sectionContaining(layout, id)?.id ?? '')?.id ??
    null;

  const forcedPageIds = new Set<string>();
  if (selection?.type === 'page') forcedPageIds.add(selection.id);
  else if (selection) {
    const own = pageOfObject(selection.id);
    if (own) forcedPageIds.add(own);
  }
  for (const id of selectedIds ?? []) {
    const page = pageOfObject(id);
    if (page) forcedPageIds.add(page);
  }

  const editingPageId = editing
    ? editing.kind === 'section-title'
      ? pageContainingSection(layout, editing.id)?.id ?? null
      : pageContainingSection(layout, sectionContaining(layout, editing.id)?.id ?? '')?.id ?? null
    : null;

  return (
    <div
      className={styles.stack}
      style={{ padding: CANVAS_GUTTER }}
      onClick={(e) => {
        if (isInsideCaret(e, editing)) return;
        onSelect(null);
      }}
      /*
       * Two jobs, both keyed to "a gesture is starting somewhere on the sheet
       * stack".
       *
       * The gesture window is what makes a whole drag one undo entry — but it
       * must NOT open while a caret is live. The matching `pointerup` listener
       * below is on `window`, so it fires on the very click that focuses an
       * editor; with the window open, that release would close it and every
       * subsequent keystroke would become its own undo step. While editing,
       * the edit session owns the window instead (see `FormBuilder`).
       */
      onPointerDownCapture={() => {
        onGestureReset?.();
        if (!editing) onGestureStart?.();
      }}
    >
      {/*
        * THE FRAME RESERVES THE SPACE; THE SCALER DRAWS IN IT.
        *
        * A CSS transform does not affect layout, so the scaled stack used to
        * take up its UNSCALED size in the scroll container. `.canvasArea` can
        * only scroll over the layout it was given, and with the surplus
        * spilling equally to both sides of a centred origin, the left half of
        * it was unreachable — an LTR scroll container cannot scroll into
        * negative space. Measured at 300%: 403px of the page, its whole left
        * margin and the left third of every field on it, could not be brought
        * into view by any amount of scrolling.
        *
        * It takes two elements, because one cannot both be scaled and stand
        * for the space the scaling needs: giving the scaler itself the larger
        * size only scales that larger size again. So the frame is a plain box
        * of the drawn dimensions — that is what the scroll container measures
        * — and the scaler is taken out of the flow inside it, anchored at the
        * top left so the scale runs from the frame's own corner and lands
        * exactly on its far edge.
        */}
      <div
        className={styles.scalerFrame}
        style={{
          width: layout.page.width * viewport.zoom,
          height:
            (layout.pages.length * layout.page.height +
              (layout.pages.length - 1) * CANVAS_GUTTER) *
            viewport.zoom,
        }}
      >
      <div
        className={styles.scaler}
        style={{
          transform: `scale(${viewport.zoom})`,
          transformOrigin: 'top left',
          width: layout.page.width,
          height:
            layout.pages.length * layout.page.height +
            (layout.pages.length - 1) * CANVAS_GUTTER,
        }}
      >
        {layout.pages.map((page, index) => (
          <Sheet
            key={page.id}
            page={page}
            index={index}
            layout={layout}
            control={control}
            guides={page.id === guidePageId ? guides : EMPTY_GUIDES}
            selection={selection}
            selectedIds={selectedIds}
            editing={editing}
            targetSectionId={targetSectionId}
            onSelect={onSelect}
            onBeginEdit={onBeginEdit}
            onChangeElementContent={onChangeElementContent}
            onRenameField={onRenameField}
            onEditorReady={onEditorReady}
            onInsertComponent={onInsertComponent}
            onContextMenu={onContextMenu}
            onMoveSection={handleMoveSection}
            onResizeSection={onResizeSection}
            onRenameSection={onRenameSection}
            onDeleteSection={onDeleteSection}
            onMoveElement={handleMoveElement}
            onResizeElement={onResizeElement}
            onDeleteElement={onDeleteElement}
            onTypeAt={onTypeAt}
            getScale={viewport.getScale}
            shouldRender={
              isVisible(page.id) || forcedPageIds.has(page.id) || page.id === editingPageId
            }
            wrapRef={setPageRef(page.id)}
          />
        ))}
      </div>
      </div>
    </div>
  );
};

interface SheetProps
  extends Omit<FormCanvasProps, 'viewport' | 'onGestureStart' | 'onGestureEnd' | 'onGestureReset'> {
  page: DocumentPage;
  index: number;
  control: ReturnType<typeof useForm<{ data: object }>>['control'];
  targetSectionId: string | null;
  getScale: () => number;
  guides: Guide[];
  /** False while this page is far outside the viewport (spec §35) — the
   *  wrapper still renders at full size so scroll height and page numbering
   *  never shift, only the expensive content inside it is skipped. */
  shouldRender: boolean;
  wrapRef: (el: HTMLElement | null) => void;
}

const Sheet: React.FC<SheetProps> = ({
  page,
  index,
  layout,
  control,
  guides,
  selection,
  selectedIds,
  editing,
  targetSectionId,
  onSelect,
  onBeginEdit,
  onChangeElementContent,
  onRenameField,
  onEditorReady,
  onInsertComponent,
  onContextMenu,
  onMoveSection,
  onResizeSection,
  onRenameSection,
  onDeleteSection,
  onMoveElement,
  onResizeElement,
  onDeleteElement,
  onTypeAt,
  getScale,
  shouldRender,
  wrapRef,
}) => (
  <div
    ref={wrapRef}
    data-page-id={page.id}
    className={styles.sheetWrap}
    style={{ marginBottom: index < layout.pages.length - 1 ? CANVAS_GUTTER : 0 }}
  >
    <div
      className={styles.sheet}
      style={{ width: layout.page.width, height: layout.page.height }}
      onClick={(e) => {
        e.stopPropagation();
        // A click that belongs to the open caret is not a click on the page.
        if (isInsideCaret(e, editing)) return;

        /*
         * A CLICK THAT PUTS SOMETHING DOWN DOES NOT ALSO PICK UP A PEN.
         *
         * This handler stops propagation, so the stack's "click away to
         * deselect" never ran for a click on the sheet — and since the section
         * overlay is pointer-transparent, the empty half of a section reaches
         * here too. The result was that dismissing a selection, the most
         * ordinary gesture there is, CREATED CONTENT: an empty block, and a
         * section silently grown to fit it.
         *
         * A selected object is dismissed instead, and the next click writes.
         * A LIVE CARET is deliberately not treated this way: moving from one
         * empty spot to another mid-thought is one gesture, not two, and the
         * selection during an edit session points at the block being typed in
         * rather than at something the owner picked up.
         */
        if (!editing && selection) {
          onSelect(null);
          return;
        }

        /*
         * CLICK -> CARET -> TYPE.
         *
         * Reaching this handler already means the click hit nothing else: every
         * element overlay stops its own clicks, and the section overlay is
         * pointer-transparent except for its chrome. So the sheet is what is
         * left when the owner clicks genuinely empty page, and on a page that
         * is meant to read as a document the answer to that is a caret — not a
         * selection, and certainly not "first go and add a Text component".
         *
         * The point is converted out of screen space into PAGE space here,
         * where the document's coordinates live, so zoom never reaches the
         * model (spec §5/§25) and the text lands where it was asked for at any
         * magnification.
         */
        const rect = e.currentTarget.getBoundingClientRect();
        const scale = getScale() || 1;
        onTypeAt(page.id, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
      }}
      onContextMenu={(e) => {
        // The browser's own menu wins inside a caret (spell-check, plain-text
        // paste). It must not cost the user their selection on the way past.
        if (isInsideCaret(e, editing)) return;
        onSelect({ type: 'page', id: page.id });
        onContextMenu(e, { type: 'page', id: page.id });
      }}
    >
      {/* Margin guides: the usable area a section is constrained to (spec §5). */}
      <div
        className={styles.marginGuide}
        style={{
          left: layout.page.margin.left,
          top: layout.page.margin.top,
          right: layout.page.margin.right,
          bottom: layout.page.margin.bottom,
        }}
        aria-hidden="true"
      />

      {shouldRender && (
        <>
          <FormPageRenderer
            page={page}
            mode="edit"
            control={control}
            editingElementId={editing && editing.kind !== 'section-title' ? editing.id : undefined}
            onElementContentChange={onChangeElementContent}
            onEditorReady={onEditorReady}
            onInsertComponent={onInsertComponent}
          />
          {/* Guides are computed in this page's coordinate space, but only the
              page currently being dragged on ever has any — drawing them on
              every sheet is harmless since the array is empty elsewhere. */}
          <GuideOverlay guides={guides} />

          {page.sections.map((section) => (
            <React.Fragment key={section.id}>
              <CanvasSection
                section={section}
                isSelected={isChosen(selection, selectedIds, 'section', section.id)}
                isTarget={targetSectionId === section.id}
                isEditingTitle={editing?.kind === 'section-title' && editing.id === section.id}
                getScale={getScale}
                onSelect={(options) => onSelect({ type: 'section', id: section.id }, options)}
                onBeginEditTitle={() => onBeginEdit({ kind: 'section-title', id: section.id })}
                onContextMenu={(e) => onContextMenu(e, { type: 'section', id: section.id })}
                onMove={(x, y) => onMoveSection(section.id, x, y)}
                onResize={(box) => onResizeSection(section.id, box)}
                onRename={(title) => onRenameSection(section.id, title)}
                onDelete={() => onDeleteSection(section.id)}
              />
              {section.elements.map((element) => (
                <div key={element.id} style={{ position: 'absolute', left: section.x, top: section.y }}>
                  <CanvasElement
                    element={element}
                    isSelected={isChosen(selection, selectedIds, 'element', element.id)}
                    isEditing={editing?.kind !== 'section-title' && editing?.id === element.id}
                    getScale={getScale}
                    onSelect={(options) => onSelect({ type: 'element', id: element.id }, options)}
                    onBeginEdit={onBeginEdit}
                    onContextMenu={(e) => onContextMenu(e, { type: 'element', id: element.id })}
                    onRenameField={(label) => onRenameField(element.id, label)}
                    onMove={(x, y) => onMoveElement(element.id, x, y)}
                    onResize={(box) => onResizeElement(element.id, box)}
                    onDelete={() => onDeleteElement(element.id)}
                  />
                </div>
              ))}
            </React.Fragment>
          ))}
        </>
      )}
    </div>

    <div className={styles.pageNumber} aria-hidden="true">
      {index + 1}
    </div>
  </div>
);

/**
 * Whether this object is part of the current selection.
 *
 * `selectedIds` is the multi-selection; when it is absent the single
 * `selection` decides on its own, which is what keeps this component's
 * behaviour identical for any caller that never selects more than one thing.
 */
const isChosen = (
  selection: CanvasSelection,
  selectedIds: ReadonlySet<string> | undefined,
  kind: 'section' | 'element',
  id: string
): boolean =>
  selectedIds ? selection?.type === kind && selectedIds.has(id) : selection?.type === kind && selection.id === id;
