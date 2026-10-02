import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { SalesScriptPanelHost } from '../components/panels/SalesScriptPanel/SalesScriptPanel';

export const TenantGuard = () => {
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();

  // In a real app, the token stores tenantId. We'd either look up the slug from context
  // or the backend would return tenantSlug in the token. For this test/mock we assume
  // tenantId in the user matches the slug for simplicity, or we have a map.
  // Assuming our mock token sets tenantId to the slug directly for simplicity,
  // or we add tenantSlug to the User interface. Let's assume tenantId === tenantSlug for tests.
  
  // If the user's tenantSlug doesn't match the slug in the URL, block them.
  if (user && user.role !== 'SUPER_ADMIN' && user.tenantSlug !== tenantSlug) {
    return <Navigate to="/unauthorized" replace />;
  }

  // The sales script panel sits beside the pages, not in them: every page
  // mounts its own AppLayout, but this route stays mounted while the user
  // moves between pages, so the panel stays open where it was (FR-SCR-02).
  return (
    <>
      <Outlet />
      <SalesScriptPanelHost />
    </>
  );
};
