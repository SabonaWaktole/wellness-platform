import {
  LayoutDashboard, Users, Calendar, Package, FileText, BarChart3,
  Settings, Building, CreditCard, Search, ClipboardCheck, Plus,
  HelpCircle, LogOut, Receipt, FileSignature, Columns3,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../../ui/Button/Button';
import { useAuthStore } from '../../../store/useAuthStore';
import { resolveMediaUrl, srcSetFor } from '../../../services/mediaService';
import { PRODUCT_NAME } from '../../../constants/brand';
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
  // The sales pipeline: columns of cards, as the board shows it.
  pipeline: Columns3,
};

export interface NavItem {
  id: string;
  path?: string;
  label: string;
  icon: string;
  isActive?: boolean;
}

export interface SidebarProps {
  /**
   * Heading for the organisation block. Defaults to the signed-in workspace's
   * own name; only the platform console, which has no workspace, passes one.
   */
  orgName?: string;
  /** Caption under the heading. Shown only when given. */
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
  /*
   * The workspace's own name, from the session, so every page shows the same
   * heading without passing it. Pages used to pass the URL slug here, with a
   * SaaS subscription tier ("Enterprise Tier") as the caption. The product
   * name covers the moment before the session has loaded.
   */
  const tenantName = useAuthStore((state) => state.user?.tenantName);
  const heading = orgName ?? tenantName ?? PRODUCT_NAME;
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
          <h2 className={styles.orgName}>{heading}</h2>
          {orgTier && <p className={styles.orgTier}>{orgTier}</p>}
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
