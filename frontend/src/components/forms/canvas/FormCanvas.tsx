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
import type { DocumentPage, FormDocument } from '../../../types/form';
import styles from './FormCanvas.module.css';

const EMPTY_GUIDES: Guide[] = [];

export type CanvasSelection =
  | { type: 'page'; id: string }
  | { type: 'section'; id: string }
  | { type: 'element'; id: string }
  | null;

export interface FormCanvasProps {
  layout: FormDocument;
  viewport: CanvasViewport;
  selection: CanvasSelection;
  onSelect: (selection: CanvasSelection) => void;
  onMoveSection: (sectionId: string, x: number, y: number) => void;
  onResizeSection: (sectionId: string, box: ResizedBox) => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onMoveElement: (elementId: string, x: number, y: number) => void;
  onResizeElement: (elementId: string, box: ResizedBox) => void;
  onDeleteElement: (elementId: string) => void;
  /** Brackets a drag/resize/click gesture so useHistory coalesces every
   *  intermediate commit into one undo entry (spec §21). */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
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
  onSelect,
  onMoveSection,
  onResizeSection,
  onRenameSection,
  onDeleteSection,
  onMoveElement,
  onResizeElement,
  onDeleteElement,
  onGestureStart,
  onGestureEnd,
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
      onGestureEnd?.();
    };
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
  }, [onGestureEnd]);

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
  // elsewhere scrolled it off-screen.
  const pageIds = layout.pages.map((p) => p.id);
  const { isVisible, setPageRef } = useVisiblePages(pageIds);
  const selectedPageId =
    selection?.type === 'page'
      ? selection.id
      : selection?.type === 'section'
        ? pageContainingSection(layout, selection.id)?.id ?? null
        : selection?.type === 'element'
          ? pageContainingSection(layout, sectionContaining(layout, selection.id)?.id ?? '')?.id ?? null
          : null;

  return (
    <div
      className={styles.stack}
      style={{ padding: CANVAS_GUTTER }}
      onClick={() => onSelect(null)}
      onPointerDownCapture={() => onGestureStart?.()}
    >
      <div
        className={styles.scaler}
        style={{
          transform: `scale(${viewport.zoom})`,
          transformOrigin: 'top center',
          // Reserve the SCALED footprint so the scroll container sizes
          // correctly — a CSS transform does not affect layout on its own.
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
            targetSectionId={targetSectionId}
            onSelect={onSelect}
            onMoveSection={handleMoveSection}
            onResizeSection={onResizeSection}
            onRenameSection={onRenameSection}
            onDeleteSection={onDeleteSection}
            onMoveElement={handleMoveElement}
            onResizeElement={onResizeElement}
            onDeleteElement={onDeleteElement}
            getScale={viewport.getScale}
            shouldRender={isVisible(page.id) || page.id === selectedPageId}
            wrapRef={setPageRef(page.id)}
          />
        ))}
      </div>
    </div>
  );
};

interface SheetProps extends Omit<FormCanvasProps, 'viewport' | 'onGestureStart' | 'onGestureEnd'> {
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
  targetSectionId,
  onSelect,
  onMoveSection,
  onResizeSection,
  onRenameSection,
  onDeleteSection,
  onMoveElement,
  onResizeElement,
  onDeleteElement,
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
        onSelect({ type: 'page', id: page.id });
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
          <FormPageRenderer page={page} mode="edit" control={control} />
          {/* Guides are computed in this page's coordinate space, but only the
              page currently being dragged on ever has any — drawing them on
              every sheet is harmless since the array is empty elsewhere. */}
          <GuideOverlay guides={guides} />

          {page.sections.map((section) => (
            <React.Fragment key={section.id}>
              <CanvasSection
                section={section}
                isSelected={selection?.type === 'section' && selection.id === section.id}
                isTarget={targetSectionId === section.id}
                getScale={getScale}
                onSelect={() => onSelect({ type: 'section', id: section.id })}
                onMove={(x, y) => onMoveSection(section.id, x, y)}
                onResize={(box) => onResizeSection(section.id, box)}
                onRename={(title) => onRenameSection(section.id, title)}
                onDelete={() => onDeleteSection(section.id)}
              />
              {section.elements.map((element) => (
                <div key={element.id} style={{ position: 'absolute', left: section.x, top: section.y }}>
                  <CanvasElement
                    element={element}
                    isSelected={selection?.type === 'element' && selection.id === element.id}
                    getScale={getScale}
                    onSelect={() => onSelect({ type: 'element', id: element.id })}
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
