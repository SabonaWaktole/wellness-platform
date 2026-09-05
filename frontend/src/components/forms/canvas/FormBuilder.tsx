import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Ribbon } from './ribbon/Ribbon';
import { RIBBON_TABS } from './ribbon/ribbonTypes';
import { TitleBar } from './ribbon/TitleBar';
import { StatusBar } from './ribbon/StatusBar';
import { HomeTab } from './ribbon/HomeTab';
import { InsertTab } from './ribbon/InsertTab';
import { LayoutTab } from './ribbon/LayoutTab';
import { ContextualTab } from './ribbon/ContextualTab';
import { ContextMenu } from '../../ui/ContextMenu';
import { buildCanvasMenu, type MenuTarget } from './canvasMenus';
import type { AnyRibbonTabId, ContextualTabId } from './ribbon/ribbonTypes';
import { FormCanvas, type CanvasSelection } from './FormCanvas';
import { PageRail } from './PageRail';
import { PropertiesPanel } from './PropertiesPanel';
import { FormRenderer, ScaledPage } from '../FormRenderer';
import { useCanvasViewport } from './useCanvasViewport';
import { useHistory } from './useHistory';
import { useClipboard } from './useClipboard';
import { useAutosave } from './useAutosave';
import { useSelection } from './useSelection';
import { useInlineEditing, type EditTarget } from './useInlineEditing';
import { resolveShortcut, isTextEntryTarget, isArrowNavigableControl } from './keyboard';
import { alignBoxes, distributeBoxes } from './snapping';
import {
  addSection,
  addElement,
  addPage,
  deletePage,
  duplicatePage,
  reorderPage,
  removeEmptyPages,
  insertPageAt,
  normaliseControls,
  pruneEmptyTextHosts,
  TEXT_HOST_PREFIX,
  isTextHostSection,
  moveSectionToPage,
  moveSection,
  resizeSection,
  renameSection,
  removeSection,
  moveElement,
  resizeElement,
  updateElement,
  updateSection,
  removeElement,
  pullUpOneLine,
  applyBoxes,
  stripSyntheticPages,
  emptyDocument,
  findElement,
  findSection,
  sectionContaining,
  pageContainingSection,
  newId,
  type ApplyResult,
} from './layoutOps';
import {
  useClientForm,
  useUpdateFormLayout,
  useUploadFormAsset,
  usePublishForm,
  useFormVersions,
  useFormVersion,
} from '../../../hooks/useClientForm';
import { COMPONENT_REGISTRY } from '../registry/componentRegistry';
import { nextFieldKey } from './fieldKeys';
import { normaliseRichText, plainTextOf, wrapText } from '../registry/content';
import {
  isDataBearing,
} from '../../../types/form';
import type {
  ComponentType,
  ElementContent,
  FormDocument,
  FormElement,
} from '../../../types/form';
import styles from './FormCanvas.module.css';

const NEW_SECTION_WIDTH = 420;
const NEW_SECTION_HEIGHT = 220;
/** A freshly typed block: wide enough for a line of prose, one line tall. */
const NEW_TEXT_WIDTH = 320;
const NEW_TEXT_HEIGHT = 40;

/**
 * The full-page document builder: a minimal toolbar, the A4 sheet stack as
 * the visually dominant element, a page rail on the left and a properties
 * sidebar on the right (spec §22).
 */
