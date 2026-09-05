import type { TFunction } from 'i18next';
import type { ContextMenuItem } from '../../ui/ContextMenu';

/** What was right-clicked. */
export type MenuTarget = 'element' | 'section' | 'page';

export interface CanvasMenuState {
  target: MenuTarget;
  /** Whether the element being acted on has text of its own to edit. */
  canEditText: boolean;
  canPaste: boolean;
  canDeletePage: boolean;
  hasEmptyPages: boolean;
  /** True once the document runs to more than one page. */
  canMoveToNextPage: boolean;
}

export interface CanvasMenuActions {
  cut: () => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  remove: () => void;
  editText: () => void;
  openFormatPane: () => void;
  insertPageBefore: () => void;
  moveToNextPage: () => void;
  duplicatePage: () => void;
  deletePage: () => void;
  removeEmptyPages: () => void;
}

/**
 * The right-click menu for each kind of target, as data.
 *
 * Pure and separate from the component so the SHAPE of each menu — which
 * commands, in which order, divided into which groups — is testable without a
 * DOM, and so the ordering convention stays in one place. That convention is
 * the desktop one every user already knows: the clipboard verbs first, then
 * what is specific to this object, then destructive actions last and alone
 * after a divider, where they cannot be hit by accident.
 */
export const buildCanvasMenu = (
  state: CanvasMenuState,
  actions: CanvasMenuActions,
  t: TFunction
): ContextMenuItem[] => {
  const clipboard: ContextMenuItem[] = [
    { id: 'cut', label: t('formBuilder.cut'), shortcut: 'Ctrl+X', onClick: actions.cut },
    { id: 'copy', label: t('formBuilder.copy'), shortcut: 'Ctrl+C', onClick: actions.copy },
    {
      id: 'paste',
      label: t('formBuilder.paste'),
      shortcut: 'Ctrl+V',
      onClick: actions.paste,
      disabled: !state.canPaste,
    },
    {
      id: 'duplicate',
      label: t('formBuilder.duplicate'),
      shortcut: 'Ctrl+D',
      onClick: actions.duplicate,
    },
  ];

  if (state.target === 'page') {
    return [
      { id: 'paste', label: t('formBuilder.paste'), shortcut: 'Ctrl+V', onClick: actions.paste, disabled: !state.canPaste },
      { id: 'sep-1', kind: 'separator' },
      { id: 'insert-page', label: t('formBuilder.insertPageBefore'), onClick: actions.insertPageBefore },
      { id: 'duplicate-page', label: t('formBuilder.duplicatePage'), onClick: actions.duplicatePage },
      {
        id: 'remove-empty',
        label: t('formBuilder.removeEmptyPages'),
        onClick: actions.removeEmptyPages,
        disabled: !state.hasEmptyPages,
      },
      { id: 'sep-2', kind: 'separator' },
      {
        id: 'delete-page',
        label: t('formBuilder.deletePage'),
        onClick: actions.deletePage,
        disabled: !state.canDeletePage,
        danger: true,
      },
    ];
  }

  const specific: ContextMenuItem[] =
    state.target === 'section'
      ? [
          {
            id: 'move-next-page',
            label: t('formBuilder.moveToNextPage'),
            onClick: actions.moveToNextPage,
            disabled: !state.canMoveToNextPage,
          },
          { id: 'insert-page', label: t('formBuilder.insertPageBefore'), onClick: actions.insertPageBefore },
        ]
      : state.canEditText
        ? [{ id: 'edit-text', label: t('formBuilder.editOnPage'), onClick: actions.editText }]
        : [];

  return [
    ...clipboard,
    ...(specific.length > 0 ? [{ id: 'sep-1', kind: 'separator' as const }, ...specific] : []),
    { id: 'sep-2', kind: 'separator' },
    { id: 'format', label: t('formBuilder.formatPane'), onClick: actions.openFormatPane },
    { id: 'sep-3', kind: 'separator' },
    { id: 'delete', label: t('formBuilder.deleteObject'), shortcut: 'Del', onClick: actions.remove, danger: true },
  ];
};
