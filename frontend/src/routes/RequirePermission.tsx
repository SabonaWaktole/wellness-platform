import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

interface RequirePermissionProps {
  children: React.ReactNode;
  /** A list lets the route through on any one of its keys. */
  permission: string | string[];
}

/**
 * The tenant-route counterpart to `RoleGuard` (FR-RBAC-05, 07). `RoleGuard`
 * stays only on the SUPER_ADMIN-only `/admin/*` routes, which sit outside
 * the permission system entirely (D2). Every tenant route reads a permission
 * from `user.permissions`, never `user.role`.
 */
export const RequirePermission = ({ children, permission }: RequirePermissionProps) => {
  const { user } = useAuthStore();

  const keys = Array.isArray(permission) ? permission : [permission];
  if (!user || !keys.some((key) => user.permissions?.[key] !== undefined)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
