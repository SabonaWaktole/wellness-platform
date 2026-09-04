import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Eye,
  Save,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoveHorizontal,
  UploadCloud,
  History,
  Link as LinkIcon,
  Printer,
} from 'lucide-react';
import { Button } from '../../ui/Button/Button';
import { FormCanvas, type CanvasSelection } from './FormCanvas';
import { PageRail } from './PageRail';
import { PropertiesPanel } from './PropertiesPanel';
import { AddMenu } from './AddMenu';
import { FormRenderer, ScaledPage } from '../FormRenderer';
import { useCanvasViewport } from './useCanvasViewport';
import { useHistory } from './useHistory';
import { useClipboard } from './useClipboard';
import { useAutosave } from './useAutosave';
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
import type { ComponentType, FormDocument, FormElement } from '../../../types/form';
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

  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  /** Rung 4 of the overflow ladder refuses operations; this is where the
   *  owner is told why, instead of the edit silently doing nothing. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);

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
    setRefusal(null);
    setActivePageId(form.layout.pages?.[0]?.id ?? null);
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
      setIsDirty(true);
      autosaveRef.current?.schedule();
    },
    [history] // eslint-disable-line react-hooks/exhaustive-deps
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

  const handleAddSection = () => {
    const pageId = targetPageId ?? layout.pages[0].id;
    const page = layout.pages.find((p) => p.id === pageId);
    const y = (page?.sections ?? []).reduce(
      (max, s) => Math.max(max, s.y + s.height + 24),
      layout.page.margin.top
    );
    apply(
      addSection(layout, pageId, t('formBuilder.newSectionTitle'), {
        x: layout.page.margin.left,
        y,
        width: NEW_SECTION_WIDTH,
        height: NEW_SECTION_HEIGHT,
      })
    );
  };

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
      if (isTextEntryTarget(event.target)) return;
      const shortcut = resolveShortcut(event);
      if (!shortcut) return;

      switch (shortcut.action) {
        case 'undo':
          event.preventDefault();
          history.undo();
          setIsDirty(true);
          autosaveRef.current.schedule();
          break;
        case 'redo':
          event.preventDefault();
          history.redo();
          setIsDirty(true);
          autosaveRef.current.schedule();
          break;
        case 'escape':
          setSelection(null);
          break;
        case 'delete':
          if (selection?.type === 'element') {
            apply(removeElement(layout, selection.id));
            setSelection(null);
          } else if (selection?.type === 'section') {
            apply(removeSection(layout, selection.id));
            setSelection(null);
          }
          break;
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
          if (selection?.type === 'element') clipboard.copy(layout, [selection.id]);
          break;
        case 'cut':
          if (selection?.type === 'element') {
            apply(clipboard.cut(layout, [selection.id]));
            setSelection(null);
          }
          break;
        case 'paste':
          if (clipboard.hasContent) apply(clipboard.paste(layout, selectedSectionId));
          break;
        case 'duplicate':
          event.preventDefault();
          if (selection?.type === 'element') {
            apply(clipboard.duplicate(layout, [selection.id]));
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
  }, [layout, selection, selectedSectionId, apply, clipboard, history]);

  if (isLoading && !form) return <p>{t('formBuilder.loading')}</p>;
  if (error && !form) return <p role="alert">{error}</p>;
  if (!form) return null;

  const selectedElement = selection?.type === 'element' ? findElement(layout, selection.id) : undefined;
  const selectedSection = selectedSectionId ? findSection(layout, selectedSectionId)?.section : undefined;

  return (
    <div className={styles.shell}>
      <div className={styles.toolbar}>
        <Button
          variant="outline"
          type="button"
          icon={<ArrowLeft size={16} />}
          onClick={() => navigate(`/${tenantSlug}/settings/client-management`)}
        >
          {t('formBuilder.back')}
        </Button>
        <span className={styles.formName}>{form.name}</span>
        <span
          className={`${styles.statusBadge} ${
            form.status === 'PUBLISHED' ? styles.statusBadgePublished : styles.statusBadgeDraft
          }`}
        >
          {form.status === 'PUBLISHED' ? t('formBuilder.published') : t('formBuilder.draft')}
        </span>
        {form.status === 'PUBLISHED' && form.hasUnpublishedChanges && (
          <span className={styles.unpublishedHint}>{t('formBuilder.unpublishedChanges')}</span>
        )}
        {form.status === 'PUBLISHED' && form.shareToken && (
          <button
            type="button"
            className={styles.shareLinkButton}
            onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/f/${form.shareToken}`)}
            title={`${window.location.origin}/f/${form.shareToken}`}
          >
            <LinkIcon size={13} />
            {t('formBuilder.copyLink')}
          </button>
        )}

        <div className={styles.zoomGroup} role="group" aria-label={t('formBuilder.zoom')}>
          <button
            type="button"
            onClick={() => history.undo()}
            disabled={!history.canUndo}
            aria-label={t('formBuilder.undo')}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => history.redo()}
            disabled={!history.canRedo}
            aria-label={t('formBuilder.redo')}
          >
            <Redo2 size={15} />
          </button>
          <span className={styles.zoomDivider} aria-hidden="true" />
          <button type="button" onClick={viewport.zoomOut} aria-label={t('formBuilder.zoomOut')}>
            <ZoomOut size={15} />
          </button>
          <span className={styles.zoomPercent}>{viewport.zoomPercent}%</span>
          <button type="button" onClick={viewport.zoomIn} aria-label={t('formBuilder.zoomIn')}>
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              const el = canvasAreaRef.current;
              if (el) viewport.fitPage(el.clientWidth, el.clientHeight);
            }}
            aria-label={t('formBuilder.fitPage')}
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              const el = canvasAreaRef.current;
              if (el) viewport.fitWidth(el.clientWidth);
            }}
            aria-label={t('formBuilder.fitWidth')}
          >
            <MoveHorizontal size={15} />
          </button>
        </div>

        <div className={styles.toolbarSpacer} />
        <Button
          variant="outline"
          type="button"
          icon={<Printer size={16} />}
          onClick={() => window.open(`/${tenantSlug}/settings/client-management/forms/${formId}/print`, '_blank')}
        >
          {t('formBuilder.print')}
        </Button>
        <Button
          variant="outline"
          type="button"
          icon={<History size={16} />}
          onClick={handleToggleHistory}
        >
          {showHistory ? t('formBuilder.hideHistory') : t('formBuilder.showHistory')}
        </Button>
        <Button
          variant="outline"
          type="button"
          icon={<Eye size={16} />}
          onClick={handleTogglePreview}
        >
          {showPreview ? t('formBuilder.hidePreview') : t('formBuilder.showPreview')}
        </Button>
        <Button
          variant="primary"
          type="button"
          icon={<Save size={16} />}
          disabled={isSaving || !isDirty}
          onClick={handleSave}
        >
          {isSaving ? t('formBuilder.saving') : t('formBuilder.save')}
        </Button>
        <Button
          variant="primary"
          type="button"
          icon={<UploadCloud size={16} />}
          disabled={isPublishing || isSaving}
          onClick={() => void handlePublish()}
        >
          {isPublishing ? t('formBuilder.publishing') : t('formBuilder.publish')}
        </Button>
      </div>

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
      {autosave.status === 'error' && (
        <p className={styles.errorBanner}>
          {t('formBuilder.autosaveFailed')}{' '}
          <button type="button" onClick={() => void autosave.retry()}>
            {t('formBuilder.retry')}
          </button>
        </p>
      )}

      <div className={`${styles.body} ${showHistory ? styles.bodyHistory : ''}`}>
        {showHistory ? (
          <aside className={styles.historyPanel}>
            <h3 className={styles.historyTitle}>{t('formBuilder.versionHistory')}</h3>
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
          !showPreview && (
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
            <ScaledPage pageWidth={layout.page.width} pageHeight={layout.page.height * layout.pages.length}>
              <FormRenderer layout={layout} mode="print" />
            </ScaledPage>
          ) : (
            <FormCanvas
              layout={layout}
              viewport={viewport}
              selection={selection}
              onSelect={setSelection}
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

        {!showHistory && (
          <div className={styles.sidebar}>
            <AddMenu
              onAddSection={handleAddSection}
              targetSectionId={selectedSectionId}
              onAddComponent={handleAddComponent}
              onAddImage={handleAddImage}
              imageError={uploadError}
              isUploadingImage={isUploading}
            />
            <PropertiesPanel
              selection={selection ? { section: selectedSection, element: selectedElement } : null}
              onChangeElement={(id, changes) => apply(updateElement(layout, id, changes))}
              onChangeSection={(id, changes) => apply(updateSection(layout, id, changes))}
            />
          </div>
        )}
      </div>
    </div>
  );
};

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
