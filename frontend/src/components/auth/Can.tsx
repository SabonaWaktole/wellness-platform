import { ReactNode } from 'react';
import { usePermission } from '../../hooks/usePermission';

interface CanProps {
  permission: string;
  children: ReactNode;
  /** Rendered instead when the permission is not held. Defaults to nothing. */
  fallback?: ReactNode;
}

/**
 * Conditionally renders a piece of UI by permission (FR-RBAC-07) — a button,
 * a panel section, a menu item's action. For whole routes, use
 * `RequirePermission` instead, which redirects rather than rendering nothing.
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const allowed = usePermission(permission);
  return <>{allowed ? children : fallback}</>;
}
