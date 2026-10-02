import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../components/layout/Sidebar/Sidebar';
import { useAuthStore } from '../../store/useAuthStore';
import { useLogout } from '../../hooks/useLogout';
import { useNavigation } from '../../hooks/useNavigation';
import { getUserDisplayName } from '../../utils/userUtils';

/**
 * The application shell around every deals screen: the board, the list, the
 * deal page and its form (M2 Slice 6). One wrapper rather than one copy per
 * screen; each route passes its content.
 */
export const DealsPage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  return (
    <AppLayout
      userName={getUserDisplayName(user, 'Business Owner')}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={
        <Sidebar
          navItems={navItems}
          onLogoutClick={handleLogout}
          onNavItemClick={(id) => navigate(`/${tenantSlug || ''}/${id === 'dashboard' ? '' : id}`)}
        />
      }
    >
      {children}
    </AppLayout>
  );
};
