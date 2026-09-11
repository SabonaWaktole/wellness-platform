import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
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
  const menuId = useId();
  /*
   * Which enabled item has the roving focus. `-1` means the menu was opened by
   * pointer and nothing should be pulled off the trigger yet; the arrow keys
   * move it from there.
   */
  const [focused, setFocused] = useState(-1);
  /** The trigger element, focused again when the menu closes. */
  const triggerFocusRef = useRef<HTMLElement | null>(null);

  const focusable = items.filter((item) => !item.disabled);

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

    /*
     * THE SAME KEYBOARD THE RIGHT-CLICK MENU HAS.
     *
     * `ui/ContextMenu` has had roving arrow-key focus, Home/End, Tab-to-close
     * and focus restoration since it was written; this menu — which is second
     * in the builder's tab order and the first menu any keyboard user meets —
     * had only Escape. A menu a keyboard user can open and then not move
     * around in is worse than one they cannot open at all.
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      if (event.key === 'Tab') {
        setIsOpen(false);
        return;
      }
      if (focusable.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocused((i) => (i + 1) % focusable.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocused((i) => (i <= 0 ? focusable.length : i) - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setFocused(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setFocused(focusable.length - 1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, focusable.length]);

  /** Moves real DOM focus to whichever enabled item is current. */
  useEffect(() => {
    if (!isOpen || focused < 0) return;
    menuRef.current
      ?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')
      ?.[focused]?.focus();
  }, [isOpen, focused]);

  /**
   * Returns focus to the trigger when the menu closes, so dismissing does not
   * strand a keyboard user on <body> with no way back to where they were.
   *
   * Restores to the TRIGGER rather than to whatever happened to have focus
   * when the menu opened: a menu opened by pointer may have been opened from
   * nowhere in particular, and "back to the control you just used" is the
   * answer in both cases. `wasOpen` keeps this from firing on mount.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      setFocused(-1);
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    (triggerFocusRef.current ?? containerRef.current?.querySelector('button'))?.focus?.();
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
      id={menuId}
      role="menu"
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
          role="menuitem"
          // Roving tabindex: the menu is one tab stop, arrows move within it.
          tabIndex={-1}
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

  /*
   * THE TRIGGER ITSELF CARRIES THE STATE.
   *
   * The click handler used to sit on the wrapping <div>, with the trigger
   * inside it as inert markup — so the control announced itself as an ordinary
   * button with no hint that it opens anything, and nothing ever said whether
   * it was open. Cloned rather than wrapped so `aria-haspopup` and
   * `aria-expanded` land on the element a screen reader actually reports,
   * composing with whatever onClick the caller already gave it.
   */
  const triggerNode = React.isValidElement(trigger)
    ? React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
        'aria-haspopup': 'menu',
        'aria-expanded': isOpen,
        'aria-controls': isOpen ? menuId : undefined,
        onClick: (event: React.MouseEvent) => {
          (trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>).props.onClick?.(
            event
          );
          handleToggle();
        },
      })
    : trigger;

  return (
    <div className={`${styles.container} ${className}`.trim()} ref={containerRef}>
      {/* The wrapper keeps its own handler only for a trigger that is not a
          real element and so could not be cloned. */}
      <div
        ref={(node) => {
          triggerFocusRef.current = node?.querySelector('button') ?? null;
        }}
        className={styles.triggerWrapper}
        onClick={React.isValidElement(trigger) ? undefined : handleToggle}
      >
        {triggerNode}
      </div>
      {isOpen && createPortal(menu, document.body)}
    </div>
  );
};
