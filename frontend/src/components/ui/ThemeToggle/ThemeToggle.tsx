import React from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../../../store/useThemeStore';
import type { ThemePreference } from '../../../store/useThemeStore';
import { DropdownMenu } from '../DropdownMenu/DropdownMenu';
import type { DropdownMenuItemType } from '../DropdownMenu/DropdownMenu';
import styles from './ThemeToggle.module.css';

// Keys rather than labels: the menu sits on the sign-in page, which is the
// first thing an Albanian visitor sees.
const OPTIONS: { id: ThemePreference; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'light', labelKey: 'theme.light', icon: <Sun size={16} /> },
  { id: 'dark', labelKey: 'theme.dark', icon: <Moon size={16} /> },
  { id: 'system', labelKey: 'theme.system', icon: <Monitor size={16} /> },
];

export interface ThemeToggleProps {
  /** Extra class for the trigger button, so layouts can match their icon buttons. */
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { t } = useTranslation('common');
  const preference = useThemeStore((state) => state.preference);
  const resolved = useThemeStore((state) => state.resolved);
  const setPreference = useThemeStore((state) => state.setPreference);

  const activeOption = OPTIONS.find((option) => option.id === preference) ?? OPTIONS[2];

  const items: DropdownMenuItemType[] = OPTIONS.map((option) => ({
    id: option.id,
    label: option.id === preference ? `${t(option.labelKey)} ✓` : t(option.labelKey),
    icon: option.icon,
    onClick: () => setPreference(option.id),
  }));

  return (
    <DropdownMenu
      align="right"
      header={t('theme.menuTitle')}
      items={items}
      trigger={
        <button
          type="button"
          className={`${styles.trigger} ${className}`}
          aria-label={t('theme.triggerLabel', { current: t(activeOption.labelKey) })}
        >
          {/* Show what is actually rendered, not the preference, so "system" reads correctly. */}
          {resolved === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      }
    />
  );
};
