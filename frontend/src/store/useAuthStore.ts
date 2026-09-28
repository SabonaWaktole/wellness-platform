import { create } from 'zustand';

export type Role = 'SUPER_ADMIN' | 'BUSINESS_OWNER' | 'STAFF';

export interface User {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: Role;
  tenantId: string | null;
  tenantSlug: string | null;
  warehouseId?: string | null;
  /**
   * Profile and workspace media, returned by GET /auth/me. Held on the auth
   * user so the sidebar and header can render branding without their own
   * fetch. All optional — an account may simply have no image set.
   */
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  tenantCoverImageUrl?: string | null;
  /**
   * The workspace's money-formatting settings, returned by GET /auth/me on the
   * same call as the branding above. Held here so every page can format an
   * amount without its own settings fetch. Null for SUPER_ADMIN, who has no
   * tenant — see useMoneyFormat for how that case falls back.
   */
  tenantCurrency?: string | null;
  tenantLocale?: string | null;
  /**
   * Timezone decides which DAY an instant falls on — a correctness setting,
   * not a formatting one. See useDateFormat and utils/tenantDay.
   */
  tenantTimezone?: string | null;
  tenantDateFormat?: string | null;
  /**
   * Interface language, kept strictly separate from the formatting fields
   * above. `userLanguage` is null when the user has expressed no preference,
   * which means "follow the workspace default" — distinct from having chosen
   * English. See resolveLanguage.
   */
  userLanguage?: string | null;
  tenantDefaultLanguage?: string | null;
  /**
   * Slice 3 (FR-RBAC-07): `{ [permissionKey]: scope | true }`, from
   * `GET /auth/me`. The nav, route guards and `<Can>` all read from this —
   * never from `role`, which stays on the session only for the pieces of the
   * app RBAC hasn't reached yet (see RoleGuard on the SUPER_ADMIN routes).
   */
  permissions?: Record<string, 'OWN' | 'TEAM' | 'ALL' | true>;
  /**
   * Changes exactly when `permissions` does. `api/index.ts`'s response
   * interceptor watches `X-Permissions-Version` against this and triggers a
   * refetch of `/auth/me` when they disagree — the mechanism behind
   * FR-USR-03 ("a role change applies on the user's next page load").
   */
  permissionsVersion?: string | null;
}

/**
 * Set while a platform administrator is managing a client's workspace, having
 * entered it from the admin console.
 *
 * Kept alongside `user` rather than on it, because `user` describes the session
 * as every page already reads it — and during impersonation that session
 * deliberately reads as the workspace's BUSINESS_OWNER, which is the whole
 * point. This is the separate fact that the owner in question is not really an
 * employee of that business, and the only thing that renders the banner.
 */
export interface Impersonation {
  adminEmail: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
}

interface AuthState {
  user: User | null;
  impersonating: Impersonation | null;
  isAuthenticated: boolean;
  isInitializing: boolean;

  setUser: (user: User | null, impersonating?: Impersonation | null) => void;
  /**
   * Patches fields onto the CURRENT user mid-session — a profile edit, an
   * avatar upload, a settings save mirroring its result back onto the store.
   *
   * Deliberately distinct from `setUser`, which defaults `impersonating` to
   * null because establishing a session (login, /me on load, entering or
   * exiting a workspace) is exactly when a stale banner must not survive.
   * A field patch is not a new session: it fires while the existing one,
   * impersonation included, is still in effect, so `impersonating` is left
   * untouched. Using `setUser` here was the bug — every one of these calls
   * silently ended an in-progress impersonation the moment a Super Admin
   * saved a company or profile setting inside the workspace they'd entered.
   */
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
  setInitializing: (isInitializing: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  impersonating: null,
  isAuthenticated: false,
  isInitializing: true, // starts true until we check /me on app load

  // `impersonating` defaults to null rather than being left untouched when
  // omitted: every caller that sets a user is establishing a whole session, and
  // a stale banner surviving a re-login would misreport whose data is on screen.
  setUser: (user, impersonating = null) => set({ user, impersonating, isAuthenticated: !!user }),
  updateUser: (patch) =>
    set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),
  logout: () => set({ user: null, impersonating: null, isAuthenticated: false }),
  setInitializing: (isInitializing) => set({ isInitializing }),
}));
