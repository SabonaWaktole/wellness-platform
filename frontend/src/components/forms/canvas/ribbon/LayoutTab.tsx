import React from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Trash2, ChevronUp, ChevronDown, Eraser, PanelLeft } from 'lucide-react';
import { RibbonGroup } from './RibbonGroup';
import { RibbonButton } from './RibbonButton';

export interface LayoutTabProps {
  /**
   * False before any page has been selected or clicked, when `targetPageId` is
   * still null and every page command silently does nothing.
   */
  hasTargetPage: boolean;
  canDeletePage: boolean;
  canMovePageUp: boolean;
  canMovePageDown: boolean;
  hasEmptyPages: boolean;
  onDuplicatePage: () => void;
  onDeletePage: () => void;
  onMovePageUp: () => void;
  onMovePageDown: () => void;
  onRemoveEmptyPages: () => void;
  isNavigationPaneOpen: boolean;
  onToggleNavigationPane: () => void;
}

/**
 * Layout: operations on the document's pages, and the view around them.
 *
 * These verbs previously existed only as icon buttons inside the page rail's
 * thumbnails — findable if you already knew they were there, invisible
 * otherwise. The rail keeps them (it is the natural place to act on a
 * specific page); this group makes them discoverable for the page being
 * worked on.
 */
export const LayoutTab: React.FC<LayoutTabProps> = ({
  hasTargetPage,
  canDeletePage,
  canMovePageUp,
  canMovePageDown,
  hasEmptyPages,
  onDuplicatePage,
  onDeletePage,
  onMovePageUp,
  onMovePageDown,
  onRemoveEmptyPages,
  isNavigationPaneOpen,
  onToggleNavigationPane,
}) => {
  const { t } = useTranslation('settings');

  return (
    <>
      <RibbonGroup label={t('formBuilder.ribbon.pagesGroup')}>
        {/*
          It resolves through `targetPageId`, which falls back to
          `activePageId` — and that starts null. So on a freshly opened form
          this was a lit, hoverable button that did nothing when pressed and
          gave no reason, right up until the owner happened to click a page.
        */}
        <RibbonButton
          icon={<Copy size={16} />}
          label={t('formBuilder.duplicatePage')}
          onClick={onDuplicatePage}
          disabled={!hasTargetPage}
        />
        <RibbonButton
          icon={<ChevronUp size={16} />}
          label={t('formBuilder.movePageUp')}
          onClick={onMovePageUp}
          disabled={!canMovePageUp}
        />
        <RibbonButton
          icon={<ChevronDown size={16} />}
          label={t('formBuilder.movePageDown')}
          onClick={onMovePageDown}
          disabled={!canMovePageDown}
        />
        <RibbonButton
          icon={<Trash2 size={16} />}
          label={t('formBuilder.deletePage')}
          onClick={onDeletePage}
          disabled={!canDeletePage}
        />
        <RibbonButton
          icon={<Eraser size={16} />}
          label={t('formBuilder.removeEmptyPages')}
          onClick={onRemoveEmptyPages}
          disabled={!hasEmptyPages}
        />
      </RibbonGroup>

      <RibbonGroup label={t('formBuilder.ribbon.viewGroup')}>
        {/* It always toggled; it just never said which way it was. */}
        <RibbonButton
          icon={<PanelLeft size={16} />}
          label={t('formBuilder.navigationPane')}
          onClick={onToggleNavigationPane}
          pressed={isNavigationPaneOpen}
          title={isNavigationPaneOpen ? t('formBuilder.hideNavigationPane') : t('formBuilder.showNavigationPane')}
        />
      </RibbonGroup>
    </>
  );
};
