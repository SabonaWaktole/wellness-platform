import { apiClient } from '../api';

export const authService = {
  login: async (email: string, password: string, tenantSlug: string | null) => {
    const url = tenantSlug ? `/${tenantSlug}/auth/login` : '/auth/login';
    const response = await apiClient.post(url, { email, password });
    return response.data;
  },

  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data.user ?? null;
  },

  /**
   * The full session, including whether it is a platform administrator managing
   * someone else's workspace.
   *
   * Separate from `getMe` above so the many callers that only want the user are
   * not made to care. Used by session bootstrap, which is the one place that has
   * to know — the banner must survive a page reload, not just appear right after
   * the Manage click.
   */
  getSession: async (): Promise<{ user: any | null; impersonating: any | null }> => {
    const response = await apiClient.get('/auth/me');
    return {
      user: response.data.user ?? null,
      impersonating: response.data.impersonating ?? null,
    };
  },

  /** Leave a workspace entered from the admin console, back to the platform session. */
  exitWorkspace: async () => {
    await apiClient.post('/auth/exit-workspace');
  },

  updateProfile: async (data: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string; language?: string | null }) => {
    const response = await apiClient.put('/auth/me', data);
    return response.data;
  },

  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    const response = await apiClient.put('/auth/me/password', data);
    return response.data;
  },

  logout: async () => {
    // Nothing to clear client-side; the backend clears the httpOnly cookie.
    await apiClient.post('/auth/logout');
  },

  requestPasswordReset: async (email: string) => {
    await apiClient.post('/auth/password-reset/request', { email });
  },

  resetPassword: async (token: string, newPassword: string) => {
    await apiClient.post('/auth/password-reset/reset', { token, newPassword });
  },

  /*
   * `registerBusiness` lived here and posted to /auth/register. Public
   * self-signup was removed — a workspace is provisioned only by a platform
   * administrator, through `dashboardService.createTenant`.
   */

  acceptInvitation: async (data: {
    token: string;
    newPassword: string;
  }) => {
    const response = await apiClient.post('/auth/invitations/accept', data);
    return response.data;
  },
};
