import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
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
import { ClientSettingsPage } from '../pages/settings/ClientSettingsPage';
import { FormBuilderPage } from '../pages/settings/FormBuilderPage';
import { TeamSettingsPage } from '../pages/settings/team/TeamSettingsPage';
import { RolesSettingsPage } from '../pages/settings/roles/RolesSettingsPage';
import { AuditLogSettingsPage } from '../pages/settings/audit/AuditLogSettingsPage';
import { ListsSettingsPage } from '../pages/settings/lists/ListsSettingsPage';
import { PricingSettingsPage } from '../pages/settings/pricing/PricingSettingsPage';
import { SalesScriptSettingsPage } from '../pages/settings/salesScript/SalesScriptSettingsPage';
import { StatusesSettingsPage } from '../pages/settings/statuses/StatusesSettingsPage';
import { ContractSettingsPage } from '../pages/settings/contracts/ContractSettingsPage';
import { MembersList } from '../pages/membership/MembersList';
import { MemberFormPage } from '../pages/membership/MemberFormPage';
import { MemberDetailPage } from '../pages/membership/MemberDetailPage';
import { WellnessPlusSettingsPage } from '../pages/settings/wellnessPlus/WellnessPlusSettingsPage';
import { ProfilePage } from '../pages/settings/profile/ProfilePage';
import { AcceptInvitationPage } from '../pages/auth/AcceptInvitationPage';
import { InventoryList } from '../pages/inventory/InventoryList';
import { ProductForm } from '../pages/inventory/ProductForm/ProductForm';
import { WarehouseList } from '../pages/inventory/WarehouseList/WarehouseList';
import { CategoryList } from '../pages/inventory/CategoryList/CategoryList';
import { QuotationList } from '../pages/quotations/QuotationList';
import { OfferList } from '../pages/offers/OfferList';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { QuotationDetail } from '../pages/quotations/QuotationDetail';
import { PublicQuotationPage } from '../pages/quotations/PublicQuotationPage';
import { PublicFormPage } from '../pages/forms/PublicFormPage';
import { FormSubmissionsPage } from '../pages/settings/FormSubmissionsPage';
import { FormPrintPage } from '../pages/settings/FormPrintPage';
import { FormSubmissionPrintPage } from '../pages/settings/FormSubmissionPrintPage';
import { NotificationSettingsPage } from '../pages/settings/NotificationSettingsPage';
import { ApprovalsPage } from '../pages/approvals/ApprovalsPage';
import { FollowUpsPage } from '../pages/followUps/FollowUpsPage';
import { CreateQuotation } from '../pages/quotations/CreateQuotation';
import { EditQuotation } from '../pages/quotations/EditQuotation';
import { InvoiceList } from '../pages/invoices/InvoiceList';
import { InvoiceDetail } from '../pages/invoices/InvoiceDetail';
import { ContractList } from '../pages/contracts/ContractList';
import { ContractDetail } from '../pages/contracts/ContractDetail';
import { ContractFormPage } from '../pages/contracts/ContractFormPage';
import { Renewals } from '../pages/renewals/Renewals';
import { Performance } from '../pages/performance/Performance';
import { PaymentsOverview } from '../pages/payments/PaymentsOverview';
import { DealsPage } from '../pages/deals/DealsPage';
import { PipelineBoardContent } from '../pages/deals/PipelineBoardContent';
import { DealListContent } from '../pages/deals/DealListContent';
import { DealDetailContent } from '../pages/deals/DealDetailContent';
import { DealFormContent } from '../pages/deals/DealFormContent';
import { PricingContent } from '../pages/pricing/PricingContent';
import { IntegrationsPage } from '../pages/IntegrationsPage';
import { StatusPage } from '../components/StatusPage/StatusPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleGuard } from './RoleGuard';
import { RequirePermission } from './RequirePermission';
import { TenantGuard } from './TenantGuard';


// Temporary dashboard wrapper that chooses the right shell based on the
// caller's companies.view scope (FR-RBAC-07) — ALL is the owner's-eye view
// of the whole tenant, anything narrower (OWN/TEAM) or absent is the staff
// dashboard. We will refine this as we build out the AppShell properly.
import { usePermissionScope } from '../hooks/usePermission';
import { DashboardLanding } from '../pages/dashboard/DashboardLanding';

const LegacyDashboardSelector = () => {
  const scope = usePermissionScope('companies.view');

  if (scope === 'ALL') {
    return <BusinessOwnerShell />;
  }
  return <StaffShell />;
};

// M3 Slices 13 and 14 (FR-DSH-01): each role lands on its own dashboard: Sales User, Sales Manager,
// Administrator and CEO. Reception goes to the company search. The dashboard above is only the fallback for
// when the server cannot say which dashboard is the user's.
const DashboardSelector = () => <DashboardLanding fallback={<LegacyDashboardSelector />} />;

