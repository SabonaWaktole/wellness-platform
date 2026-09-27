import React, { useState } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { Search, HelpCircle, Settings, LogOut, Menu, X } from 'lucide-react';
import { Avatar } from '../../ui/Avatar/Avatar';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { DropdownMenu } from '../../ui/DropdownMenu/DropdownMenu';
import type { DropdownMenuItemType } from '../../ui/DropdownMenu/DropdownMenu';
import { useAuthStore } from '../../../store/useAuthStore';
import { resolveMediaUrl, srcSetFor } from '../../../services/mediaService';
import styles from './AppLayout.module.css';
import { NotificationBell } from '../../notifications/NotificationBell';
import { ImpersonationBanner } from '../ImpersonationBanner';
import { BrandLogo } from '../BrandLogo';
import { usePageTitle } from '../../../hooks/usePageTitle';
import { useTranslation } from 'react-i18next';

export interface AppLayoutProps {
  children: ReactNode;
  sidebar?: ReactElement<any>; // Changed to ReactElement to clone
  userAvatarSrc?: string;
  userName?: string;
  onLogout?: () => void;
  onSettingsClick?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  sidebar,
  userAvatarSrc,
  userName = 'User',
  onLogout,
  onSettingsClick,
}) => {
  const { t } = useTranslation('common');
  usePageTitle();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // The header avatar comes from the signed-in user unless a caller passes an
  // explicit override. Reading it here rather than in each page means the
  // photo updates everywhere the moment it is changed in settings — and it is
  // why no page needs to pass `userAvatarSrc` at all.
  const currentUser = useAuthStore((state) => state.user);
  const avatarSrc = userAvatarSrc ?? resolveMediaUrl(currentUser?.avatarUrl);
  const avatarSrcSet = userAvatarSrc ? undefined : srcSetFor(currentUser?.avatarUrl);

  const profileItems: DropdownMenuItemType[] = [
    ...(onSettingsClick
      ? [{ id: 'settings', label: t('header.settings'), icon: <Settings size={18} />, onClick: onSettingsClick }]
      : []),
    ...(onLogout
      ? [{ id: 'logout', label: t('actions.logOut'), icon: <LogOut size={18} />, onClick: onLogout, danger: true }]
      : []),
  ];

  return (
    <div className={styles.layout}>
      {/*
        Mounted here rather than in a shell so it covers every page of an
        entered workspace, not just the dashboard. It pins itself to the bottom
        edge, so its position in this tree does not matter. Renders nothing for
        an ordinary session.
      */}
      <ImpersonationBanner />

      {/* Top App Bar */}
      <header className={`${styles.header} glass`}>
        <div className={styles.headerLeft}>
          <button 
            className={`${styles.iconBtn} ${styles.menuBtn}`} 
            onClick={() => setIsSidebarOpen(true)}
            aria-label={t('header.openMenu')}
          >
            <Menu size={24} />
          </button>
          {/* The full lockup does not fit beside the header controls on a phone. */}
          <BrandLogo collapseBelow={520} className={styles.brand} />
        </div>
        
        <div className={styles.headerCenter}>
          <Search className={styles.searchIcon} size={18} />
          <input
            type="text"
            placeholder={t('header.searchPlaceholder')}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.headerRight}>
          <button
            className={`${styles.iconBtn} ${styles.mobileSearchBtn}`}
            aria-label={t('header.search')}
            onClick={() => setIsMobileSearchOpen((prev) => !prev)}
          >
            {isMobileSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
          <ThemeToggle className={styles.iconBtn} />
          {/*
            Was a dead <button> with a bell icon and no handler — a control that
            looked live and did nothing, the TD-020 family. It is now the real
            notification bell.
          */}
          <NotificationBell />
          <button className={`${styles.iconBtn} ${styles.helpBtn}`} aria-label={t('header.help')}>
            <HelpCircle size={20} />
          </button>
          <DropdownMenu
            align="right"
            trigger={
              <button className={styles.profileBtn} aria-label={t('header.userProfile')}>
                <Avatar
                  src={avatarSrc}
                  srcSet={avatarSrcSet}
                  fallback={userName.charAt(0).toUpperCase()}
                  size="sm"
                  alt={t('header.profileAlt', { name: userName })}
                />
              </button>
            }
            items={profileItems}
            header={userName}
          />
        </div>
      </header>

      {isMobileSearchOpen && (
        <div className={styles.mobileSearchBar}>
          <Search className={styles.searchIcon} size={18} />
          <input
            type="text"
            placeholder={t('header.searchPlaceholder')}
            className={styles.searchInput}
            autoFocus
          />
        </div>
      )}

      <div className={styles.contentArea}>
        {/* Sidebar injected here */}
        {sidebar && React.cloneElement(sidebar, {
          isOpen: isSidebarOpen,
          onClose: () => setIsSidebarOpen(false)
        })}
        
        {/* Main Content Area */}
        <main className={styles.mainContent}>
          {children}
        </main>
      </div>
    </div>
  );
};
