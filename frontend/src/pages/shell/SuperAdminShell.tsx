import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUserDisplayName } from '../../utils/userUtils';
import { AppLayout } from '../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../components/layout/Sidebar/Sidebar';
import { SupportHostLazy } from '../../components/support/SupportHostLazy';
import { useAuthStore } from '../../store/useAuthStore';
import { useLogout } from '../../hooks/useLogout';
import { useNavigation } from '../../hooks/useNavigation';
import { SuperAdminDashboard } from '../dashboard/SuperAdminDashboard';
import { TenantsPage } from '../admin/TenantsPage';
import { PeoplePage } from '../admin/PeoplePage';
import { PlatformSettingsPage } from '../admin/PlatformSettingsPage';
import { AdminProfilePage } from '../admin/AdminProfilePage';

export const SuperAdminShell = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  useParams();
  const { user } = useAuthStore();
  const { logout } = useLogout();
  const location = useLocation();

  const navItemsWithActiveState = useNavigation(user, location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/login'); // Super Admin login is at root
  };

  const userName = getUserDisplayName(user);

  /*
    Not a nested <Routes>: this shell is mounted directly by several
    exact-path entries in routes/index.tsx (/admin/dashboard, /admin/tenants,
    ...), none of which end in "*". A descendant <Routes> only receives a
    matchable "remaining path" from an ancestor splat route, so without one it
    resolved every one of its <Route>s to a non-match and rendered nothing —
    the sidebar and header came from AppLayout, but the page body was always
    blank. Switching on the pathname directly needs no splat.
  */
  let page: ReactNode;
  switch (location.pathname) {
    case '/admin':
      page = <Navigate to="/admin/dashboard" replace />;
      break;
    case '/admin/dashboard':
      page = <SuperAdminDashboard />;
      break;
    case '/admin/tenants':
      page = <TenantsPage />;
      break;
    case '/admin/people':
      page = <PeoplePage />;
      break;
    case '/admin/setting':
      page = <PlatformSettingsPage />;
      break;
    case '/admin/profile':
      page = <AdminProfilePage />;
      break;
    default:
      page = <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <>
      <AppLayout
        userName={userName}
        onLogout={handleLogout}
        // The header dropdown's "Settings" mirrors the other shells, where it opens
        // the signed-in user's own profile — not /admin/setting, which is the
        // platform-wide configuration page reached from the sidebar instead.
        onSettingsClick={() => navigate('/admin/profile')}
        sidebar={
          <Sidebar 
            orgName={t('shell.platformName')}
            orgTier={t('shell.platformTier')}
            navItems={navItemsWithActiveState}
            /*
              No :tenantSlug segment, unlike StaffShell and BusinessOwnerShell —
              correctly, because a platform-level role has no tenant context. The
              shell is mounted at /admin, so ids resolve to /admin/<id> and stay
              inside it. Previously this navigated to bare `/${id}`, which matched
              the top-level /:tenantSlug route with a slug of "clients". TD-008.
            */
            onNavItemClick={(id) => navigate(`/admin/${id}`)}
            onLogoutClick={handleLogout}
          />
        }
      >
        {page}
      </AppLayout>
    {/* Shared by all six /admin routes, so routes/index.tsx stays unchanged. */}
    <SupportHostLazy />
    </>
  );
};
