import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import styles from './DropdownMenu.module.css';

export interface DropdownMenuItemType {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItemType[];
  header?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

/** Breathing room between the trigger and the menu. */
const GAP = 6;
/** Minimum distance kept between the menu and any viewport edge. */
const MARGIN = 8;

interface MenuPosition {
  top: number;
  left: number;
  maxHeight: number;
  /** Which edge the menu grew from, so the open animation matches the flip. */
  originY: 'top' | 'bottom';
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  header,
  align = 'right',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /*
    The menu is portalled to <body> rather than rendered beside its trigger: as a
    child it was clipped by whichever ancestor scrolled (a table's overflow:auto
    scroll area, a card's overflow:hidden), and z-index cannot lift an element out
    of a clipping ancestor. Fixed positioning is the cost of that — the
    coordinates have to be measured rather than declared.
  */
  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    const place = () => {
      const container = containerRef.current;
      const menu = menuRef.current;
      if (!container || !menu) return;

      const anchor = container.getBoundingClientRect();
      const { width: menuW, height: menuH } = menu.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      // Prefer below; flip above when the space under the trigger cannot hold it.
      const spaceBelow = viewportH - anchor.bottom - MARGIN;
      const flipUp = menuH + GAP > spaceBelow && anchor.top - MARGIN > spaceBelow;
      let top = flipUp ? anchor.top - menuH - GAP : anchor.bottom + GAP;

      // A menu taller than the viewport scrolls internally rather than
      // overflowing off-screen at both ends.
      const maxHeight = viewportH - MARGIN * 2;
      const clampedH = Math.min(menuH, maxHeight);
      top = Math.min(Math.max(top, MARGIN), Math.max(viewportH - clampedH - MARGIN, MARGIN));

      const left = align === 'right' ? anchor.right - menuW : anchor.left;
      const clampedLeft = Math.min(
        Math.max(left, MARGIN),
        Math.max(viewportW - menuW - MARGIN, MARGIN)
      );

      setPosition({
        top,
        left: clampedLeft,
        maxHeight,
        originY: flipUp ? 'bottom' : 'top',
      });
    };

    place();

    // Capture catches scrolls of inner containers (table scroll areas), which do
    // not bubble to window.
    window.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [isOpen, align, items.length, header]);

  useEffect(() => {
    // The menu now lives outside `containerRef` in the DOM, so a click on one of
    // its own items counts as "outside" unless the menu is checked too.
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => setIsOpen((prev) => !prev);

  const handleItemClick = (item: DropdownMenuItemType) => {
    if (item.disabled) return;
    item.onClick();
    setIsOpen(false);
  };

  const dropdownClasses = [
    styles.dropdown,
    align === 'right' ? styles.alignRight : styles.alignLeft
  ].join(' ');

  const menu = (
    <div
      ref={menuRef}
      className={dropdownClasses}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        maxHeight: position?.maxHeight,
        // Hidden for the single frame before measurement, so the menu is never
        // seen at the top-left corner on its way to the trigger.
        visibility: position ? 'visible' : 'hidden',
        ['--menu-origin-y' as string]: position?.originY ?? 'top',
      }}
    >
      {header && <div className={styles.header}>{header}</div>}
      {items.map((item) => (
        <button
          key={item.id}
          className={[
            styles.item,
            item.danger ? styles.itemDanger : '',
            item.disabled ? styles.itemDisabled : ''
          ].filter(Boolean).join(' ')}
          onClick={() => handleItemClick(item)}
          disabled={item.disabled}
          title={item.title}
        >
          {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`${styles.container} ${className}`.trim()} ref={containerRef}>
      <div className={styles.triggerWrapper} onClick={handleToggle}>
        {trigger}
      </div>
      {isOpen && createPortal(menu, document.body)}
    </div>
  );
};
