import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

export type ContextMenuItem =
  | { id: string; kind: 'separator' }
  | {
      id: string;
      kind?: 'item';
      label: string;
      icon?: React.ReactNode;
      /** Rendered right-aligned, e.g. "Ctrl+X". Display only. */
      shortcut?: string;
      onClick: () => void;
      disabled?: boolean;
      danger?: boolean;
    };

export interface ContextMenuProps {
  /** VIEWPORT coordinates, straight from the pointer event. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  label?: string;
}

/** Breathing room kept between the menu and the viewport edge. */
const MARGIN = 8;

const isCommand = (item: ContextMenuItem): item is Extract<ContextMenuItem, { kind?: 'item' }> =>
  item.kind !== 'separator';

/**
 * A menu that opens at a point, for right-click.
 *
 * NOT `ui/DropdownMenu`, which positions from a trigger element's bounding box,
 * owns its own open state keyed to a click on that trigger, and offers a flat
 * list of buttons with no separators and no menu semantics. A context menu has
 * no trigger to measure — it opens where the pointer is — and grouping is the
 * whole reason its items are readable at a glance.
 *
 * COORDINATES ARE VIEWPORT COORDINATES and are used as-is on a fixed-position
 * portal. They are NOT divided by the canvas zoom. A CSS transform on the
 * canvas scales what is drawn, not what a pointer event reports, so "correcting
 * for zoom" here would put the menu in the wrong place at every zoom level
 * except 100% — a mistake worth naming, because the surrounding drag and resize
 * code legitimately does divide by the scale and invites the same reflex here.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, label }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [focused, setFocused] = useState(0);

  const commands = items.filter(isCommand);

  // Flip and clamp so the menu is always fully on screen, the same
  // measure-then-place approach `DropdownMenu` uses.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = x + width + MARGIN > window.innerWidth ? Math.max(MARGIN, x - width) : x;
    const top = y + height + MARGIN > window.innerHeight ? Math.max(MARGIN, y - height) : y;
    setPosition({ left, top });
  }, [x, y]);

  /*
   * Focus starts on the first command, and is restored to whatever had it when
   * the menu closes — otherwise a keyboard user who dismisses the menu is left
   * with focus on <body> and no way back to where they were.
   */
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const buttons = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    buttons?.[focused]?.focus();
  }, [focused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (commands.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocused((i) => (i + 1) % commands.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocused((i) => (i - 1 + commands.length) % commands.length);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setFocused(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setFocused(commands.length - 1);
      } else if (event.key === 'Tab') {
        onClose();
      }
    };

    // `pointerdown`, not `mousedown`, so dismissal composes with the canvas's
    // pointer-based drag gestures rather than racing them.
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [commands.length, onClose]);

  const menu = (
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={label}
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item) =>
        isCommand(item) ? (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`${styles.item} ${item.danger ? styles.itemDanger : ''}`}
            disabled={item.disabled}
            tabIndex={-1}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
          >
            <span className={styles.itemIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.itemLabel}>{item.label}</span>
            {item.shortcut && <span className={styles.itemShortcut}>{item.shortcut}</span>}
          </button>
        ) : (
          <div key={item.id} role="separator" className={styles.separator} />
        )
      )}
    </div>
  );

  return createPortal(menu, document.body);
};
