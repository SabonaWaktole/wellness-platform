import { ChevronRight } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '../../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../../components/layout/Sidebar/Sidebar';
import { SettingsLayout } from '../../../components/layout/SettingsLayout/SettingsLayout';
import { useAuthStore } from '../../../store/useAuthStore';
import { useLogout } from '../../../hooks/useLogout';
import { useNavigation } from '../../../hooks/useNavigation';
import { RolesSettingsContent } from './RolesSettingsContent';
import { getUserDisplayName } from '../../../utils/userUtils';

export const RolesSettingsPage = () => {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();
  const { logout } = useLogout();
  const location = useLocation();
  const navItems = useNavigation(user, location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userName = getUserDisplayName(user, 'Settings User');

  const handleNavClick = (id: string) => {
    navigate(`/${tenantSlug || ''}/${id === 'dashboard' ? '' : id}`);
  };

  return (
    <AppLayout
      userName={userName}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={
        <Sidebar 
          navItems={navItems} 
          onLogoutClick={handleLogout}
          onNavItemClick={handleNavClick}
        />
      }
    >
      <SettingsLayout activeNavId="roles">
        <div style={{ maxWidth: '1120px', margin: '0 auto', width: '100%' }}>
          
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-size-label-sm)', marginBottom: 'var(--spacing-xs)' }}>
              <ol style={{ display: 'flex', alignItems: 'center', listStyle: 'none', padding: 0, margin: 0, gap: '8px' }}>
                <li><a href="#settings" onClick={(e) => { e.preventDefault(); navigate(`/${tenantSlug}/settings/profile`); }} style={{ color: 'inherit', textDecoration: 'none' }}>{t('breadcrumb')}</a></li>
                <li><ChevronRight size={14} /></li>
                <li aria-current="page" style={{ color: 'var(--color-on-surface)', fontWeight: 600 }}>{t('roles.breadcrumb')}</li>
              </ol>
            </nav>
          </div>

          <RolesSettingsContent />

        </div>
      </SettingsLayout>
    </AppLayout>
  );
};
