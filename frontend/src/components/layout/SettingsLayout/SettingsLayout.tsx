import React from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../store/useAuthStore';
import { User, Building2, Sliders, UsersRound, ShieldCheck, Puzzle, PackageOpen, FolderTree, Bell, History, ListChecks, Palette, Calculator, ScrollText, FileText, HeartPulse } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './SettingsLayout.module.css';

export interface SettingsLayoutProps {
  children: ReactNode;
  activeNavId: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Undefined means always shown to a tenant user (the profile page). A list means any one of them. */
  permission?: string | string[];
  /** When set, the permission must be held at this scope, not merely held (see `warehouses`/`categories`). */
  minScope?: 'ALL';
}

export const SettingsLayout: React.FC<SettingsLayoutProps> = ({
  children,
  activeNavId,
}) => {
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();
  const { t } = useTranslation('settings');
  const permissions = user?.permissions ?? {};

  const navItems: NavItem[] = [
    { id: 'profile', label: t('nav.profile'), icon: User },
    { id: 'company', label: t('nav.company'), icon: Building2, permission: 'settings.manage' },
    { id: 'client-management', label: t('nav.clientManagement'), icon: Sliders, permission: 'settings.manage' },
    // activityResults.manage reaches the activity results list (M2 Slice 7, FR-ACT-03).
    { id: 'lists', label: t('nav.lists'), icon: ListChecks, permission: ['settings.manage', 'activityResults.manage'] },
    { id: 'statuses', label: t('nav.statuses'), icon: Palette, permission: 'settings.manage' },
    { id: 'contracts', label: t('nav.contracts'), icon: FileText, permission: 'settings.manage' },
    // The Administrator edits it; members.view / members.verify reach the read-only benefit table (M4 Slice 3, FR-BEN-04).
    { id: 'wellness-plus', label: t('nav.wellnessPlus'), icon: HeartPulse, permission: ['wellnessplus.settings.manage', 'members.view', 'members.verify'] },
    { id: 'pricing', label: t('nav.pricing'), icon: Calculator, permission: 'pricing.manage' },
    { id: 'sales-script', label: t('nav.salesScript'), icon: ScrollText, permission: 'script.edit' },
    // Next to Company because it is workspace-wide policy, not a personal
    // preference — the page itself requires settings.manage for the same reason.
    { id: 'notifications', label: t('nav.notifications'), icon: Bell, permission: 'settings.manage' },
    { id: 'team', label: t('nav.team'), icon: UsersRound, permission: 'users.manage' },
    { id: 'roles', label: t('nav.roles'), icon: ShieldCheck, permission: 'roles.manage' },
    { id: 'audit', label: t('nav.audit'), icon: History, permission: 'audit.view' },
    { id: 'integrations', label: t('nav.integrations'), icon: Puzzle, permission: 'integrations.manage' },
    // Creating/editing a warehouse or category needs ALL, not merely a grant —
    // Sales User holds inventory.manage at OWN (their own warehouse, see the
    // deviation noted on DEFAULT_ROLE_MATRIX), which reads products but not
    // this management screen.
    { id: 'warehouses', label: t('nav.warehouses'), icon: PackageOpen, permission: 'inventory.manage', minScope: 'ALL' },
    { id: 'categories', label: t('nav.categories'), icon: FolderTree, permission: 'inventory.manage', minScope: 'ALL' },
  ];

  const visibleItems = navItems.filter((item) => {
    if (!item.permission) return true;
    const keys = Array.isArray(item.permission) ? item.permission : [item.permission];
    return keys.some((key) => {
      const grant = permissions[key];
      if (grant === undefined) return false;
      return item.minScope ? grant === item.minScope : true;
    });
  });
  const showSidebar = visibleItems.some((item) => item.id !== 'profile');

  return (
    <div className={styles.layout}>
      {/* Left Sidebar for Settings (tablet and up) */}
      {showSidebar && (
        <aside className={styles.sidebar}>
          <h2 className={styles.title}>{t('nav.title')}</h2>
          <nav className={styles.nav}>
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNavId === item.id;
              const itemClasses = [
                styles.navItem,
                isActive ? styles.navItemActive : ''
              ].filter(Boolean).join(' ');

              return (
                <Link
                  key={item.id}
                  to={`/${tenantSlug}/settings${item.id === 'company' ? '' : `/${item.id}`}`}
                  className={itemClasses}
                >
                  <Icon className={styles.navIcon} size={20} />
                  <span className={styles.navLabel}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      )}

      {/* Horizontal scrollable tab bar (mobile only) */}
      {showSidebar && (
        <nav className={styles.mobileNav}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNavId === item.id;
            const itemClasses = [
              styles.mobileNavItem,
              isActive ? styles.mobileNavItemActive : ''
            ].filter(Boolean).join(' ');

            return (
              <Link
                key={item.id}
                to={`/${tenantSlug}/settings${item.id === 'company' ? '' : `/${item.id}`}`}
                className={itemClasses}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Right Content Area */}
      <main className={styles.content}>
        {children}
      </main>
    </div>
  );
};
