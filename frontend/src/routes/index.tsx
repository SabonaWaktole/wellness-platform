import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from '../pages/auth/LoginPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { StaffInvitationPage } from '../pages/auth/StaffInvitationPage';
import { BusinessOwnerShell } from '../pages/shell/BusinessOwnerShell';
import { StaffShell } from '../pages/shell/StaffShell';
import { SuperAdminShell } from '../pages/shell/SuperAdminShell';
import { AccountSettingsPage } from '../pages/settings/AccountSettingsPage';
import { ReportsPage } from '../pages/ReportsPage';
import { ClientListPage } from '../pages/clients/ClientListPage';
import { ClientDetailPage } from '../pages/clients/ClientDetailPage';
import { ClientFormPage } from '../pages/clients/ClientFormPage';
import { AppointmentsPage } from '../pages/appointments/AppointmentsPage';
import { EditAppointmentPage } from '../pages/appointments/EditAppointmentPage';
import { CreateAppointmentPage } from '../pages/appointments/CreateAppointmentPage';
import { ClientSettingsPage } from '../pages/settings/ClientSettingsPage';
import { TeamSettingsPage } from '../pages/settings/team/TeamSettingsPage';
import { ProfilePage } from '../pages/settings/profile/ProfilePage';
import { AcceptInvitationPage } from '../pages/auth/AcceptInvitationPage';
import { InventoryList } from '../pages/inventory/InventoryList';
import { ProductForm } from '../pages/inventory/ProductForm/ProductForm';
import { WarehouseList } from '../pages/inventory/WarehouseList/WarehouseList';
import { CategoryList } from '../pages/inventory/CategoryList/CategoryList';
import { QuotationList } from '../pages/quotations/QuotationList';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { QuotationDetail } from '../pages/quotations/QuotationDetail';
import { PublicQuotationPage } from '../pages/quotations/PublicQuotationPage';
import { NotificationSettingsPage } from '../pages/settings/NotificationSettingsPage';
import { CreateQuotation } from '../pages/quotations/CreateQuotation';
import { EditQuotation } from '../pages/quotations/EditQuotation';
import { InvoiceList } from '../pages/invoices/InvoiceList';
import { InvoiceDetail } from '../pages/invoices/InvoiceDetail';
import { IntegrationsPage } from '../pages/IntegrationsPage';
import { StatusPage } from '../components/StatusPage/StatusPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleGuard } from './RoleGuard';
import { TenantGuard } from './TenantGuard';

import { LandingPage } from '../pages/landing/LandingPage';

// Temporary dashboard wrapper that chooses the right shell based on role
// We will refine this as we build out the AppShell properly
import { useAuthStore } from '../store/useAuthStore';

