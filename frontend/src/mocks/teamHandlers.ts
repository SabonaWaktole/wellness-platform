import { http, HttpResponse } from 'msw';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * The tenant staff list.
 *
 * Added because several components now fetch it that previously did not:
 * `AppointmentForm` (TD-022, which replaced three invented staff options with
 * the real list) and `QuotationDetailContent` (TD-021, which resolves stored
 * userIds to names). Without a handler those suites still passed, but each
 * logged an unhandled-request error and a "Failed to fetch staff" axios
 * failure — noise that would mask a genuine request problem later.
 *
 * Deliberately includes a deactivated member: assignee dropdowns must exclude
 * them, and the Team Settings list must show them with a badge, so the default
 * fixture should exercise both rather than only the happy shape.
 */
export const mockRoles = [
  { id: 'r-sales', key: 'SALES_USER', nameSq: 'Përdorues Shitjesh', nameEn: 'Sales User', isSystem: true },
  { id: 'r-manager', key: 'SALES_MANAGER', nameSq: 'Menaxher Shitjesh', nameEn: 'Sales Manager', isSystem: true },
  { id: 'r-reception', key: 'RECEPTION', nameSq: 'Recepsion', nameEn: 'Reception', isSystem: true },
  { id: 'r-admin', key: 'ADMINISTRATOR', nameSq: 'Administrator', nameEn: 'Administrator', isSystem: true },
  { id: 'r-ceo', key: 'CEO', nameSq: 'CEO', nameEn: 'CEO', isSystem: true },
];

const withRole = (roleId: string) => {
  const role = mockRoles.find((r) => r.id === roleId)!;
  return { roleId, roleKey: role.key, roleNameSq: role.nameSq, roleNameEn: role.nameEn };
};

export const mockStaff = [
  { id: 'u1', email: 'ada@example.com', role: 'BUSINESS_OWNER', ...withRole('r-admin'), firstName: 'Ada', lastName: 'Lovelace', isActive: true },
  { id: 'u2', email: 'grace@example.com', role: 'STAFF', ...withRole('r-sales'), firstName: 'Grace', lastName: 'Hopper', isActive: true },
  { id: 'u3', email: 'alan@example.com', role: 'STAFF', ...withRole('r-sales'), firstName: 'Alan', lastName: 'Turing', isActive: false },
];

export const teamHandlers = [
  http.get(`${API_URL}/:tenantSlug/auth/staff`, () =>
    HttpResponse.json({ items: mockStaff })
  ),

  http.get(`${API_URL}/:tenantSlug/auth/invitations`, () => HttpResponse.json([])),

  http.get(`${API_URL}/:tenantSlug/auth/roles`, () => HttpResponse.json({ roles: mockRoles })),

  http.get(`${API_URL}/:tenantSlug/auth/staff/:id/deactivation-impact`, () =>
    HttpResponse.json({ clients: 0, upcomingAppointments: 0, openContracts: 0, companies: [] })
  ),
];

/**
 * Notifications. Empty by default so a suite that merely renders a screen
 * containing the bell does not have to care; tests that exercise the list
 * override this with `server.use(...)`.
 */
export const notificationHandlers = [
  http.get(`${API_URL}/:tenantSlug/notifications`, () =>
    HttpResponse.json({ items: [], unreadCount: 0 })
  ),
  http.patch(`${API_URL}/:tenantSlug/notifications/read-all`, () =>
    HttpResponse.json({ updated: 0 })
  ),
  http.patch(`${API_URL}/:tenantSlug/notifications/:id/read`, () =>
    HttpResponse.json({ message: 'Notification marked read' })
  ),
];
