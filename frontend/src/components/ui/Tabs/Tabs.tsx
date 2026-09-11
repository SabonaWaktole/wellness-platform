import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  /** Optional count rendered as a subtle pill beside the label. */
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  /**
   * Shared prefix for the generated tab and panel ids. Pass it when the PANEL
   * is rendered by the caller rather than here, so `aria-controls` can point at
   * an element that actually exists — without it the ids are internal and the
   * reference dangles.
   */
  idBase?: string;
  tabs: TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  /** Accessible name for the tab list. */
  label?: string;
  className?: string;
}

/**
 * Accessible tab list following the WAI-ARIA tabs pattern: roving tabindex,
 * arrow-key navigation, and Home/End support. Panels are rendered by the
 * caller; pass `panelId` through `aria-controls` if you render one.
 */
export function Tabs<T extends string = string>({
  idBase,
  tabs,
  activeId,
  onChange,
  label = 'Tabs',
  className = '',
}: TabsProps<T>) {
  const generatedId = useId();
  const baseId = idBase ?? generatedId;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const enabledTabs = tabs.filter((tab) => !tab.disabled);

  const focusTab = (id: T) => {
    onChange(id);
    // Move focus with selection, as the ARIA tabs pattern expects.
    requestAnimationFrame(() => tabRefs.current[id]?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const currentIndex = enabledTabs.findIndex((tab) => tab.id === activeId);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % enabledTabs.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = enabledTabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    focusTab(enabledTabs[nextIndex].id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={[styles.tabList, className].filter(Boolean).join(' ')}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`${baseId}-panel-${tab.id}`}
            // Roving tabindex: only the active tab is in the tab order.
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            className={[styles.tab, isActive ? styles.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon && <span className={styles.tabIcon}>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className={styles.count}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
