import React from 'react';
import { createPortal } from 'react-dom';
import type { ComponentType } from '../../../types/form';
import styles from './SlashMenu.module.css';

export interface SlashMenuOption {
  type: ComponentType;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

export interface SlashMenuProps {
  /** VIEWPORT coordinates — the caret's own position, from
   *  `editor.view.coordsAtPos`. Not divided by canvas zoom, same reasoning as
   *  ui/ContextMenu: a fixed-position portal reads real pointer/caret
   *  coordinates directly. */
  x: number;
  y: number;
  options: SlashMenuOption[];
  selectedIndex: number;
  onChoose: (type: ComponentType) => void;
}

/**
 * The `/` insert menu — built entirely from the component registry (via the
 * `options` the caller derives from `ADDABLE_COMPONENTS`), same principle as
 * `canvas/AddMenu.tsx`: nothing here enumerates component types, so a future
 * registry entry appears here for free.
 *
 * A pure, controlled list — RichTextEditor owns which query matched, which
 * items that produced, and which index is highlighted; this component only
 * ever renders that state and reports a click. Keyboard navigation lives in
 * the TipTap extension that shares RichTextEditor's state, not here, because
 * the keystrokes it intercepts (ArrowUp/Down/Enter/Escape) have to be caught
 * before ProseMirror's own keymap sees them.
 */
export const SlashMenu: React.FC<SlashMenuProps> = ({ x, y, options, selectedIndex, onChoose }) => {
  if (options.length === 0) return null;

  const menu = (
    <div className={styles.menu} role="listbox" style={{ left: x, top: y }}>
      {options.map((option, index) => {
        const Icon = option.icon;
        return (
          <button
            key={option.type}
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            className={`${styles.item} ${index === selectedIndex ? styles.itemActive : ''}`}
            /*
             * mousedown, not click — a click fires after the editor has
             * already blurred, and a blurred TipTap instance cannot run the
             * `deleteRange` this selection needs. `preventDefault` here stops
             * that blur from happening at all, so the editor is still live
             * and focused when `onChoose` runs.
             */
            onMouseDown={(e) => {
              e.preventDefault();
              onChoose(option.type);
            }}
          >
            <span className={styles.itemIcon} aria-hidden="true">
              <Icon size={14} />
            </span>
            <span className={styles.itemLabel}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );

  return createPortal(menu, document.body);
};
