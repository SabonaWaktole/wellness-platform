import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ribbon } from './ribbon/Ribbon';
import { RIBBON_TABS } from './ribbon/ribbonTypes';
import { TitleBar } from './ribbon/TitleBar';
import { StatusBar } from './ribbon/StatusBar';
import { HomeTab } from './ribbon/HomeTab';
import { InsertTab } from './ribbon/InsertTab';
import { LayoutTab } from './ribbon/LayoutTab';
import { ContextualTab } from './ribbon/ContextualTab';
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
import { resolveShortcut, isTextEntryTarget } from './keyboard';
import {
  addSection,
  addElement,
  addPage,
  deletePage,
  duplicatePage,
  reorderPage,
  removeEmptyPages,
  moveSection,
  resizeSection,
  renameSection,
  removeSection,
  moveElement,
  resizeElement,
  updateElement,
  updateSection,
  removeElement,
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
import type {
  ComponentType,
  ElementContent,
  FormDocument,
  FormElement,
} from '../../../types/form';
import styles from './FormCanvas.module.css';

const NEW_SECTION_WIDTH = 420;
const NEW_SECTION_HEIGHT = 220;

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

  useEffect(() => {
    fetchForm();
  }, [fetchForm]);

  // A fresh load (or a reload after a conflict) replaces local state wholesale.
  useEffect(() => {
    if (!form) return;
    history.reset(form.layout);
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
      apply(updateElement(layout, elementId, { content }));
    },
    [layout, apply]
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
        case 'delete': {
          // Every selected object, not just the primary — a Delete that
          // removed one of five highlighted fields would be indefensible.
          if (!sel.kind || sel.ids.length === 0) break;
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
          break;
        }
        case 'nudge': {
          if (selection?.type === 'element') {
            const el = findElement(layout, selection.id);
            if (el) apply(moveElement(layout, selection.id, el.x + shortcut.dx, el.y + shortcut.dy));
          } else if (selection?.type === 'section') {
            const found = findSection(layout, selection.id);
            if (found) apply(moveSection(layout, selection.id, found.section.x + shortcut.dx, found.section.y + shortcut.dy));
          }
          break;
        }
        case 'copy':
          if (sel.kind === 'element') clipboard.copy(layout, sel.ids);
          break;
        case 'cut':
          if (sel.kind === 'element') {
            apply(clipboard.cut(layout, sel.ids));
            setSelection(null);
          }
          break;
        case 'paste':
          if (clipboard.hasContent) apply(clipboard.paste(layout, selectedSectionId));
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
          if (sel.kind === 'element') {
            apply(clipboard.duplicate(layout, sel.ids));
          } else if (selection?.type === 'page') {
            apply(duplicatePage(layout, selection.id));
          }
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
    targetPageId,
    selectAllOnPage,
    selectedSectionId,
    apply,
    clipboard,
    history,
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
            canCut={sel.kind === 'element' && sel.ids.length > 0}
            canPaste={clipboard.hasContent && !!selectedSectionId}
            onCut={() => {
              apply(clipboard.cut(layout, sel.ids));
              setSelection(null);
            }}
            onCopy={() => clipboard.copy(layout, sel.ids)}
            onPaste={() => apply(clipboard.paste(layout, selectedSectionId))}
            onDuplicate={() => apply(clipboard.duplicate(layout, sel.ids))}
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
            onDelete={() => {
              if (selection?.type === 'section') apply(removeSection(layout, selection.id));
              else if (selection?.type === 'element') apply(removeElement(layout, selection.id));
              setSelection(null);
            }}
            onDuplicate={() => {
              if (selection?.type === 'element') apply(clipboard.duplicate(layout, sel.ids));
            }}
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

      <div className={`${styles.body} ${showHistory ? styles.bodyHistory : ''}`}>
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
                document
                  .querySelector(`[data-page-id="${pageId}"]`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
              <ScaledPage pageWidth={layout.page.width} pageHeight={layout.page.height * layout.pages.length}>
                <FormRenderer layout={layout} mode="print" />
              </ScaledPage>
            </>
          ) : (
            <FormCanvas
              layout={layout}
              viewport={viewport}
              selection={selection}
              selectedIds={selectedIds}
              onSelect={setSelection}
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
              onDeleteElement={(id) => {
                apply(removeElement(layout, id));
                setSelection(null);
              }}
            />
          )}
        </div>

        {/* The Add menu moved into the ribbon's Insert tab; the sidebar is
            now just the format surface for whatever is selected. */}
        {!showHistory && showFormatPane && (
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

      <StatusBar
        pageNumber={activePageIndex + 1}
        pageCount={layout.pages.length}
        autosave={autosave.status}
        onRetrySave={() => void autosave.retry()}
        zoomPercent={viewport.zoomPercent}
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