export const routes: RouteObject[] = [
  /*
   * The root goes straight to sign-in (FR-BR-05). This edition has no public
   * marketing page: the SaaS landing page it inherited was removed, and the
   * only people who arrive here have an account or a link someone sent them.
   */
  {
    path: '/',
    element: <Navigate to="/login" replace />,
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
  /*
   * The client-facing form (§24). Same placement reasoning as `/q/:token`
   * above — a tenant-prefixed path would collide with the tenant shell's
   * guards, which would bounce an anonymous visitor to a login they have no
   * account for. `/f/` for the same "gets pasted into emails, read aloud on
   * phone calls" reason `/q/` is short.
   */
  {
    path: '/f/:token',
    element: <PublicFormPage />,
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
            <RequirePermission permission="users.manage">
              <TeamSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/roles',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="roles.manage">
              <RolesSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/lists/:list?',
        element: (
          <ProtectedRoute>
            <RequirePermission permission={['settings.manage', 'activityResults.manage']}>
              <ListsSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        // M2 Slice 5: the Administrator edits and publishes the sales script (FR-SCR-04, 07).
        path: 'settings/sales-script',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="script.edit">
              <SalesScriptSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        // M2 Slice 3: every pricing value is commercial, so pricing.manage, not settings.manage.
        path: 'settings/pricing/:tab?',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="pricing.manage">
              <PricingSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/statuses',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="settings.manage">
              <StatusesSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        // M4 Slice 3: the Administrator edits everything; members.view and
        // members.verify reach the read-only benefit table (FR-BEN-04).
        path: 'settings/wellness-plus/:tab?',
        element: (
          <ProtectedRoute>
            <RequirePermission permission={['wellnessplus.settings.manage', 'members.view', 'members.verify']}>
              <WellnessPlusSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/contracts',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="settings.manage">
              <ContractSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/audit',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="audit.view">
              <AuditLogSettingsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/integrations',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="integrations.manage">
              <IntegrationsPage />
            </RequirePermission>
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
            <RequirePermission permission="reports.view">
              <ReportsPage />
            </RequirePermission>
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
        path: 'settings/client-management',
        element: (
          <ProtectedRoute>
            <ClientSettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/client-management/forms/:formId',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="forms.manage">
              <FormBuilderPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/client-management/forms/:formId/submissions',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="forms.manage">
              <FormSubmissionsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/client-management/forms/:formId/print',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="forms.manage">
              <FormPrintPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/client-management/forms/:formId/submissions/:submissionId/print',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="forms.manage">
              <FormSubmissionPrintPage />
            </RequirePermission>
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
        // The offers list (M2 Slice 9, FR-OFR-14): offers are commercial (FR-RBAC-17).
        path: 'offers',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="commercial.view">
              <OfferList />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        // My follow-ups and the team's (M2 Slice 11, FR-FUP-07, 08).
        path: 'follow-ups',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="calendar.view">
              <FollowUpsPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        // Pending discount approvals (M2 Slice 10, FR-DSC-06).
        path: 'approvals',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="discounts.approve">
              <ApprovalsPage />
            </RequirePermission>
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
        path: 'contracts',
        element: (
          <ProtectedRoute>
            <ContractList />
          </ProtectedRoute>
        ),
      },
      /*
       * `contracts/new` is declared BEFORE `contracts/:id`, or the router
       * matches "new" as a contract id and the form never renders.
       */
      {
        path: 'contracts/new',
        element: (
          <ProtectedRoute>
            <ContractFormPage />
          </ProtectedRoute>
        ),
      },
      {
        // M4 Slice 4: the Wellness+ member record. Reading is "Members: view", writing "Members: manage" (FR-RBAC-28).
        path: 'members',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="members.view">
              <MembersList />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'members/new',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="members.manage">
              <MemberFormPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'members/:memberId',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="members.view">
              <MemberDetailPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'members/:memberId/edit',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="members.manage">
              <MemberFormPage />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'contracts/:contractId',
        element: (
          <ProtectedRoute>
            <ContractDetail />
          </ProtectedRoute>
        ),
      },
      {
        // The Payments overview (M3 Slice 9, FR-PAY-11).
        path: 'payments',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="payments.view">
              <PaymentsOverview />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        // The Renewals screen (M3 Slice 11, FR-REN-05).
        path: 'renewals',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="contracts.validity.view">
              <Renewals />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        // The Performance screen (M3 Slice 12, FR-PRF-01).
        path: 'performance',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="performance.view">
              <Performance />
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'contracts/:contractId/edit',
        element: (
          <ProtectedRoute>
            <ContractFormPage />
          </ProtectedRoute>
        ),
      },
      /*
       * Deals and the pipeline (M2 Slice 6). `deals/new` before
       * `deals/:dealId`, for the same reason as contracts above.
       */
      {
        path: 'pipeline',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="deals.view">
              <DealsPage>
                <PipelineBoardContent />
              </DealsPage>
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'pipeline/list',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="deals.view">
              <DealsPage>
                <DealListContent />
              </DealsPage>
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'deals/new',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="deals.edit">
              <DealsPage>
                <DealFormContent />
              </DealsPage>
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'deals/:dealId',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="deals.view">
              <DealsPage>
                <DealDetailContent />
              </DealsPage>
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      /*
       * The pricing screen (M2 Slice 8): from a deal, or from a company, where
       * the offer is saved on one of its open deals.
       */
      {
        path: 'deals/:dealId/pricing',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="offers.edit">
              <DealsPage>
                <PricingContent />
              </DealsPage>
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'clients/:clientId/pricing',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="offers.edit">
              <DealsPage>
                <PricingContent />
              </DealsPage>
            </RequirePermission>
          </ProtectedRoute>
        ),
      },
      {
        path: 'deals/:dealId/edit',
        element: (
          <ProtectedRoute>
            <RequirePermission permission="deals.edit">
              <DealsPage>
                <DealFormContent />
              </DealsPage>
            </RequirePermission>
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
];

export const router = createBrowserRouter(routes);