const DashboardSelector = () => {
  const { user } = useAuthStore();
  
  if (user?.role === 'BUSINESS_OWNER') {
    return <BusinessOwnerShell />;
  }
  return <StaffShell />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  /*
   * /register-business is gone along with public self-signup. A workspace now
   * exists only because a platform administrator provisioned it from
   * /admin/tenants.
   */
  {
    path: '/invite/:token',
    element: <StaffInvitationPage />,
  },
  {
    path: '/invitations/accept',
    element: <AcceptInvitationPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  /*
   * The customer-facing quotation (§6.5).
   *
   * Sits above `/:tenantSlug` on purpose. A tenant-prefixed path would make the
   * URL longer, leak the workspace slug, and — worse — collide with the tenant
   * shell's guards, which redirect anyone unauthenticated to a login the
   * recipient of a quotation has no account for.
   *
   * `/q/` rather than `/quotations/` because this URL gets pasted into emails
   * and read aloud on phone calls.
   */
  {
    path: '/q/:token',
    element: <PublicQuotationPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/:tenantSlug',
    element: <TenantGuard />,
    children: [
      {
        path: '',
        element: (
          <ProtectedRoute>
            <DashboardSelector />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute>
            <DashboardSelector />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute>
            <AccountSettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/team',
        element: (
          <ProtectedRoute>
            <RoleGuard allowedRoles={['BUSINESS_OWNER', 'SUPER_ADMIN']}>
              <TeamSettingsPage />
            </RoleGuard>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/integrations',
        element: (
          <ProtectedRoute>
            <RoleGuard allowedRoles={['BUSINESS_OWNER', 'SUPER_ADMIN', 'STAFF']}>
              <IntegrationsPage />
            </RoleGuard>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/profile',
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports',
        element: (
          <ProtectedRoute>
            <RoleGuard allowedRoles={['BUSINESS_OWNER', 'SUPER_ADMIN']}>
              <ReportsPage />
            </RoleGuard>
          </ProtectedRoute>
        ),
      },
      {
        path: 'clients',
        element: (
          <ProtectedRoute>
            <ClientListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'clients/new',
        element: (
          <ProtectedRoute>
            <ClientFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'clients/:clientId',
        element: (
          <ProtectedRoute>
            <ClientDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'clients/:clientId/edit',
        element: (
          <ProtectedRoute>
            <ClientFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'appointments',
        element: (
          <ProtectedRoute>
            <AppointmentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'appointments/new',
        element: (
          <ProtectedRoute>
            <CreateAppointmentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'appointments/:appointmentId/edit',
        element: (
          <ProtectedRoute>
            <EditAppointmentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/client-management',
        element: (
          <ProtectedRoute>
            <ClientSettingsPage />
          </ProtectedRoute>
        ),
      },
      /*
       * No RoleGuard: Staff may READ the policy, because it governs mail
       * landing in their own inbox, and "why am I getting these?" should be
       * answerable from inside the product. Every control on the page is
       * disabled for them, and the server refuses a non-owner PUT regardless —
       * the guard that matters is on the write, not the route.
       */
      {
        path: 'settings/notifications',
        element: (
          <ProtectedRoute>
            <NotificationSettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory',
        element: (
          <ProtectedRoute>
            <InventoryList />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/new',
        element: (
          <ProtectedRoute>
            <ProductForm />
          </ProtectedRoute>
        ),
      },
      {
        // Same component as 'new'; the presence of :productId switches it into
        // edit mode, so create and edit can never drift apart.
        path: 'inventory/:productId/edit',
        element: (
          <ProtectedRoute>
            <ProductForm />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/warehouses',
        element: (
          <ProtectedRoute>
            <WarehouseList />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/categories',
        element: (
          <ProtectedRoute>
            <CategoryList />
          </ProtectedRoute>
        ),
      },
      {
        // No role gate: every role has notifications, and each row is scoped
        // to its recipient server-side.
        path: 'notifications',
        element: (
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'quotations',
        element: (
          <ProtectedRoute>
            <QuotationList />
          </ProtectedRoute>
        ),
      },
      {
        path: 'quotations/new',
        element: (
          <ProtectedRoute>
            <CreateQuotation />
          </ProtectedRoute>
        ),
      },
      {
        path: 'quotations/:id',
        element: (
          <ProtectedRoute>
            <QuotationDetail />
          </ProtectedRoute>
        ),
      },
      {
        path: 'invoices',
        element: (
          <ProtectedRoute>
            <InvoiceList />
          </ProtectedRoute>
        ),
      },
      {
        path: 'invoices/:id',
        element: (
          <ProtectedRoute>
            <InvoiceDetail />
          </ProtectedRoute>
        ),
      },
      {
        path: 'quotations/:id/edit',
        element: (
          <ProtectedRoute>
            <EditQuotation />
          </ProtectedRoute>
        ),
      },
    ],
  },
  /*
   * SuperAdminShell renders its own nested <Routes> for /dashboard, /tenants,
   * /people, /setting and /profile. Those five are listed here explicitly — as well as
   * the wildcard below — because React Router ranks a dynamic segment plus a
   * matching static child (`/:tenantSlug/dashboard`) ABOVE a static segment
   * plus a splat (`/admin/*`): a splat is scored deliberately low so that a
   * more specific route elsewhere can win. Left as only `/admin/*`, a request
   * for `/admin/dashboard` was actually being matched by `/:tenantSlug`
   * (tenantSlug="admin") instead of this route, silently treating "admin" as
   * a tenant slug and 404ing every tenant-scoped API call. Explicit static
   * routes for each real sub-page outrank the dynamic tenant route the same
   * way `/admin` alone always did; the wildcard remains only to catch
   * anything else and redirect it via SuperAdminShell's own `*` route.
   */
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['SUPER_ADMIN']}>
          <SuperAdminShell />
        </RoleGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/dashboard',
    element: (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['SUPER_ADMIN']}>
          <SuperAdminShell />
        </RoleGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/tenants',
    element: (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['SUPER_ADMIN']}>
          <SuperAdminShell />
        </RoleGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/people',
    element: (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['SUPER_ADMIN']}>
          <SuperAdminShell />
        </RoleGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/setting',
    element: (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['SUPER_ADMIN']}>
          <SuperAdminShell />
        </RoleGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/profile',
    element: (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['SUPER_ADMIN']}>
          <SuperAdminShell />
        </RoleGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/*',
    element: (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['SUPER_ADMIN']}>
          <SuperAdminShell />
        </RoleGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: '/unauthorized',
    element: <StatusPage variant="403" />,
  },
  {
    path: '*',
    element: <StatusPage variant="404" />,
  },
]);