export const FormBuilder: React.FC = () => {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { tenantSlug, formId } = useParams();

  const { form, setForm, isLoading, error, fetchForm } = useClientForm(formId);
  const { updateLayout, isSaving, error: saveError, hasConflict } = useUpdateFormLayout();
  const { uploadAsset, isUploading, error: uploadError } = useUploadFormAsset();
  const { publishForm, isPublishing, error: publishError, clearError: clearPublishError } = usePublishForm();
  const { versions, isLoading: isLoadingVersions, fetchVersions } = useFormVersions(form?.id);
  const { version: viewedVersion, isLoading: isLoadingVersion, fetchVersion, clearVersion } = useFormVersion();

  // History owns the document. `emptyDocument()` here is a placeholder never
  // shown — the component returns null until `form` loads, at which point
  // `history.reset(form.layout)` replaces it and clears any stray history.
  const history = useHistory(emptyDocument());
  const layout = history.present;
  const clipboard = useClipboard();

  /*
   * SELECTION is the tested `useSelection` hook rather than a bare useState,
   * so shift-click extends, the properties panel follows the last-added
   * object, and align/distribute have a batch to work on. `CanvasSelection`
   * stays the shape the canvas speaks; the adapter below is the whole of the
   * translation.
   */
  const sel = useSelection();
  // Memoised, not rebuilt per render: the keyboard effect below depends on
  // both, and a fresh object each render would tear down and re-attach the
  // window listener on every keystroke.
  const selection: CanvasSelection = useMemo(
    () => (sel.primary ? { type: sel.primary.type, id: sel.primary.id } : null),
    [sel.primary]
  );
  const selectedIds = useMemo(() => new Set(sel.ids), [sel.ids]);
  const setSelection = useCallback(
    (next: CanvasSelection, options?: { additive?: boolean }) => {
      if (next) sel.select({ type: next.type, id: next.id }, options);
      else sel.clear();
    },
    [sel]
  );

  /** Which piece of text has the caret, if any (spec §7). */
  const inline = useInlineEditing();

  /**
   * Selection made FROM THE CANVAS, which closes any open caret on its way.
   *
   * Clicking the page beside the text is how a document editor is left — Word,
   * Docs, Pages all do it. Only Escape used to, so a click on the page moved
   * the selection while the caret stayed open behind it, and the ribbon showed
   * the formatting controls for an editor the user believed they had left.
   *
   * `handleBeginEdit` selects and THEN begins, so this never closes the
   * session it is opening.
   */
  const handleSelect = useCallback(
    (next: CanvasSelection, options?: { additive?: boolean }) => {
      if (inline.target && next?.id !== inline.target.id) inline.end();
      setSelection(next, options);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inline, setSelection]
  );
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  /** Rung 4 of the overflow ladder refuses operations; this is where the
   *  owner is told why, instead of the edit silently doing nothing. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AnyRibbonTabId>('home');
  const [showNavigationPane, setShowNavigationPane] = useState(true);
  const [showFormatPane, setShowFormatPane] = useState(true);
  /** Where the right-click menu is open, if it is. */
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);

  /*
   * ONE UNDO ENTRY PER TYPING SESSION.
   *
   * `useHistory` coalesces every commit made between `beginInteraction` and
   * `endInteraction` into a single entry — the same mechanism a drag uses. An
   * effect keyed to the edit target is what guarantees the two calls stay
   * paired: React runs the cleanup when the target changes or the editor
   * unmounts, so there is no path that opens a window without closing it.
   */
  useEffect(() => {
    if (!inline.target) return;
    history.beginInteraction();
    return () => history.endInteraction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline.target?.kind, inline.target?.id]);

  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const viewport = useCanvasViewport(layout.page);

  /*
   * A throwaway form instance so the PREVIEW's controls are real ones. Nothing
   * here is ever submitted — see the read view below for why it is bound at
   * all. `FormCanvas` keeps its own for the same reason on the edit canvas.
   */
  const { control: previewControl } = useForm({ defaultValues: { data: {} } });

  /**
   * The `<form id>@<version>` this session last produced BY SAVING.
   *
   * A save answers with the stored form, version bumped — which is the same
   * shape as a fresh load, and the reset effect below could not tell the two
   * apart. So every autosave was read as "the document was replaced from the
   * server" and threw away the local state: the caret closed mid-word about a
   * second after the owner started typing a section title, the selection
   * cleared under them, and `history.reset` wiped the undo stack, so Undo went
   * dead after every single save. On a builder that autosaves continuously,
   * that made undo unusable and typing hostile.
   *
   * Keyed by id as well as number so that opening a DIFFERENT form which
   * happens to be at the same version number is still a real load.
   */
  const selfSavedVersion = useRef<string | null>(null);

  useEffect(() => {
    fetchForm();
  }, [fetchForm]);

  // A fresh load (or a reload after a conflict) replaces local state wholesale.
  useEffect(() => {
    if (!form) return;
    // Our own save coming back is an acknowledgement, not new content: the
    // document on screen already IS this version. Resetting to it would only
    // destroy the caret, the selection and the undo history (see the ref).
    if (selfSavedVersion.current === `${form.id}@${form.version}`) return;
    // Repaired on the way in, not on the way out: a document seeded outside
    // the builder can carry a control its data type cannot be shown in, and
    // every save of it would fail (see `normaliseControls`).
    history.reset(pruneEmptyTextHosts(normaliseControls(form.layout)));
    setIsDirty(false);
    setSelection(null);
    inline.end();
    setRefusal(null);
    setActivePageId(form.layout.pages?.[0]?.id ?? null);
    // Deliberately keyed to the identity of the loaded form only: this is a
    // "throw away local state and start again" effect, not a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.id, form?.version]);

  /**
   * Every mutation funnels through here, so a refusal from the overflow
   * ladder is surfaced in exactly one place and a refused edit never marks
   * the document dirty. `commit`, not a plain setState — undo/redo see every
   * edit made this way.
   */
  const apply = useCallback(
    (result: ApplyResult) => {
      if (result.refusal) {
        setRefusal(result.refusal);
        return;
      }
      setRefusal(null);
      history.commit(result.document);
      // An undo, a delete or an overflow relocation can remove an object that
      // is still selected. Dropping dead ids here — rather than letting the
      // panel read a ghost — is what keeps the selection honest after every
      // mutation, including the ones the owner did not initiate.
      sel.retain(aliveIds(result.document));
      setIsDirty(true);
      autosaveRef.current?.schedule();
    },
    [history, sel] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const doSave = useCallback(async () => {
    if (!form) return;
    const toSave = stripSyntheticPages(history.present);
    const updated = await updateLayout(form.id, toSave, form.version);
    if (updated) {
      selfSavedVersion.current = `${updated.id}@${updated.version}`;
      setForm(updated);
      setIsDirty(false);
    }
    // A version conflict resolves to `null` rather than throwing (see
    // useUpdateFormLayout) — autosave has nothing further to retry until the
    // owner reloads, so this is treated as success from ITS perspective; the
    // conflict banner is what actually tells the owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, history.present, updateLayout, setForm]);

  const autosave = useAutosave({ save: doSave, enabled: true });
  // A ref so `apply` (defined above `autosave`) can reach the latest
  // `schedule` without widening its own dependency list every render.
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  /*
   * Undo and redo close any open editor first: the document it was showing is
   * about to be replaced, and a caret left inside stale content is the kind of
   * state that produces a lost keystroke.
   */
  const handleUndo = useCallback(() => {
    inline.end();
    history.undo();
    setIsDirty(true);
    autosaveRef.current?.schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, inline]);

  const handleRedo = useCallback(() => {
    inline.end();
    history.redo();
    setIsDirty(true);
    autosaveRef.current?.schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, inline]);

  const handleSave = useCallback(() => {
    void autosave.retry();
  }, [autosave]);

  /**
   * Saves any pending edit first, exactly like the Save button — publishing
   * a version that is not what the owner is currently looking at would make
   * the "Preview" and the published snapshot lie to each other.
   */
  const handlePublish = useCallback(async () => {
    if (!form) return;
    clearPublishError();

    // Publishing a version that is not what the owner is currently looking
    // at would make the builder's Preview and the published snapshot lie to
    // each other, so a pending edit is saved first. Read the version straight
    // off THIS call's own response rather than the closed-over `form` —
    // `setForm` inside `doSave` will not have re-rendered this callback by
    // the time execution reaches the publish call a line later.
    let expectedVersion = form.version;
    if (isDirty) {
      const toSave = stripSyntheticPages(history.present);
      const saved = await updateLayout(form.id, toSave, form.version).catch(() => null);
      if (!saved) return; // save failed/conflicted — its own banner already explains why
      selfSavedVersion.current = `${saved.id}@${saved.version}`;
      setForm(saved);
      setIsDirty(false);
      expectedVersion = saved.version;
    }

    const result = await publishForm(form.id, expectedVersion).catch(() => null);
    if (result) {
      await fetchForm();
      if (showHistory) await fetchVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, isDirty, history.present, updateLayout, setForm, publishForm, fetchForm, showHistory, fetchVersions, clearPublishError]);

  // History and Preview are mutually exclusive read-only views over the same
  // canvas area — opening one closes the other, so "Hide preview" can never
  // be left showing while the toolbar is actually in history mode (and vice
  // versa), which would otherwise land the owner in the wrong view the next
  // time they closed whichever panel they thought was open.
  const handleToggleHistory = useCallback(() => {
    setShowHistory((v) => {
      const next = !v;
      if (next) {
        setShowPreview(false);
        void fetchVersions();
      } else {
        clearVersion();
      }
      return next;
    });
  }, [fetchVersions, clearVersion]);

  const handleTogglePreview = useCallback(() => {
    setShowPreview((v) => !v);
    setShowHistory(false);
    clearVersion();
  }, [clearVersion]);

  const handleViewVersion = useCallback(
    (versionNumber: number) => {
      if (!form) return;
      void fetchVersion(form.id, versionNumber);
    },
    [form, fetchVersion]
  );

  const selectedSectionId =
    selection?.type === 'section'
      ? selection.id
      : selection?.type === 'element'
        ? sectionContaining(layout, selection.id)?.id ?? null
        : null;

  const targetPageId =
    selection?.type === 'page'
      ? selection.id
      : selectedSectionId
        ? pageContainingSection(layout, selectedSectionId)?.id ?? activePageId
        : activePageId;

  const selectedElement = selection?.type === 'element' ? findElement(layout, selection.id) : undefined;
  const selectedSection = selectedSectionId ? findSection(layout, selectedSectionId)?.section : undefined;

  /*
   * WHICH CONTEXTUAL TAB THE SELECTION RAISES. Word names the tab after the
   * kind of object, not after the panel — "Picture Format", not "Settings" —
   * because that is the word the user already has in their head for the thing
   * they just clicked.
   */
  const contextualTab: ContextualTabId | undefined = selectedElement
    ? selectedElement.type === 'IMAGE'
      ? 'picture'
      : selectedElement.type === 'TEXT'
        ? 'textBox'
        : selectedElement.type === 'DIVIDER'
          ? 'shape'
          : 'field'
    : selectedSection && selection?.type === 'section'
      ? 'section'
      : undefined;

  /*
   * Follow the selection: raising a tab the user then has to click would be
   * worse than not raising it at all. And when the object goes away, fall back
   * to Home rather than leaving a tab selected that no longer exists.
   */
  useEffect(() => {
    // Typing beats selecting: once a caret is open, Home is the tab that
    // matters, because Font and Paragraph are what the owner reaches for next.
    // Word does exactly this — the contextual tab stays available, it just
    // stops being the one in front.
    if (inline.target) setActiveTab('home');
    else if (contextualTab) setActiveTab(contextualTab);
    else setActiveTab((current) => (RIBBON_TABS.includes(current as never) ? current : 'home'));
  }, [contextualTab, inline.target]);

  const activePageIndex = Math.max(
    0,
    layout.pages.findIndex((p) => p.id === targetPageId)
  );

  /**
   * Word's Ctrl+A over the body of the document — every element on the page
   * being worked on. Shared by the shortcut and the ribbon's Select all, so
   * the two can never mean different things.
   */
  const selectAllOnPage = useCallback(() => {
    const page = layout.pages.find((p) => p.id === targetPageId) ?? layout.pages[0];
    const ids = page.sections.flatMap((section) => section.elements.map((el) => el.id));
    if (ids.length > 0) sel.selectMany('element', ids);
  }, [layout, targetPageId, sel]);

  /*
   * RIGHT-CLICK SELECTS FIRST — unless the target is already part of a
   * multi-selection, in which case the selection is preserved so "delete
   * these five" works from a right-click on any one of them. Both are desktop
   * conventions users rely on without noticing.
   */
  const handleContextMenu = useCallback(
    (event: React.MouseEvent, target: { type: MenuTarget; id: string }) => {
      /*
       * While a caret is open the BROWSER's menu wins — spell-check, and paste
       * of plain text, belong to the text rather than to the object around it.
       * The check has to live here rather than on the element, because the
       * event bubbles up to the sheet, which would otherwise answer with the
       * page menu instead.
       */
      if (inline.target) return;
      event.preventDefault();
      event.stopPropagation();
      if (!sel.isSelected(target.id)) {
        setSelection(target.type === 'page' ? { type: 'page', id: target.id } : { type: target.type, id: target.id });
      }
      setMenu({ x: event.clientX, y: event.clientY, target: target.type });
    },
    [sel, setSelection, inline.target]
  );

  /**
   * Align/distribute the current multi-selection.
   *
   * The transform is passed in rather than a mode, so this knows only how to
   * gather the boxes and write the result back through the ladder — the
   * geometry itself stays in `snapping.ts` where it is already tested. Wrapped
   * in one interaction so a six-element alignment is a single undo.
   */
  const handleArrange = useCallback(
    (transform: (boxes: { id: string; x: number; y: number; width: number; height: number }[]) => {
      id: string;
      x: number;
      y: number;
    }[]) => {
      if (!sel.kind || sel.kind === 'page') return;
      const boxes = sel.ids
        .map((id) =>
          sel.kind === 'element' ? findElement(layout, id) : findSection(layout, id)?.section
        )
        .filter((b): b is NonNullable<typeof b> => !!b)
        .map((b) => ({ id: b.id, x: b.x, y: b.y, width: b.width, height: b.height }));
      if (boxes.length === 0) return;

      history.beginInteraction();
      apply(applyBoxes(layout, sel.kind, transform(boxes)));
      history.endInteraction();
    },
    [layout, sel, apply, history]
  );

  /*
   * THE DOCUMENT COMMANDS, DEFINED ONCE.
   *
   * Cut, Copy, Paste, Duplicate and Delete each have three entry points — the
   * Home tab, the right-click menu and a keystroke — and each of the three
   * used to carry its own copy of the rules. They drifted, in every direction
   * a copy can: the ribbon greyed out Copy for a section that Ctrl+C had
   * handled for months; its Paste forgot to say which page it was pasting
   * onto and always landed on page one; the menu's Delete removed the first of
   * five selected objects while the ribbon beside it said five were selected.
   *
   * One definition per verb is the fix, and the only one that stays fixed:
   * there is no longer a second place for the rule to be written differently.
   */
  const canCut = (sel.kind === 'element' || sel.kind === 'section') && sel.ids.length > 0;

  /**
   * Elements need a section to land in; sections need a page, which the
   * document always has. Asking `hasContent` alone made Paste lie in both
   * directions (see `Clipboard.kind`).
   */
  const canPaste =
    clipboard.kind === 'sections'
      ? layout.pages.length > 0
      : clipboard.kind === 'elements' && !!selectedSectionId;

  const doCopy = useCallback(() => {
    if (sel.kind === 'section') clipboard.copySections(layout, sel.ids);
    else if (sel.kind === 'element') clipboard.copy(layout, sel.ids);
  }, [sel, clipboard, layout]);

  const doCut = useCallback(() => {
    if (sel.kind === 'section') apply(clipboard.cutSections(layout, sel.ids));
    else if (sel.kind === 'element') apply(clipboard.cut(layout, sel.ids));
    else return;
    setSelection(null);
  }, [sel, clipboard, layout, apply, setSelection]);

  const doPaste = useCallback(() => {
    if (clipboard.kind === 'none') return;
    apply(clipboard.paste(layout, selectedSectionId, targetPageId));
  }, [clipboard, layout, selectedSectionId, targetPageId, apply]);

  const doDuplicate = useCallback(() => {
    if (sel.kind === 'element') apply(clipboard.duplicate(layout, sel.ids));
    else if (sel.kind === 'section') apply(clipboard.duplicateSections(layout, sel.ids));
    else if (selection?.type === 'page') apply(duplicatePage(layout, selection.id));
  }, [sel, selection, clipboard, layout, apply]);

  /**
   * Removes EVERY selected object, not the primary one.
   *
   * Both other callers promised this and neither delivered it: right-click
   * deliberately preserves a multi-selection so "delete these five" works from
   * any one of them, and then deleted `ids[0]`. A refusal from the overflow
   * ladder aborts the whole batch rather than leaving it half done.
   */
  const doDelete = useCallback(() => {
    if (!sel.kind || sel.kind === 'page' || sel.ids.length === 0) return;
    let next = layout;
    for (const id of sel.ids) {
      const step = sel.kind === 'element' ? removeElement(next, id) : removeSection(next, id);
      if (step.refusal) {
        setRefusal(step.refusal);
        return;
      }
      next = step.document;
    }
    apply({ document: next, refusal: null });
    setSelection(null);
  }, [sel, layout, apply, setSelection]);


  /*
   * WRITING ON THE PAGE, WITHOUT FIRST BUILDING SOMEWHERE TO WRITE.
   *
   * A document editor's contract is click -> caret -> type, and the owner
   * should never have to reach for "Add -> Text" to put a sentence on a page.
   * The document model still stores that sentence as a TEXT element inside a
   * section, because that is what makes it render, print and lay out like
   * everything else — but that is an implementation detail and it stays behind
   * the interaction (spec §3).
   *
   * TWO THINGS KEEP THIS FROM BECOMING LITTER. The element is created QUIETLY:
   * `history.commit` without marking the document dirty, so the stray clicks
   * everyone makes to dismiss a selection do not schedule a save of a document
   * that has not changed. And when the caret leaves a block that was never
   * typed into, the block goes with it — see the effect below.
   */
  const autoCreated = useRef<string | null>(null);
  // Read by that effect's cleanup, which must see the CURRENT document rather
  // than the one captured when the caret was opened.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const handleTypeAt = useCallback(
    (pageId: string, x: number, y: number) => {
      const page = layoutRef.current.pages.find((p) => p.id === pageId);
      if (!page) return;

      /*
       * A click inside an existing section writes into that section, so the
       * text belongs to the thing it looks like it is inside — and moves,
       * paginates and reflows with it. Only a click on bare page needs a host,
       * and that host is deliberately invisible: no title, no fill, no line,
       * so what the owner sees is text on a page rather than a box they never
       * asked for.
       */
      const host = page.sections.find(
        (section) =>
          x >= section.x && x <= section.x + section.width && y >= section.y && y <= section.y + section.height
      );

      let document = layoutRef.current;
      let sectionId = host?.id;
      let localX = x - (host?.x ?? 0);
      let localY = y - (host?.y ?? 0);

      if (!host) {
        const before = new Set(document.pages.flatMap((p) => p.sections).map((sec) => sec.id));
        const created = addSection(
          document,
          pageId,
          '',
          {
            x: Math.max(layout.page.margin.left, Math.min(x, layout.page.width - layout.page.margin.right - NEW_TEXT_WIDTH)),
            y,
            width: NEW_TEXT_WIDTH,
            height: NEW_TEXT_HEIGHT,
          },
          // Marked as a text host so the canvas leaves off its chrome — the
          // owner asked for a caret, not a section.
          `${TEXT_HOST_PREFIX}${newId()}`
        );
        if (created.refusal) {
          setRefusal(created.refusal);
          return;
        }
        document = created.document;
        const added = document.pages
          .flatMap((p) => p.sections)
          .find((sec) => !before.has(sec.id));
        if (!added) return;
        sectionId = added.id;
        localX = 0;
        localY = 0;
        // Invisibility comes from WHAT the section is, not from colours put on
        // it: the renderer draws no box for a text host, and the canvas draws
        // no chrome. Painting it "transparent" instead would both lie in the
        // model and be refused — section colours must be six-digit hex.
      }

      if (!sectionId) return;

      const element: FormElement = {
        id: newId(),
        type: 'TEXT',
        x: Math.max(0, Math.round(localX)),
        y: Math.max(0, Math.round(localY)),
        width: NEW_TEXT_WIDTH,
        height: NEW_TEXT_HEIGHT,
        content: wrapText(''),
      };

      const placed = addElement(document, sectionId, element);
      if (placed.refusal) {
        setRefusal(placed.refusal);
        return;
      }

      // Quiet: no dirty flag, no autosave — nothing has been written yet.
      history.commit(placed.document);
      autoCreated.current = element.id;
      setSelection({ type: 'element', id: element.id });
      inline.begin({ kind: 'element-text', id: element.id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout.page, history, setSelection, inline]
  );

  /*
   * A block the owner clicked into but never wrote in is not content, and
   * leaving it behind would turn every stray click into an empty box the
   * document has to carry. Removed on the way out, as quietly as it arrived.
   */
  useEffect(() => {
    const id = inline.target?.kind === 'element-text' ? inline.target.id : null;
    if (!id || autoCreated.current !== id) return;
    return () => {
      const element = findElement(layoutRef.current, id);
      if (!element || plainTextOf(element.content as never) !== '') {
        autoCreated.current = null;
        return;
      }
      const host = sectionContaining(layoutRef.current, id);
      const pruned = removeElement(layoutRef.current, id);
      if (!pruned.refusal) {
        /*
         * The host was created FOR this block. With the block gone it holds
         * nothing, renders nothing and can never be selected — an invisible
         * empty section the document would carry for ever. It goes too.
         */
        const emptied =
          host &&
          isTextHostSection(host) &&
          !pruned.document.pages
            .flatMap((page) => page.sections)
            .find((section) => section.id === host.id)?.elements.length;
        const next = emptied ? removeSection(pruned.document, host.id) : pruned;
        history.commit(next.refusal ? pruned.document : next.document);
      }
      autoCreated.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline.target?.kind, inline.target?.id]);

  const handleAddSection = () => {
    const pageId = targetPageId ?? layout.pages[0].id;
    const page = layout.pages.find((p) => p.id === pageId);
    const y = (page?.sections ?? []).reduce(
      (max, s) => Math.max(max, s.y + s.height + 24),
      layout.page.margin.top
    );
    const result = addSection(layout, pageId, t('formBuilder.newSectionTitle'), {
      x: layout.page.margin.left,
      y,
      width: NEW_SECTION_WIDTH,
      height: NEW_SECTION_HEIGHT,
    });
    apply(result);
    if (result.refusal) return;

    // Word drops the caret into a text box the moment you insert one, so the
    // placeholder title is typed over rather than hunted down and cleared.
    const inserted = result.document.pages
      .find((p) => p.id === pageId)
      ?.sections.find((section) => !layout.pages.some((p) => p.sections.some((s2) => s2.id === section.id)));
    if (inserted) {
      setSelection({ type: 'section', id: inserted.id });
      inline.begin({ kind: 'section-title', id: inserted.id });
    }
  };

  /** Commits a keystroke made inside a TEXT block's on-page editor. */
  const handleChangeElementContent = useCallback(
    (elementId: string, content: ElementContent) => {
      // Normalised on the way in: an attribute the editor left as `''` would
      // be refused by the stored schema and take the whole save down with it
      // (see `normaliseRichText`).
      apply(updateElement(layout, elementId, { content: normaliseRichText(content) }));
      growToFitText(elementId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, apply]
  );

  /**
   * A block grows to hold what has been typed into it.
   *
   * A text block is stored with a height, and that height is what the renderer,
   * print and the page-overflow ladder all lay out against. Typing a second
   * paragraph into a one-line block therefore spilled the words outside the box
   * that was supposed to contain them: the canvas showed text the document did
   * not think was there, and what the owner saw stopped matching what the
   * client would get. Word grows a text frame for the same reason.
   *
   * Measured synchronously: the change being committed CAME from the editor,
   * so its DOM already holds the new text — there is nothing to wait for, and
   * waiting on a frame would mean the box quietly failed to grow whenever the
   * tab was not the one in front.
   *
   * Grows only, never shrinks, so a box the owner deliberately made large is
   * never yanked back to its content.
   */
  const growToFitText = useCallback(
    (elementId: string) => {
      const host = window.document.querySelector(`[data-element-id="${elementId}"]`);
      if (!(host instanceof HTMLElement)) return;
      const element = findElement(layoutRef.current, elementId);
      if (!element) return;

      /*
       * The wrapper carries the stored height; the editor node inside it is
       * what knows how tall the words actually are. Both are consulted so the
       * measurement holds whichever one the browser reports the overflow on.
       */
      const editor = host.querySelector('.ProseMirror');
      const needed = Math.ceil(
        Math.max(host.scrollHeight, editor instanceof HTMLElement ? editor.scrollHeight : 0)
      );
      if (needed <= element.height + 1) return;

      apply(
        resizeElement(layoutRef.current, elementId, {
          x: element.x,
          y: element.y,
          width: element.width,
          height: needed,
        })
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply]
  );

  /** Commits a keystroke made inside a field's on-page label editor. */
  const handleRenameField = useCallback(
    (elementId: string, label: string) => {
      const element = findElement(layout, elementId);
      if (!element?.field) return;
      // The label is presentation; `field.key` is the data identity and must
      // not move because a heading was reworded (§11).
      apply(updateElement(layout, elementId, { field: { ...element.field, label } }));
    },
    [layout, apply]
  );

  const handleBeginEdit = useCallback(
    (target: EditTarget) => {
      setSelection({ type: target.kind === 'section-title' ? 'section' : 'element', id: target.id });
      inline.begin(target);
    },
    [setSelection, inline]
  );

  const handleAddComponent = (type: ComponentType) => {
    if (!selectedSectionId) return;
    const definition = COMPONENT_REGISTRY[type];
    if (!definition) return;

    const defaults = definition.defaultField?.();
    const element: FormElement = {
      id: newId(),
      type,
      ...nextElementPosition(layout, selectedSectionId, definition.defaultSize.width),
      width: definition.defaultSize.width,
      height: definition.defaultSize.height,
      content: definition.defaultContent?.(),
      field: defaults ? { ...defaults, key: nextFieldKey(layout, defaults.label) } : undefined,
    };

    apply(addElement(layout, selectedSectionId, element));
    setSelection({ type: 'element', id: element.id });
  };

  const handleAddImage = async (file: File) => {
    if (!selectedSectionId || !form) return;
    try {
      const asset = await uploadAsset(form.id, file);
      const ratio = asset.height > 0 ? asset.width / asset.height : 1;
      const width = COMPONENT_REGISTRY.IMAGE.defaultSize.width;
      apply(
        addElement(layout, selectedSectionId, {
          id: newId(),
          type: 'IMAGE',
          content: { url: asset.url },
          ...nextElementPosition(layout, selectedSectionId, width),
          width,
          height: Math.round(width / ratio),
        })
      );
    } catch {
      // surfaced through uploadError
    }
  };

  // ---------------------------------------------------------------------
  // Keyboard shortcuts (spec §21). Text entry always wins — see keyboard.ts.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const shortcut = resolveShortcut(event);
      if (!shortcut) return;

      /*
       * WHOSE KEYSTROKE IS THIS — the caret's, or the document's?
       *
       * Text entry wins by default (`isTextEntryTarget`): typing `d` in a
       * label must not duplicate the field, and Backspace must delete a
       * character rather than the element. Two shortcuts are exceptions,
       * because inside a caret they would otherwise reach nothing at all:
       *
       *   Escape — the only way back out of text editing.
       *   Undo/redo from a CONTENTEDITABLE — TipTap's own history is switched
       *     off (`richTextExtensions.ts`, `undoRedo: false`) precisely because
       *     the canvas owns undo, so Ctrl+Z on the page was a dead key. A
       *     plain <input> is deliberately NOT included: there the browser's
       *     native undo is the right behaviour, and hijacking it would undo
       *     the document while the owner was fixing a typo.
       */
      if (isTextEntryTarget(event.target)) {
        const inContentEditable =
          event.target instanceof Element &&
          event.target.closest('[contenteditable="true"], [contenteditable=""]') !== null;

        /*
         * BACKSPACE IN AN EMPTY BLOCK IS A DOCUMENT EDIT, NOT A TEXT ONE.
         *
         * There is no character left to delete, so the keystroke would do
         * nothing at all — but what the person meant is the thing every editor
         * does here: take this empty line away and let what is under it come
         * up. Only when the block is genuinely empty, so a Backspace that has
         * text to eat still belongs entirely to the text.
         */
        const backspaceInEmptyBlock =
          inContentEditable &&
          event.key === 'Backspace' &&
          inline.target?.kind === 'element-text' &&
          inline.editor?.isEmpty === true;

        if (backspaceInEmptyBlock && inline.target) {
          event.preventDefault();
          const id = inline.target.id;
          /*
           * One line per press. The caret stays in the empty line so the next
           * press moves the next line up — the picture walks up under the
           * owner's control instead of snapping flush in one keystroke. The
           * line only goes when there is no space left below it to take, and
           * that is the press that ends the sequence.
           */
          const step = findElement(layout, id)?.height ?? NEW_TEXT_HEIGHT;
          const next = pullUpOneLine(layout, id, step);
          if (!findElement(next.document, id)) {
            inline.end();
            setSelection(null);
          }
          apply(next);
          return;
        }

        const allowed =
          shortcut.action === 'escape' ||
          (inContentEditable && (shortcut.action === 'undo' || shortcut.action === 'redo'));
        if (!allowed) return;
      }

      switch (shortcut.action) {
        case 'undo':
          event.preventDefault();
          inline.end();
          history.undo();
          setIsDirty(true);
          autosaveRef.current.schedule();
          break;
        case 'redo':
          event.preventDefault();
          inline.end();
          history.redo();
          setIsDirty(true);
          autosaveRef.current.schedule();
          break;
        /*
         * One level back, not all the way out — Word's behaviour. From a
         * caret, Escape returns to the object being typed into (the selection
         * is already pointing at it); from an object, it clears the selection.
         */
        case 'escape':
          if (inline.target) inline.end();
          else setSelection(null);
          break;
        // Every selected object, not just the primary — a Delete that removed
        // one of five highlighted fields would be indefensible.
        case 'delete':
          doDelete();
          break;
        case 'nudge': {
          // The arrow keys belong to whichever control has focus when that
          // control navigates with them — the ribbon's tab strip, a menu.
          if (isArrowNavigableControl(event.target)) break;
          if (selection?.type === 'element') {
            const el = findElement(layout, selection.id);
            if (el) apply(moveElement(layout, selection.id, el.x + shortcut.dx, el.y + shortcut.dy));
          } else if (selection?.type === 'section') {
            const found = findSection(layout, selection.id);
            if (found) apply(moveSection(layout, selection.id, found.section.x + shortcut.dx, found.section.y + shortcut.dy));
          }
          break;
        }
        // The clipboard verbs work on whichever KIND is selected, and are the
        // same three functions the ribbon and the right-click menu call.
        case 'copy':
          doCopy();
          break;
        case 'cut':
          doCut();
          break;
        case 'paste':
          doPaste();
          break;
        case 'save':
          // Otherwise this reaches the browser's "save this web page", which
          // for an editor that autosaves is worse than useless — it is
          // actively misleading about where the work has gone.
          event.preventDefault();
          handleSave();
          break;
        case 'print':
          event.preventDefault();
          window.open(`/${tenantSlug}/settings/client-management/forms/${formId}/print`, '_blank');
          break;
        /*
         * Word's Ctrl+A selects the body of the document. The nearest true
         * analogue here is every element on the page being worked on — not
         * every element in a fifty-page form, which no operation could
         * usefully act on at once.
         */
        case 'selectAll':
          event.preventDefault();
          selectAllOnPage();
          break;
        case 'duplicate':
          event.preventDefault();
          doDuplicate();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    layout,
    selection,
    sel,
    setSelection,
    inline,
    tenantSlug,
    formId,
    handleSave,
    selectAllOnPage,
    apply,
    history,
    doCopy,
    doCut,
    doPaste,
    doDuplicate,
    doDelete,
  ]);

  if (isLoading && !form) return <p>{t('formBuilder.loading')}</p>;
  if (error && !form) return <p role="alert">{error}</p>;
  if (!form) return null;

  return (
    <div className={styles.shell}>
      <TitleBar
        formName={form.name}
        status={form.status}
        hasUnpublishedChanges={form.hasUnpublishedChanges}
        onBack={() => navigate(`/${tenantSlug}/settings/client-management`)}
        onCopyLink={
          form.status === 'PUBLISHED' && form.shareToken
            ? () => void navigator.clipboard.writeText(`${window.location.origin}/f/${form.shareToken}`)
            : undefined
        }
        onPrint={() =>
          window.open(`/${tenantSlug}/settings/client-management/forms/${formId}/print`, '_blank')
        }
        onToggleReadView={handleTogglePreview}
        isReadView={showPreview}
        onToggleHistory={handleToggleHistory}
        isHistory={showHistory}
        onSave={handleSave}
        isSaving={isSaving}
        isDirty={isDirty}
        onPublish={() => void handlePublish()}
        isPublishing={isPublishing}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <Ribbon activeTab={activeTab} onChangeTab={setActiveTab} contextualTab={contextualTab}>
        {activeTab === 'home' && (
          <HomeTab
            canCut={canCut}
            canPaste={canPaste}
            onCut={doCut}
            onCopy={doCopy}
            onPaste={doPaste}
            onDuplicate={doDuplicate}
            onSelectAll={selectAllOnPage}
            editor={inline.editor}
          />
        )}

        {activeTab === 'insert' && (
          <InsertTab
            onAddPage={() => apply(addPage(layout))}
            onAddSection={handleAddSection}
            targetSectionId={selectedSectionId}
            onAddComponent={handleAddComponent}
            onAddImage={handleAddImage}
            imageError={uploadError}
            isUploadingImage={isUploading}
          />
        )}

        {contextualTab && activeTab === contextualTab && (
          <ContextualTab
            kind={contextualTab}
            element={selectedElement}
            section={selectedSection}
            onDelete={doDelete}
            onDuplicate={doDuplicate}
            onEditText={
              selectedElement
                ? () => handleBeginEdit(
                    selectedElement.type === 'TEXT'
                      ? { kind: 'element-text', id: selectedElement.id }
                      : { kind: 'field-label', id: selectedElement.id }
                  )
                : undefined
            }
            onOpenFormatPane={() => setShowFormatPane(true)}
            selectionCount={sel.ids.length}
            onAlign={(mode) => handleArrange((boxes) => alignBoxes(boxes, mode))}
            onDistribute={(axis) => handleArrange((boxes) => distributeBoxes(boxes, axis))}
          />
        )}

        {activeTab === 'layout' && (
          <LayoutTab
            canDeletePage={layout.pages.length > 1}
            canMovePageUp={activePageIndex > 0}
            canMovePageDown={activePageIndex < layout.pages.length - 1}
            hasEmptyPages={layout.pages.some((p) => p.sections.length === 0)}
            onDuplicatePage={() => targetPageId && apply(duplicatePage(layout, targetPageId))}
            onDeletePage={() => targetPageId && apply(deletePage(layout, targetPageId))}
            onMovePageUp={() =>
              targetPageId && apply(reorderPage(layout, targetPageId, activePageIndex - 1))
            }
            onMovePageDown={() =>
              targetPageId && apply(reorderPage(layout, targetPageId, activePageIndex + 1))
            }
            onRemoveEmptyPages={() => apply(removeEmptyPages(layout))}
            isNavigationPaneOpen={showNavigationPane}
            onToggleNavigationPane={() => setShowNavigationPane((v) => !v)}
          />
        )}
      </Ribbon>


      {publishError && (
        <p className={styles.errorBanner}>
          {publishError}{' '}
          <button type="button" onClick={clearPublishError}>
            {t('formBuilder.dismiss')}
          </button>
        </p>
      )}

      {form.unplacedFieldIds.length > 0 && (
        <p className={styles.banner}>
          {t('formBuilder.unplacedBanner', { count: form.unplacedFieldIds.length })}
        </p>
      )}
      {refusal && (
        <p className={styles.errorBanner} role="alert">
          {refusal}
        </p>
      )}
      {hasConflict && (
        <p className={styles.errorBanner}>
          {t('formBuilder.conflict')}{' '}
          <button type="button" onClick={fetchForm}>
            {t('formBuilder.reload')}
          </button>
        </p>
      )}
      {saveError && !hasConflict && <p className={styles.errorBanner}>{saveError}</p>}

      {/*
        The document is the only column that always exists. Both side panes are
        dismissible, and the grid is described from what is actually open
        rather than reserving tracks for panels that are not there — a fixed
        three-column shell is what made the page feel like it was sharing the
        window with a dashboard.
      */}
      <div
        className={styles.body}
        style={
          showHistory
            ? { gridTemplateColumns: '280px minmax(0, 1fr)' }
            : {
                gridTemplateColumns: [
                  showNavigationPane && !showPreview ? '150px' : null,
                  'minmax(0, 1fr)',
                  showFormatPane && (selectedElement || selectedSection) ? '280px' : null,
                ]
                  .filter(Boolean)
                  .join(' '),
              }
        }
      >
        {showHistory ? (
          <aside className={styles.historyPanel}>
            {/* Same rule as read view: a mode gets a visible way out on the
                surface it takes over, not only in the menu that opened it. */}
            <div className={styles.historyHeader}>
              <h3 className={styles.historyTitle}>{t('formBuilder.versionHistory')}</h3>
              <button type="button" className={styles.historyClose} onClick={handleToggleHistory}>
                {t('formBuilder.hideHistory')}
              </button>
            </div>
            {isLoadingVersions && <p className={styles.hint}>{t('formBuilder.loading')}</p>}
            {!isLoadingVersions && versions.length === 0 && (
              <p className={styles.hint}>{t('formBuilder.noVersionsYet')}</p>
            )}
            <ul className={styles.historyList}>
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={`${styles.historyItem} ${
                      viewedVersion?.versionNumber === v.versionNumber ? styles.historyItemActive : ''
                    }`}
                    onClick={() => handleViewVersion(v.versionNumber)}
                  >
                    <span className={styles.historyItemNumber}>
                      {t('formBuilder.versionNumber', { number: v.versionNumber })}
                    </span>
                    <span className={styles.historyItemDate}>
                      {new Date(v.publishedAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : (
          !showPreview &&
          showNavigationPane && (
            <PageRail
              layout={layout}
              activePageId={targetPageId}
              onJumpToPage={(pageId) => {
                setActivePageId(pageId);
                /*
                 * The page being worked on is derived from the SELECTION when
                 * there is one, so setting `activePageId` alone was invisible:
                 * with a field on page 1 selected, clicking page 3 in the rail
                 * moved the scroll, then the highlight snapped straight back,
                 * the status bar still read "Page 1", and Layout's page
                 * commands kept acting on page 1. Selecting the page is what
                 * actually moves the insertion point there.
                 */
                handleSelect({ type: 'page', id: pageId });
                // Guarded: not every environment implements it, and a jump to
                // a page must never be able to throw into the click handler.
                document
                  .querySelector(`[data-page-id="${pageId}"]`)
                  ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
              }}
              onAddPage={() => apply(addPage(layout))}
              onDeletePage={(pageId) => apply(deletePage(layout, pageId))}
              onDuplicatePage={(pageId) => apply(duplicatePage(layout, pageId))}
              onReorderPage={(pageId, toIndex) => apply(reorderPage(layout, pageId, toIndex))}
              onRemoveEmptyPages={() => apply(removeEmptyPages(layout))}
            />
          )
        )}

        <div className={styles.canvasArea} ref={canvasAreaRef}>
          {showHistory && viewedVersion ? (
            <>
              <p className={styles.banner}>
                {t('formBuilder.viewingVersion', { number: viewedVersion.versionNumber })}
              </p>
              <ScaledPage
                pageWidth={viewedVersion.document.page.width}
                pageHeight={viewedVersion.document.page.height * viewedVersion.document.pages.length}
              >
                <FormRenderer layout={viewedVersion.document} mode="print" />
              </ScaledPage>
            </>
          ) : showHistory && isLoadingVersion ? (
            <p className={styles.hint}>{t('formBuilder.loading')}</p>
          ) : showHistory ? (
            <p className={styles.hint}>{t('formBuilder.selectVersionToView')}</p>
          ) : showPreview ? (
            <>
              {/*
                Read view is a MODE, and a mode with no visible way out is a
                trap — the command that opened it lives behind the File menu,
                which closes on click. Word's read view keeps its exit on the
                document surface for the same reason.
              */}
              <p className={styles.banner}>
                {t('formBuilder.readViewBanner')}{' '}
                <button type="button" onClick={handleTogglePreview}>
                  {t('formBuilder.hidePreview')}
                </button>
              </p>
              {/*
                FILL, NOT PRINT. The point of the read view is "show me what my
                client will get", and a form's answer to that is a form: boxes
                to type in, a date picker, a dropdown with the options on it.
                Rendering `print` here answered a different question — how the
                page comes out of a printer — so every field showed as a label
                over a dash and the owner could not tell whether the thing they
                had built was fillable at all.

                This is the SAME mode and the same renderer the public `/f/`
                page uses, which is what makes it a preview rather than an
                impression of one. Nothing typed here is submitted or kept: the
                control below is a throwaway, and the banner says so.
              */}
              <ScaledPage pageWidth={layout.page.width} pageHeight={layout.page.height * layout.pages.length}>
                <FormRenderer
                  layout={layout}
                  mode="fill"
                  control={previewControl}
                  // The staff roster is not loaded here, so a USER_REFERENCE
                  // field previews as an empty picker — exactly what the
                  // public page shows, and for the same reason.
                  userOptions={[]}
                />
              </ScaledPage>
            </>
          ) : (
            <FormCanvas
              layout={layout}
              viewport={viewport}
              selection={selection}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              editing={inline.target}
              onBeginEdit={handleBeginEdit}
              onChangeElementContent={handleChangeElementContent}
              onRenameField={handleRenameField}
              onEditorReady={inline.setEditor}
              onGestureStart={history.beginInteraction}
              onGestureEnd={history.endInteraction}
              onMoveSection={(id, x, y) => apply(moveSection(layout, id, x, y))}
              onResizeSection={(id, box) => apply(resizeSection(layout, id, box))}
              onRenameSection={(id, title) => apply(renameSection(layout, id, title))}
              onDeleteSection={(id) => {
                apply(removeSection(layout, id));
                setSelection(null);
              }}
              onMoveElement={(id, x, y) => apply(moveElement(layout, id, x, y))}
              onResizeElement={(id, box) => apply(resizeElement(layout, id, box))}
              onContextMenu={handleContextMenu}
              onDeleteElement={(id) => {
                apply(removeElement(layout, id));
                setSelection(null);
              }}
              onTypeAt={handleTypeAt}
            />
          )}
        </div>

        {/* The Add menu moved into the ribbon's Insert tab; the sidebar is
            now just the format surface for whatever is selected. */}
        {/* Gated on exactly what the grid template above reserves a track for:
            an empty shell here became a third child of a two-column grid, wrapped
            onto a row of its own and took half the canvas height with it. */}
        {!showHistory && showFormatPane && (selectedElement || selectedSection) && (
          <div className={styles.sidebar}>
            <PropertiesPanel
              selection={selection ? { section: selectedSection, element: selectedElement } : null}
              onChangeElement={(id, changes) => apply(updateElement(layout, id, changes))}
              onChangeSection={(id, changes) => apply(updateSection(layout, id, changes))}
              onEditText={(id) => handleBeginEdit({ kind: 'element-text', id })}
              onClose={() => setShowFormatPane(false)}
            />
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          label={t('formBuilder.canvasMenu')}
          items={buildCanvasMenu(
            {
              target: menu.target,
              canEditText:
                !!selectedElement &&
                (selectedElement.type === 'TEXT' || isDataBearing(selectedElement.type)),
              canPaste,
              canDeletePage: layout.pages.length > 1,
              hasEmptyPages: layout.pages.some((p) => p.sections.length === 0),
              canMoveToNextPage: activePageIndex < layout.pages.length - 1,
            },
            {
              cut: doCut,
              copy: doCopy,
              paste: doPaste,
              duplicate: doDuplicate,
              remove: doDelete,
              editText: () => {
                if (!selectedElement) return;
                handleBeginEdit(
                  selectedElement.type === 'TEXT'
                    ? { kind: 'element-text', id: selectedElement.id }
                    : { kind: 'field-label', id: selectedElement.id }
                );
              },
              openFormatPane: () => setShowFormatPane(true),
              insertPageBefore: () => apply(insertPageAt(layout, activePageIndex)),
              moveToNextPage: () => {
                const next = layout.pages[activePageIndex + 1];
                const section = selectedSectionId ? findSection(layout, selectedSectionId)?.section : undefined;
                if (!next || !section) return;
                // Keep the horizontal placement, and land at the top margin —
                // the section is arriving at the start of the next page, which
                // is where the reader's eye goes.
                apply(
                  moveSectionToPage(layout, section.id, next.id, section.x, layout.page.margin.top)
                );
              },
              duplicatePage: () => targetPageId && apply(duplicatePage(layout, targetPageId)),
              deletePage: () => targetPageId && apply(deletePage(layout, targetPageId)),
              removeEmptyPages: () => apply(removeEmptyPages(layout)),
            },
            t
          )}
        />
      )}

      <StatusBar
        pageNumber={activePageIndex + 1}
        pageCount={layout.pages.length}
        autosave={autosave.status}
        onRetrySave={() => void autosave.retry()}
        zoomPercent={viewport.zoomPercent}
        canZoomIn={viewport.canZoomIn}
        canZoomOut={viewport.canZoomOut}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onFitPage={() => {
          const el = canvasAreaRef.current;
          if (el) viewport.fitPage(el.clientWidth, el.clientHeight);
        }}
        onFitWidth={() => {
          const el = canvasAreaRef.current;
          if (el) viewport.fitWidth(el.clientWidth);
        }}
      />
    </div>
  );
};

/**
 * Every object id the document still contains — what the selection is pruned
 * against after each mutation.
 */
function aliveIds(document: FormDocument): Set<string> {
  const ids = new Set<string>();
  for (const page of document.pages) {
    ids.add(page.id);
    for (const section of page.sections) {
      ids.add(section.id);
      for (const element of section.elements) ids.add(element.id);
    }
  }
  return ids;
}

/**
 * Where a newly added field/image should land: directly below the lowest
 * existing element in the target section, not a fixed offset every element
 * would share.
 */
function nextElementPosition(
  layout: FormDocument,
  sectionId: string,
  width: number
): { x: number; y: number } {
  const section = findSection(layout, sectionId)?.section;
  if (!section || section.elements.length === 0) return { x: 16, y: 40 };
  const maxBottom = section.elements.reduce((m, el) => Math.max(m, el.y + el.height), 0);
  return { x: Math.min(16, Math.max(0, section.width - width)), y: maxBottom + 16 };
}
