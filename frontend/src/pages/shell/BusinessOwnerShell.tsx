import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getUserDisplayName } from '../../utils/userUtils';
import { AppLayout } from '../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../components/layout/Sidebar/Sidebar';
import { useAuthStore } from '../../store/useAuthStore';
import { useLogout } from '../../hooks/useLogout';
import { useNavigation } from '../../hooks/useNavigation';
import { BusinessOwnerDashboard } from '../dashboard/BusinessOwnerDashboard';

export const BusinessOwnerShell = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();
  const { logout } = useLogout();
  const location = useLocation();

  const navItemsWithActiveState = useNavigation(user, location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userName = getUserDisplayName(user);

  return (
    <AppLayout
      userName={userName}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={
        <Sidebar 
          navItems={navItemsWithActiveState} 
          onNavItemClick={(id) => navigate(`/${tenantSlug}/${id}`)}
          onLogoutClick={handleLogout}
        />
      }
    >
      <BusinessOwnerDashboard />
    </AppLayout>
  );
};
