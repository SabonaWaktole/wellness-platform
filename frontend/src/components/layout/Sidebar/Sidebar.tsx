import {
  LayoutDashboard, Users, Calendar, Package, FileText, BarChart3,
  Settings, Building, CreditCard, Search, ClipboardCheck, Plus,
  HelpCircle, LogOut, Receipt, FileSignature,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../../ui/Button/Button';
import { useAuthStore } from '../../../store/useAuthStore';
import { resolveMediaUrl, srcSetFor } from '../../../services/mediaService';
import styles from './Sidebar.module.css';
import { useTranslation } from 'react-i18next';

// Map material-symbols icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  group: Users,
  event: Calendar,
  inventory_2: Package,
  description: FileText,
  receipt_long: Receipt,
  bar_chart: BarChart3,
  settings: Settings,
  settings_applications: Settings,
  domain: Building,
  credit_card: CreditCard,
  manage_search: Search,
  task_alt: ClipboardCheck,
  // Contracts. A signed page rather than another document icon, so it reads as
  // distinct from quotations (description) and invoices (receipt_long) in the
  // same stack.
  contract: FileSignature,
};

export interface NavItem {
  id: string;
  path?: string;
  label: string;
  icon: string;
  isActive?: boolean;
}

export interface SidebarProps {
  orgName: string;
  orgTier?: string;
  navItems: NavItem[];
  isOpen?: boolean;
  onClose?: () => void;
  onNavItemClick?: (id: string) => void;
  onNewEntryClick?: () => void;
  onLogoutClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  orgName,
  orgTier,
  navItems,
  isOpen = false,
  onClose,
  onNavItemClick,
  onNewEntryClick,
  onLogoutClick,
}) => {
  const { t } = useTranslation('common');
  // Defaulted here rather than in the parameter list: a default parameter is
  // evaluated per render but written in English, so it has to be a lookup, and
  // `t` is not in scope until the component body has started.
  const tier = orgTier ?? t('shell.standardTier');
  const tenantLogoUrl = useAuthStore((state) => state.user?.tenantLogoUrl);
  const logoSrc = resolveMediaUrl(tenantLogoUrl);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div className={styles.backdrop} onClick={onClose} />
      )}
      <nav className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
      <div className={styles.orgSection}>
        {/*
          The workspace logo replaces the generic building glyph once one has
          been uploaded. Read from the auth store so it appears on every screen
          without each page having to pass it down.
        */}
        <div className={styles.orgIcon}>
          {logoSrc ? (
            <img
              className={styles.orgLogo}
              src={logoSrc}
              srcSet={srcSetFor(tenantLogoUrl)}
              alt=""
              onError={(event) => {
                // Fall back to the glyph if the stored file has gone.
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Building size={20} />
          )}
        </div>
        <div className={styles.orgInfo}>
          <h2 className={styles.orgName}>{orgName}</h2>
          <p className={styles.orgTier}>{tier}</p>
        </div>
      </div>

      <div className={styles.actionSection}>
        <Button 
          variant="primary" 
          fullWidth 
          icon={<Plus size={18} />}
          onClick={onNewEntryClick}
        >
          {t('actions.newEntry')}
        </Button>
      </div>

      <div className={styles.navSection}>
        {navItems.map((item) => {
          const IconComponent = iconMap[item.icon] || LayoutDashboard;
          return (
            <a
              key={item.id}
              className={`${styles.navItem} ${item.isActive ? styles.navItemActive : ''}`}
              onClick={(e) => {
                e.preventDefault();
                if (onNavItemClick) onNavItemClick(item.path || item.id);
              }}
              href={`#${item.path || item.id}`}
            >
              <IconComponent className={styles.navIcon} size={20} />
              <span className={styles.navLabel}>{item.label}</span>
            </a>
          );
        })}
      </div>

      <div className={styles.bottomSection}>
        <a 
          className={styles.navItem} 
          href="#support"
          onClick={(e) => e.preventDefault()}
        >
          <HelpCircle className={styles.navIcon} size={20} />
          <span className={styles.navLabel}>{t('actions.support')}</span>
        </a>
        <a 
          className={`${styles.navItem} ${styles.logoutItem}`} 
          href="#logout"
          onClick={(e) => {
            e.preventDefault();
            if (onLogoutClick) onLogoutClick();
          }}
        >
          <LogOut className={styles.navIcon} size={20} />
          <span className={styles.navLabel}>{t('actions.logOut')}</span>
        </a>
      </div>
    </nav>
    </>
  );
};
