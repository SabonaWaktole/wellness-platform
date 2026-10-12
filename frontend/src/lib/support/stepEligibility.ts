import { useMemo } from 'react';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useAuthStore, type User } from '../../store/useAuthStore';
import type { GuideStep, PageGuide, PermissionScope, Requirement } from './types';

/**
 * Which steps of a guide apply to this user right now. Semantics copy
 * `usePermission` (a key is held when it is present) and `useNavigation` (the
 * workflow compare), so Support never disagrees with the menu, and never reads
 * `role`.
 */

export type EligibilityUser = Pick<User, 'permissions' | 'tenantSalesWorkflow'>;
export type Viewport = 'desktop' | 'mobile';

const SCOPE_RANK: Record<PermissionScope, number> = { OWN: 1, TEAM: 2, ALL: 3 };

/** The scope a key is held at; an unscoped capability (`true`) is as wide as it gets. */
const heldRank = (user: EligibilityUser | null, key: string): number => {
  const grant = user?.permissions?.[key];
  if (grant === undefined) return 0;
  return grant === true ? SCOPE_RANK.ALL : SCOPE_RANK[grant];
};

export function isStepEligible(step: Pick<GuideStep, 'requires'>, user: EligibilityUser | null, viewport: Viewport): boolean {
  const need: Requirement | undefined = step.requires;
  if (!need) return true;

  const minRank = SCOPE_RANK[need.minScope ?? 'OWN'];
  const keys = need.permission === undefined ? [] : [need.permission].flat();
  if (!keys.every((key) => heldRank(user, key) >= minRank)) return false;
  if (need.anyPermission && need.anyPermission.length > 0 && !need.anyPermission.some((key) => heldRank(user, key) >= minRank)) {
    return false;
  }

  if (need.workflow) {
    const workflow = user?.tenantSalesWorkflow === 'SALES_PROCESS' ? 'SALES_PROCESS' : 'LEGACY_QUOTATIONS';
    if (workflow !== need.workflow) return false;
  }
  return need.viewport === undefined || need.viewport === viewport;
}

/**
 * The guide's steps that apply to the signed in user, recomputed when their
 * permissions or workflow change (`GET /auth/me` refresh) or the viewport
 * crosses the tablet breakpoint.
 */
export function useEligibleSteps(guide: PageGuide | null): GuideStep[] {
  const permissions = useAuthStore((state) => state.user?.permissions);
  const permissionsVersion = useAuthStore((state) => state.user?.permissionsVersion);
  const tenantSalesWorkflow = useAuthStore((state) => state.user?.tenantSalesWorkflow);
  const isDesktop = useIsDesktop();

  return useMemo(() => {
    if (!guide) return [];
    const user: EligibilityUser = { permissions, tenantSalesWorkflow };
    const viewport: Viewport = isDesktop ? 'desktop' : 'mobile';
    return guide.steps.filter((step) => isStepEligible(step, user, viewport));
    // `permissionsVersion` changes exactly when `permissions` does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, permissions, permissionsVersion, tenantSalesWorkflow, isDesktop]);
}
