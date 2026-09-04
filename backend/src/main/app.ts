import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler } from '@main/interfaces/http/middlewares/errorHandler';
// Removed createAuthRoutes import
import { AuthController } from '@auth/interfaces/http/controllers/AuthController';
import { LoginUseCase } from '@auth/application/use-cases/LoginUseCase';
import { CreateUserUseCase } from '@auth/application/use-cases/CreateUserUseCase';
import { GetPlatformUsersUseCase } from '@auth/application/use-cases/GetPlatformUsersUseCase';
import { InviteStaffUseCase } from '@auth/application/use-cases/InviteStaffUseCase';
import { PlatformInviteUserUseCase } from '@auth/application/use-cases/PlatformInviteUserUseCase';
import { AcceptInvitationUseCase } from '@auth/application/use-cases/AcceptInvitationUseCase';
import { RequestPasswordResetUseCase } from '@auth/application/use-cases/RequestPasswordResetUseCase';
import { ResetPasswordUseCase } from '@auth/application/use-cases/ResetPasswordUseCase';
import { GetTenantStaffUseCase } from '@auth/application/use-cases/GetTenantStaffUseCase';
import { GetPendingInvitationsUseCase } from '@auth/application/use-cases/GetPendingInvitationsUseCase';
import { UpdateUserProfileUseCase } from '@auth/application/use-cases/UpdateUserProfileUseCase';
import { ChangePasswordUseCase } from '@auth/application/use-cases/ChangePasswordUseCase';
import { GetUserProfileUseCase } from '@auth/application/use-cases/GetUserProfileUseCase';
import { UpdateUserRoleUseCase } from '@auth/application/use-cases/UpdateUserRoleUseCase';
import { CancelInvitationUseCase } from '@auth/application/use-cases/CancelInvitationUseCase';
import { ReactivateUserUseCase } from '@auth/application/use-cases/ReactivateUserUseCase';
import { DeactivateUserUseCase } from '@auth/application/use-cases/DeactivateUserUseCase';
import { GetDeactivationImpactUseCase } from '@auth/application/use-cases/GetDeactivationImpactUseCase';
import { GetOwnershipTransferCandidatesUseCase } from '@auth/application/use-cases/GetOwnershipTransferCandidatesUseCase';
import { PlatformSuspendUserUseCase } from '@auth/application/use-cases/PlatformSuspendUserUseCase';
import { PlatformReactivateUserUseCase } from '@auth/application/use-cases/PlatformReactivateUserUseCase';
import { PlatformDeleteUserUseCase } from '@auth/application/use-cases/PlatformDeleteUserUseCase';
import { DeletePlatformAdminSelfUseCase } from '@auth/application/use-cases/DeletePlatformAdminSelfUseCase';
import { PrismaOwnershipTransferRepository } from '@auth/infrastructure/repositories/PrismaOwnershipTransferRepository';
import { PrismaOwnershipTransactions } from '@auth/infrastructure/PrismaOwnershipTransactions';
import { PrismaAuditLogger } from '@shared/infrastructure/PrismaAuditLogger';
import { PrismaUserRepository } from '@auth/infrastructure/repositories/PrismaUserRepository';
import { PrismaTenantRepository } from '@tenant/infrastructure/repositories/PrismaTenantRepository';
import { PrismaInvitationRepository } from '@auth/infrastructure/repositories/PrismaInvitationRepository';
import { PrismaPasswordResetTokenRepository } from '@auth/infrastructure/repositories/PrismaPasswordResetTokenRepository';
import { BcryptPasswordHasher } from '@auth/infrastructure/BcryptPasswordHasher';
import { JwtTokenService } from '@auth/infrastructure/JwtTokenService';
import { ConsoleEmailSender } from '@auth/infrastructure/ConsoleEmailSender';
import { SmtpEmailSender } from '@auth/infrastructure/SmtpEmailSender';
import { PrismaTenantProvisioningTransaction } from '@tenant/infrastructure/PrismaTenantProvisioningTransaction';
import { CreateTenantWithOwnerUseCase } from '@tenant/application/use-cases/CreateTenantWithOwnerUseCase';
import { SetTenantSubscriptionStatusUseCase } from '@tenant/application/use-cases/SetTenantSubscriptionStatusUseCase';
import { EnterTenantUseCase } from '@tenant/application/use-cases/EnterTenantUseCase';
import { ExitTenantUseCase } from '@tenant/application/use-cases/ExitTenantUseCase';
import { DeleteTenantUseCase } from '@tenant/application/use-cases/DeleteTenantUseCase';
import { PrismaTenantDeletionTransaction } from '@tenant/infrastructure/PrismaTenantDeletionTransaction';
import { FsTenantMediaCleaner } from '@tenant/infrastructure/FsTenantMediaCleaner';
import { PrismaPlatformSettingsRepository } from '../settings/infrastructure/PrismaPlatformSettingsRepository';
import { IPlatformSettingsRepository } from '../settings/domain/IPlatformSettingsRepository';
import { GetPlatformSettingsUseCase } from '../settings/application/use-cases/GetPlatformSettingsUseCase';
import { UpdatePlatformSettingsUseCase } from '../settings/application/use-cases/UpdatePlatformSettingsUseCase';
import { BulkUpdateTenantSettingsUseCase } from '../settings/application/use-cases/BulkUpdateTenantSettingsUseCase';
import { createPlatformSettingsRouter } from '../settings/interfaces/http/routes/platformSettingsRoutes';
import { SubscriptionStatus } from '@tenant/domain/enums/SubscriptionStatus';
import { ITenantProvisioningTransaction } from '@tenant/application/ports/ITenantProvisioningTransaction';
import { IUserRepository } from '@auth/domain/repositories/IUserRepository';
import { ITenantRepository } from '@tenant/domain/repositories/ITenantRepository';
import { IInvitationRepository } from '@auth/domain/repositories/IInvitationRepository';
import { IPasswordResetTokenRepository } from '@auth/domain/repositories/IPasswordResetTokenRepository';
import { IPasswordHasher } from '@auth/application/ports/IPasswordHasher';
import { ITokenService } from '@auth/application/ports/ITokenService';
import { IEmailSender } from '@auth/application/ports/IEmailSender';

import { createClientRouter } from '../clients/interfaces/http/routes/clientRoutes';
import { PrismaNotificationRepository } from '../notifications/infrastructure/PrismaNotificationRepository';
import { NotificationService } from '../notifications/application/NotificationService';
import { PrismaQuotationWriteTransaction } from '../quotations/infrastructure/PrismaQuotationWriteTransaction';
import { GetNotificationsUseCase } from '../notifications/application/GetNotificationsUseCase';
import { MarkNotificationReadUseCase, MarkAllNotificationsReadUseCase } from '../notifications/application/MarkNotificationReadUseCase';
import { NotificationController } from '../notifications/interfaces/http/NotificationController';
import { createNotificationRouter } from '../notifications/interfaces/http/notificationRoutes';
import { PrismaNotificationSettingsRepository } from '../notifications/infrastructure/PrismaNotificationSettingsRepository';
import { GetNotificationSettingsUseCase } from '../notifications/application/GetNotificationSettingsUseCase';
import { UpdateNotificationSettingsUseCase } from '../notifications/application/UpdateNotificationSettingsUseCase';
import { NotificationEmailComposer } from '../notifications/application/NotificationEmailComposer';
import { NotificationEmailDispatcher } from '../notifications/application/NotificationEmailDispatcher';
import { PrismaPublicQuotationReader } from '../quotations/infrastructure/PrismaPublicQuotationReader';
import { QuotationPdfRenderer } from '../quotations/infrastructure/QuotationPdfRenderer';
import { QuotationDeliveryService } from '../quotations/application/QuotationDeliveryService';
import { GetPublicQuotationUseCase } from '../quotations/application/GetPublicQuotationUseCase';
import { RespondToPublicQuotationUseCase } from '../quotations/application/use-cases/RespondToPublicQuotationUseCase';
import { createPublicQuotationRouter } from '../quotations/interfaces/http/publicQuotationRoutes';

export interface AppDependencies {
  userRepository: IUserRepository;
  tenantRepository: ITenantRepository;
  invitationRepository: IInvitationRepository;
  prtRepository: IPasswordResetTokenRepository;
  passwordHasher: IPasswordHasher;
  tokenService: ITokenService;
  emailSender: IEmailSender;
  /**
   * Replaces the former `unitOfWork` override. `PrismaUnitOfWork` was a no-op
   * that made two independent writes look atomic (TD-032); this is the port
   * that actually binds its repositories to the transaction.
   */
  tenantProvisioningTransaction: ITenantProvisioningTransaction;
  platformSettingsRepository: IPlatformSettingsRepository;
  integrationRepository?: any;
}

export const createApp = (overrides?: Partial<AppDependencies>) => {
  const app = express();
  // Render (and most PaaS hosts) put the app behind a reverse proxy, so
  // X-Forwarded-For is always present. Without this, express-rate-limit
  // throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every rate-limited request
  // (e.g. login) instead of ever reaching the route handler.
  app.set('trust proxy', 1);
  // Sensible security headers (HSTS, X-Content-Type-Options, frame denial, and
  // referrer policy among others). This is a JSON API, so the default CSP is
  // not load-bearing here; the frontend is served separately.
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'https://neva-crm.vercel.app',
        process.env.FRONTEND_URL
      ];
      if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));
  // Default 100kb is too small for the Reports PDF export, whose body carries
  // several client-captured chart PNGs as base64 alongside the table data.
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());

  // Backs the Super Admin dashboard's Global Latency / Active Requests /
  // Real-time Traffic panel. Registered before any route so it times every
  // request the app serves, not just tenant routes.
  const { InMemoryMetricsCollector } = require('../tenant/infrastructure/InMemoryMetricsCollector');
  const metricsCollector = new InMemoryMetricsCollector();
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      metricsCollector.recordRequest(durationMs);
    });
    next();
  });

  // Dependencies — use overrides if provided, otherwise default to real implementations
  const userRepository = overrides?.userRepository ?? new PrismaUserRepository();
  const tenantRepository = overrides?.tenantRepository ?? new PrismaTenantRepository();
  const invitationRepository = overrides?.invitationRepository ?? new PrismaInvitationRepository();
  const prtRepository = overrides?.prtRepository ?? new PrismaPasswordResetTokenRepository();
  const passwordHasher = overrides?.passwordHasher ?? new BcryptPasswordHasher();
  const tokenService = overrides?.tokenService ?? new JwtTokenService();
  const emailSender = overrides?.emailSender ?? new SmtpEmailSender();
  const tenantProvisioningTransaction =
    overrides?.tenantProvisioningTransaction ?? new PrismaTenantProvisioningTransaction();
  const platformSettingsRepository =
    overrides?.platformSettingsRepository ?? new PrismaPlatformSettingsRepository();

  // Use Cases
  //
  // Provisioning a workspace and its first owner. Public self-registration used
  // to be a second caller; it was removed, so the SUPER_ADMIN endpoint on
  // /api/tenants is now the only way a workspace comes into existence.
  const createTenantWithOwnerUseCase = new CreateTenantWithOwnerUseCase(
    tenantProvisioningTransaction,
    passwordHasher,
    platformSettingsRepository
  );
  const getPlatformSettingsUseCase = new GetPlatformSettingsUseCase(platformSettingsRepository);
  const updatePlatformSettingsUseCase = new UpdatePlatformSettingsUseCase(platformSettingsRepository);
  const bulkUpdateTenantSettingsUseCase = new BulkUpdateTenantSettingsUseCase(tenantRepository);
  const loginUseCase = new LoginUseCase(userRepository, tenantRepository, passwordHasher, tokenService);
  const createUserUseCase = new CreateUserUseCase(userRepository, passwordHasher);
  const getPlatformUsersUseCase = new GetPlatformUsersUseCase(userRepository);
  const enterTenantUseCase = new EnterTenantUseCase(tenantRepository, userRepository, tokenService);
  const exitTenantUseCase = new ExitTenantUseCase(userRepository, tokenService);
  const auditLogger = new PrismaAuditLogger();
  const deleteTenantUseCase = new DeleteTenantUseCase(
    tenantRepository,
    new PrismaTenantDeletionTransaction(),
    new FsTenantMediaCleaner(),
    auditLogger
  );
  const inviteStaffUseCase = new InviteStaffUseCase(invitationRepository, emailSender);
  const notificationRepository = new PrismaNotificationRepository();
  const notificationSettingsRepository = new PrismaNotificationSettingsRepository();

  /*
   * The email half of notifications (§6.6).
   *
   * Built once and shared: every emitting site in the application goes through
   * either `NotificationService.emitSafe` (which dispatches for non-
   * transactional callers) or `runWithPostCommitEmail` (which dispatches after
   * a quotation transition commits). Nothing composes its own.
   */
  const notificationEmailDispatcher = new NotificationEmailDispatcher(
    notificationSettingsRepository,
    userRepository,
    tenantRepository,
    emailSender,
    new NotificationEmailComposer(process.env.FRONTEND_URL || 'http://localhost:5173')
  );

  const notificationService = new NotificationService(
    notificationRepository,
    userRepository,
    notificationEmailDispatcher
  );
  const quotationWriteTx = new PrismaQuotationWriteTransaction();
  const acceptInvitationUseCase = new AcceptInvitationUseCase(invitationRepository, userRepository, passwordHasher, tenantRepository, notificationService);
  const requestPasswordResetUseCase = new RequestPasswordResetUseCase(userRepository, prtRepository, emailSender);
  const resetPasswordUseCase = new ResetPasswordUseCase(prtRepository, userRepository, passwordHasher);
  const getTenantStaffUseCase = new GetTenantStaffUseCase(userRepository);
  const getPendingInvitationsUseCase = new GetPendingInvitationsUseCase(invitationRepository);
  const updateUserProfileUseCase = new UpdateUserProfileUseCase(userRepository);
  const changePasswordUseCase = new ChangePasswordUseCase(userRepository, passwordHasher);
  const getUserProfileUseCase = new GetUserProfileUseCase(userRepository);
  const updateUserRoleUseCase = new UpdateUserRoleUseCase(userRepository);
  const cancelInvitationUseCase = new CancelInvitationUseCase(invitationRepository);
  const deactivateUserUseCase = new DeactivateUserUseCase(userRepository);
  const getDeactivationImpactUseCase = new GetDeactivationImpactUseCase(userRepository);
  const reactivateUserUseCase = new ReactivateUserUseCase(userRepository);

  // Platform Admin user lifecycle (suspend/reactivate/delete, including
  // Business Owner ownership transfer). Distinct actor and scope from the
  // Business-Owner-only deactivate/reactivate above — see PlatformSuspendUserUseCase.
  const ownershipTransferRepository = new PrismaOwnershipTransferRepository();
  const ownershipTransactions = new PrismaOwnershipTransactions();
  const getOwnershipTransferCandidatesUseCase = new GetOwnershipTransferCandidatesUseCase(userRepository);
  const platformSuspendUserUseCase = new PlatformSuspendUserUseCase(
    userRepository,
    ownershipTransactions,
    auditLogger
  );
  const platformReactivateUserUseCase = new PlatformReactivateUserUseCase(
    userRepository,
    ownershipTransferRepository,
    ownershipTransactions,
    auditLogger
  );
  const platformDeleteUserUseCase = new PlatformDeleteUserUseCase(
    userRepository,
    ownershipTransactions,
    auditLogger
  );
  const deletePlatformAdminSelfUseCase = new DeletePlatformAdminSelfUseCase(
    userRepository,
    auditLogger
  );
  const platformInviteUserUseCase = new PlatformInviteUserUseCase(
    invitationRepository,
    userRepository,
    tenantRepository,
    emailSender,
    auditLogger
  );

  // Controller
  const authController = new AuthController(
    loginUseCase,
    inviteStaffUseCase,
    acceptInvitationUseCase,
    requestPasswordResetUseCase,
    resetPasswordUseCase,
    tenantRepository,
    getTenantStaffUseCase,
    getPendingInvitationsUseCase,
    updateUserProfileUseCase,
    getUserProfileUseCase,
    updateUserRoleUseCase,
    cancelInvitationUseCase,
    deactivateUserUseCase,
    getDeactivationImpactUseCase,
    reactivateUserUseCase,
    createUserUseCase,
    exitTenantUseCase,
    changePasswordUseCase
  );

  // Auth Routes
  const { createGlobalAuthRoutes, createTenantAuthRoutes } = require('@auth/interfaces/http/routes/authRoutes');
  const globalAuthRoutes = createGlobalAuthRoutes(authController, tokenService);
  const tenantAuthRoutes = createTenantAuthRoutes(authController, tokenService, tenantRepository);
  
  app.use('/api/auth', globalAuthRoutes);
  app.use('/api/:tenantSlug/auth', tenantAuthRoutes);

  // Client routes require PrismaClient, TokenService, TenantRepository
  const { prisma } = require('@shared/infrastructure/prisma/client');
  const clientRoutes = createClientRouter(prisma, tokenService, tenantRepository, notificationService);
  app.use('/api/:tenantSlug/clients', clientRoutes);

  // The client-facing form (§24) — no tenant prefix, no auth. Mounted BEFORE
  // its tenant-scoped sibling below for the identical reason
  // `/api/public/quotations` is: `/api/:tenantSlug/forms` is a wildcard that
  // would otherwise match `/api/public/forms/<token>` too (tenantSlug="public"),
  // 401'ing every visitor who opens a shared link. See publicFormRoutes.ts for
  // what stands in for authentication instead.
  const { createPublicFormRouter } = require('../forms/interfaces/http/routes/publicFormRoutes');
  const { GetPublicFormUseCase } = require('../forms/application/use-cases/GetPublicFormUseCase');
  const { SubmitFormUseCase } = require('../forms/application/use-cases/SubmitFormUseCase');
  const { PrismaClientFormRepository } = require('../forms/infrastructure/repositories/PrismaClientFormRepository');
  const { PrismaFormVersionRepository } = require('../forms/infrastructure/repositories/PrismaFormVersionRepository');
  const { PrismaFormSubmissionRepository } = require('../forms/infrastructure/repositories/PrismaFormSubmissionRepository');
  const { PrismaCustomFieldDefinitionRepository: PublicFormCustomFieldRepo } = require('../clients/infrastructure/repositories/PrismaCustomFieldDefinitionRepository');
  const { PrismaClientRepository: PublicFormClientRepo } = require('../clients/infrastructure/repositories/PrismaClientRepository');
  const { EnsureDefaultClientFieldsUseCase } = require('../clients/application/use-cases/EnsureDefaultClientFieldsUseCase');
  const { CreateClientUseCase } = require('../clients/application/use-cases/CreateClientUseCase');

  const publicFormClientFormRepo = new PrismaClientFormRepository(prisma);
  const publicFormVersionRepo = new PrismaFormVersionRepository(prisma);
  const publicFormSubmissionRepo = new PrismaFormSubmissionRepository(prisma);
  const publicFormCustomFieldRepo = new PublicFormCustomFieldRepo(prisma);
  const publicFormClientRepo = new PublicFormClientRepo(prisma);
  // A fresh CreateClientUseCase, wired to the SAME notificationService every
  // other module uses — a client created from a public form submission
  // still emits CLIENT_ASSIGNED exactly like one created from the UI.
  const publicFormCreateClientUseCase = new CreateClientUseCase(
    publicFormClientRepo,
    publicFormCustomFieldRepo,
    new EnsureDefaultClientFieldsUseCase(publicFormCustomFieldRepo, publicFormClientRepo),
    notificationService
  );

  app.use(
    '/api/public/forms',
    createPublicFormRouter(
      new GetPublicFormUseCase(publicFormClientFormRepo, publicFormVersionRepo),
      new SubmitFormUseCase(
        publicFormClientFormRepo,
        publicFormVersionRepo,
        publicFormSubmissionRepo,
        publicFormCustomFieldRepo,
        userRepository,
        publicFormCreateClientUseCase,
        notificationService
      )
    )
  );

  // Client intake forms — the drag-and-drop builder's layouts. A sibling of
  // /clients rather than a sub-path of it: forms are a presentation layer over
  // the tenant's field dictionary, and clientRoutes already wires 18 use cases
  // into a single controller.
  const { createFormRouter } = require('../forms/interfaces/http/routes/formRoutes');
  const formRoutes = createFormRouter(prisma, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/forms', formRoutes);

  // Appointment routes
  const { createAppointmentRouter } = require('../appointments/interfaces/http/routes/appointmentRoutes');
  const appointmentRoutes = createAppointmentRouter(prisma, tokenService, tenantRepository, notificationService);
  app.use('/api/:tenantSlug/appointments', appointmentRoutes);

  // Tenant Routes
  // NOTE: /api/tenants does NOT have a :tenantSlug prefix because GetTenantsUseCase is a platform-level
  // operation used by SUPER_ADMIN to list all tenants across the system. It is not scoped to a single tenant.
  const { GetTenantsUseCase } = require('../tenant/application/use-cases/GetTenantsUseCase');
  const getTenantsUseCase = new GetTenantsUseCase(tenantRepository);
  const { GetPlatformActivityUseCase } = require('../tenant/application/use-cases/GetPlatformActivityUseCase');
  const getPlatformActivityUseCase = new GetPlatformActivityUseCase(auditLogger);
  const { GetGlobalMrrUseCase } = require('../tenant/application/use-cases/GetGlobalMrrUseCase');
  const getGlobalMrrUseCase = new GetGlobalMrrUseCase();
  const { GetSystemHealthUseCase } = require('../tenant/application/use-cases/GetSystemHealthUseCase');
  const { PrismaDatabaseHealthChecker } = require('../tenant/infrastructure/PrismaDatabaseHealthChecker');
  const getSystemHealthUseCase = new GetSystemHealthUseCase(new PrismaDatabaseHealthChecker(prisma));
  const { GetSystemMetricsUseCase } = require('../tenant/application/use-cases/GetSystemMetricsUseCase');
  const getSystemMetricsUseCase = new GetSystemMetricsUseCase(metricsCollector);
  const { createTenantRouter } = require('../tenant/interfaces/http/routes/tenantRoutes');
  const tenantRoutes = createTenantRouter({
    getTenantsUseCase,
    getPlatformActivityUseCase,
    getGlobalMrrUseCase,
    getSystemHealthUseCase,
    getSystemMetricsUseCase,
    createTenantWithOwnerUseCase,
    // Same class, opposite directions. The target status is fixed here at
    // construction so no request body can ever choose it.
    suspendTenantUseCase: new SetTenantSubscriptionStatusUseCase(
      tenantRepository,
      SubscriptionStatus.SUSPENDED,
      auditLogger
    ),
    reactivateTenantUseCase: new SetTenantSubscriptionStatusUseCase(
      tenantRepository,
      SubscriptionStatus.ACTIVE,
      auditLogger
    ),
    enterTenantUseCase,
    deleteTenantUseCase,
    inviteUserUseCase: platformInviteUserUseCase,
    getPlatformUsersUseCase,
    getOwnershipTransferCandidatesUseCase,
    suspendUserUseCase: platformSuspendUserUseCase,
    reactivateUserUseCase: platformReactivateUserUseCase,
    deleteUserUseCase: platformDeleteUserUseCase,
    deletePlatformAdminSelfUseCase,
    bulkUpdateTenantSettingsUseCase,
    tokenService,
    emailSender,
    auditLogger,
  });
  app.use('/api/tenants', tenantRoutes);

  // Platform-wide default settings — applied only at the moment a NEW
  // workspace is provisioned (see CreateTenantWithOwnerUseCase above). Mounted
  // alongside /api/tenants for the same reason: platform-level, not scoped to
  // any single tenant.
  const platformSettingsRoutes = createPlatformSettingsRouter({
    getPlatformSettingsUseCase,
    updatePlatformSettingsUseCase,
    tokenService,
  });
  app.use('/api/platform-settings', platformSettingsRoutes);

  // Dashboard Routes
  // NOTE: /api/:tenantSlug/dashboard DOES have a :tenantSlug prefix because dashboard metrics and feeds
  // are inherently tenant-scoped. The middleware ensures data is only returned for the requested tenant.
  const { GetTenantClientMetricsUseCase } = require('../dashboard/application/use-cases/GetTenantClientMetricsUseCase');
  const { GetTenantActivityFeedUseCase } = require('../dashboard/application/use-cases/GetTenantActivityFeedUseCase');
  const { PrismaInteractionRepository } = require('../clients/infrastructure/repositories/PrismaInteractionRepository');
  const { PrismaAppointmentRepository } = require('../appointments/infrastructure/repositories/PrismaAppointmentRepository');
  const { PrismaClientRepository } = require('../clients/infrastructure/repositories/PrismaClientRepository');
  
  // Create the concrete repositories needed for Dashboard
  const prismaClientRepository = new PrismaClientRepository(prisma);
  const interactionRepository = new PrismaInteractionRepository(prisma);
  const appointmentRepository = new PrismaAppointmentRepository(prisma);
  
  const getTenantClientMetricsUseCase = new GetTenantClientMetricsUseCase(prismaClientRepository, notificationSettingsRepository);
  const getTenantActivityFeedUseCase = new GetTenantActivityFeedUseCase(prismaClientRepository, interactionRepository, appointmentRepository, userRepository);
  
  const { createDashboardRouter } = require('../dashboard/interfaces/http/routes/dashboardRoutes');
  const dashboardRoutes = createDashboardRouter(getTenantClientMetricsUseCase, getTenantActivityFeedUseCase, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/dashboard', dashboardRoutes);

  // Inventory Routes
  const { PrismaProductRepository } = require('../inventory/infrastructure/repositories/PrismaProductRepository');
  const { PrismaProductImageRepository } = require('../inventory/infrastructure/repositories/PrismaProductImageRepository');
  const { MediaProductImageStorage } = require('../inventory/infrastructure/storage/MediaProductImageStorage');
  const { PrismaWarehouseRepository } = require('../inventory/infrastructure/repositories/PrismaWarehouseRepository');
  const { PrismaCategoryRepository } = require('../inventory/infrastructure/repositories/PrismaCategoryRepository');
  const { PrismaStockLevelRepository } = require('../inventory/infrastructure/repositories/PrismaStockLevelRepository');
  const { PrismaStockMovementRepository } = require('../inventory/infrastructure/repositories/PrismaStockMovementRepository');
  const { PrismaStockTransactionManager } = require('../inventory/infrastructure/repositories/PrismaStockTransactionManager');
  
  const { CreateProductUseCase } = require('../inventory/application/use-cases/CreateProductUseCase');
  const { UpdateProductUseCase } = require('../inventory/application/use-cases/UpdateProductUseCase');
  const { GetProductUseCase } = require('../inventory/application/use-cases/GetProductUseCase');
  const { DeleteProductUseCase } = require('../inventory/application/use-cases/DeleteProductUseCase');
  const { BulkUpdateProductsUseCase } = require('../inventory/application/use-cases/BulkUpdateProductsUseCase');
  const { GetProductFacetsUseCase } = require('../inventory/application/use-cases/GetProductFacetsUseCase');
  const { ManageProductImagesUseCase } = require('../inventory/application/use-cases/ManageProductImagesUseCase');
  const { AdjustStockUseCase } = require('../inventory/application/use-cases/AdjustStockUseCase');
  const { TransferStockUseCase } = require('../inventory/application/use-cases/TransferStockUseCase');
  const { SearchProductsUseCase } = require('../inventory/application/use-cases/SearchProductsUseCase');
  const { GetProductStockBreakdownUseCase } = require('../inventory/application/use-cases/GetProductStockBreakdownUseCase');
  const { CreateWarehouseUseCase } = require('../inventory/application/use-cases/CreateWarehouseUseCase');
  const { UpdateWarehouseUseCase } = require('../inventory/application/use-cases/UpdateWarehouseUseCase');
  const { DeleteWarehouseUseCase } = require('../inventory/application/use-cases/DeleteWarehouseUseCase');
  const { CreateCategoryUseCase } = require('../inventory/application/use-cases/CreateCategoryUseCase');
  const { UpdateCategoryUseCase } = require('../inventory/application/use-cases/UpdateCategoryUseCase');
  const { DeleteCategoryUseCase } = require('../inventory/application/use-cases/DeleteCategoryUseCase');
  const { GetWarehousesUseCase } = require('../inventory/application/use-cases/GetWarehousesUseCase');
  const { GetCategoriesUseCase } = require('../inventory/application/use-cases/GetCategoriesUseCase');
  const { ArchiveUnusedCategoriesUseCase } = require('../inventory/application/use-cases/ArchiveUnusedCategoriesUseCase');
  
  const { InventoryController } = require('../inventory/interfaces/http/inventoryController');
  const { createInventoryRouter } = require('../inventory/interfaces/http/inventoryRoutes');

  const productRepo = new PrismaProductRepository(prisma);
  const productImageRepo = new PrismaProductImageRepository(prisma);
  const productImageStorage = new MediaProductImageStorage();
  const warehouseRepo = new PrismaWarehouseRepository(prisma);
  const categoryRepo = new PrismaCategoryRepository(prisma);
  const stockLevelRepo = new PrismaStockLevelRepository(prisma);
  const stockMovementRepo = new PrismaStockMovementRepository(prisma);
  const stockTxManager = new PrismaStockTransactionManager(prisma);

  // Bulk delete reuses the single delete, so it gets the same instance rather
  // than a second copy with its own idea of what deleting means.
  const deleteProductUseCase = new DeleteProductUseCase(
    productRepo,
    productImageRepo,
    productImageStorage
  );

  const inventoryController = new InventoryController({
    createProductUseCase: new CreateProductUseCase(productRepo, warehouseRepo, stockTxManager),
    updateProductUseCase: new UpdateProductUseCase(productRepo),
    getProductUseCase: new GetProductUseCase(productRepo),
    deleteProductUseCase,
    bulkUpdateProductsUseCase: new BulkUpdateProductsUseCase(productRepo, deleteProductUseCase),
    getProductFacetsUseCase: new GetProductFacetsUseCase(productRepo),
    manageProductImagesUseCase: new ManageProductImagesUseCase(
      productRepo,
      productImageRepo,
      productImageStorage
    ),
    adjustStockUseCase: new AdjustStockUseCase(stockLevelRepo, stockMovementRepo),
    transferStockUseCase: new TransferStockUseCase(stockLevelRepo, stockTxManager),
    searchProductsUseCase: new SearchProductsUseCase(productRepo),
    getProductStockBreakdownUseCase: new GetProductStockBreakdownUseCase(productRepo, stockLevelRepo),
    createWarehouseUseCase: new CreateWarehouseUseCase(warehouseRepo),
    updateWarehouseUseCase: new UpdateWarehouseUseCase(warehouseRepo),
    deleteWarehouseUseCase: new DeleteWarehouseUseCase(warehouseRepo, stockLevelRepo),
    getWarehousesUseCase: new GetWarehousesUseCase(warehouseRepo),
    createCategoryUseCase: new CreateCategoryUseCase(categoryRepo),
    updateCategoryUseCase: new UpdateCategoryUseCase(categoryRepo),
    deleteCategoryUseCase: new DeleteCategoryUseCase(categoryRepo, productRepo),
    getCategoriesUseCase: new GetCategoriesUseCase(categoryRepo),
    archiveUnusedCategoriesUseCase: new ArchiveUnusedCategoriesUseCase(categoryRepo),
  });

  const inventoryRoutes = createInventoryRouter(inventoryController, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/inventory', inventoryRoutes);

  // Quotations Routes
  const { PrismaQuotationRepository } = require('../quotations/infrastructure/repositories/PrismaQuotationRepository');
  const { PrismaQuotationLineItemRepository } = require('../quotations/infrastructure/repositories/PrismaQuotationLineItemRepository');
  const { PrismaQuotationStatusHistoryRepository } = require('../quotations/infrastructure/repositories/PrismaQuotationStatusHistoryRepository');
  
  const { CreateQuotationUseCase } = require('../quotations/application/use-cases/CreateQuotationUseCase');
  const { UpdateQuotationUseCase } = require('../quotations/application/use-cases/UpdateQuotationUseCase');
  const { SubmitQuotationUseCase } = require('../quotations/application/use-cases/SubmitQuotationUseCase');
  const { ApproveQuotationUseCase } = require('../quotations/application/use-cases/ApproveQuotationUseCase');
  const { ReturnQuotationToDraftUseCase } = require('../quotations/application/use-cases/ReturnQuotationToDraftUseCase');
  const { MarkQuotationAcceptedUseCase } = require('../quotations/application/use-cases/MarkQuotationAcceptedUseCase');
  const { MarkQuotationRejectedUseCase } = require('../quotations/application/use-cases/MarkQuotationRejectedUseCase');
  const { ExpireQuotationUseCase } = require('../quotations/application/use-cases/ExpireQuotationUseCase');
  const { SearchQuotationsUseCase } = require('../quotations/application/use-cases/SearchQuotationsUseCase');
  const { GetQuotationDetailUseCase } = require('../quotations/application/use-cases/GetQuotationDetailUseCase');
  const { GetPendingApprovalsUseCase } = require('../quotations/application/use-cases/GetPendingApprovalsUseCase');
  
  const { QuotationsController } = require('../quotations/interfaces/http/QuotationsController');
  const { createQuotationRouter } = require('../quotations/interfaces/http/quotationRoutes');
  const { SettingsService } = require('../settings/SettingsService');

  const quotationRepo = new PrismaQuotationRepository(prisma);
  const quotationLineItemRepo = new PrismaQuotationLineItemRepository(prisma);
  const quotationHistoryRepo = new PrismaQuotationStatusHistoryRepository(prisma);
  
  const settingsService = new SettingsService(tenantRepository);

  /*
   * Customer-facing quotation delivery (§6.5).
   *
   * The reader is shared between three consumers — the public JSON view, the
   * PDF renderer and the email that carries the link — so all three describe
   * the same document. A separate query per consumer is how a PDF total ends up
   * disagreeing with the web page it was downloaded from.
   */
  const publicQuotationReader = new PrismaPublicQuotationReader(prisma);
  const quotationDelivery = new QuotationDeliveryService(
    publicQuotationReader,
    emailSender,
    process.env.FRONTEND_URL || 'http://localhost:5173'
  );

  // Needed by GetQuotationDetailUseCase below to answer "does an invoice
  // already exist for this quotation" (drives the frontend's "Convert to
  // Invoice" button). Declared here, ahead of the Invoices Routes block
  // further down, purely because that is where GetQuotationDetailUseCase is
  // constructed — the two blocks otherwise share nothing.
  const { PrismaInvoiceRepository: PrismaInvoiceRepositoryForQuotationDetail } = require('../invoices/infrastructure/repositories/PrismaInvoiceRepository');
  const invoiceRepoForQuotationDetail = new PrismaInvoiceRepositoryForQuotationDetail(prisma);

  // Named rather than inlined: Accept and Reject are also how the client
  // responds from the public link (RespondToPublicQuotationUseCase below), so
  // both callers share the one instance instead of each holding its own
  // wiring of the same dependencies.
  const markQuotationAcceptedUseCase = new MarkQuotationAcceptedUseCase(quotationRepo, quotationLineItemRepo, quotationHistoryRepo, stockLevelRepo, stockTxManager, quotationWriteTx, userRepository, notificationEmailDispatcher);
  const markQuotationRejectedUseCase = new MarkQuotationRejectedUseCase(quotationWriteTx, userRepository, notificationEmailDispatcher);

  const quotationsController = new QuotationsController(
    new CreateQuotationUseCase(quotationRepo, quotationLineItemRepo, quotationHistoryRepo, prismaClientRepository, productRepo, warehouseRepo),
    new UpdateQuotationUseCase(quotationRepo, quotationLineItemRepo, productRepo, warehouseRepo, stockLevelRepo, quotationWriteTx, quotationDelivery),
    // Each transition takes the email dispatcher so it can send AFTER its
    // transaction commits — see runWithPostCommitEmail.
    // Submit and Approve are the two routes into SENT, so they are the two
    // that deliver to the customer.
    new SubmitQuotationUseCase(quotationWriteTx, userRepository, quotationLineItemRepo, stockLevelRepo, notificationEmailDispatcher, quotationDelivery),
    new ApproveQuotationUseCase(quotationWriteTx, userRepository, quotationLineItemRepo, stockLevelRepo, notificationEmailDispatcher, quotationDelivery),
    new ReturnQuotationToDraftUseCase(quotationWriteTx, userRepository, notificationEmailDispatcher),
    markQuotationAcceptedUseCase,
    markQuotationRejectedUseCase,
    new ExpireQuotationUseCase(quotationWriteTx, userRepository, notificationEmailDispatcher),
    new SearchQuotationsUseCase(quotationRepo),
    new GetQuotationDetailUseCase(quotationRepo, quotationLineItemRepo, quotationHistoryRepo, invoiceRepoForQuotationDetail),
    new GetPendingApprovalsUseCase(quotationRepo),
    settingsService
  );

  /*
   * The customer-facing quotation view — no tenant prefix and no auth.
   *
   * Mounted BEFORE its tenant-scoped sibling below: Express matches routes in
   * registration order, and `/api/:tenantSlug/quotations` is a wildcard that
   * would otherwise match `/api/public/quotations/<token>` too (with
   * tenantSlug="public"), routing it into the authenticated staff router and
   * 401'ing every customer who opens their link. See publicQuotationRoutes for
   * what stands in for authentication here instead.
   */
  app.use(
    '/api/public/quotations',
    createPublicQuotationRouter(
      new GetPublicQuotationUseCase(publicQuotationReader),
      new QuotationPdfRenderer(),
      new RespondToPublicQuotationUseCase(publicQuotationReader, markQuotationAcceptedUseCase, markQuotationRejectedUseCase)
    )
  );

  const quotationRoutes = createQuotationRouter(quotationsController, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/quotations', quotationRoutes);

  // Invoices Routes
  //
  // Mirrors the Quotations block above: converted from an ACCEPTED quotation
  // (ConvertQuotationToInvoiceUseCase), never created standalone. No approval
  // step and no stock deduction — both already happened on the way to the
  // quotation being ACCEPTED — so this composition root is shorter than the
  // Quotations one above it.
  const { PrismaInvoiceRepository } = require('../invoices/infrastructure/repositories/PrismaInvoiceRepository');
  const { PrismaInvoiceLineItemRepository } = require('../invoices/infrastructure/repositories/PrismaInvoiceLineItemRepository');
  const { PrismaInvoiceStatusHistoryRepository } = require('../invoices/infrastructure/repositories/PrismaInvoiceStatusHistoryRepository');
  const { PrismaInvoiceWriteTransaction } = require('../invoices/infrastructure/PrismaInvoiceWriteTransaction');
  const { PrismaInvoicePdfReader } = require('../invoices/infrastructure/PrismaInvoicePdfReader');
  const { InvoicePdfRenderer } = require('../invoices/infrastructure/InvoicePdfRenderer');

  const { ConvertQuotationToInvoiceUseCase } = require('../invoices/application/use-cases/ConvertQuotationToInvoiceUseCase');
  const { SendInvoiceUseCase } = require('../invoices/application/use-cases/SendInvoiceUseCase');
  const { MarkInvoicePaidUseCase } = require('../invoices/application/use-cases/MarkInvoicePaidUseCase');
  const { VoidInvoiceUseCase } = require('../invoices/application/use-cases/VoidInvoiceUseCase');
  const { SearchInvoicesUseCase } = require('../invoices/application/use-cases/SearchInvoicesUseCase');
  const { GetInvoiceDetailUseCase } = require('../invoices/application/use-cases/GetInvoiceDetailUseCase');
  const { GetInvoicePdfViewUseCase } = require('../invoices/application/GetInvoicePdfViewUseCase');

  const { InvoicesController } = require('../invoices/interfaces/http/InvoicesController');
  const { createInvoiceRouter } = require('../invoices/interfaces/http/invoiceRoutes');

  const invoiceRepo = new PrismaInvoiceRepository(prisma);
  const invoiceLineItemRepo = new PrismaInvoiceLineItemRepository(prisma);
  const invoiceHistoryRepo = new PrismaInvoiceStatusHistoryRepository(prisma);
  const invoiceWriteTx = new PrismaInvoiceWriteTransaction(prisma);
  const invoicePdfReader = new PrismaInvoicePdfReader(prisma);

  const invoicesController = new InvoicesController(
    new ConvertQuotationToInvoiceUseCase(quotationRepo, quotationLineItemRepo, invoiceRepo, invoiceWriteTx),
    new SendInvoiceUseCase(invoiceWriteTx),
    new MarkInvoicePaidUseCase(invoiceWriteTx),
    new VoidInvoiceUseCase(invoiceWriteTx),
    new SearchInvoicesUseCase(invoiceRepo),
    new GetInvoiceDetailUseCase(invoiceRepo, invoiceLineItemRepo, invoiceHistoryRepo),
    new GetInvoicePdfViewUseCase(invoicePdfReader),
    new InvoicePdfRenderer()
  );

  const invoiceRoutes = createInvoiceRouter(invoicesController, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/invoices', invoiceRoutes);

  // Media Routes (profile photos + workspace branding)
  const { MediaController } = require('../media/interfaces/http/MediaController');
  const { createMediaRouter } = require('../media/interfaces/http/mediaRoutes');
  const { UPLOADS_DIR } = require('../media/MediaService');

  const mediaController = new MediaController();
  const mediaRoutes = createMediaRouter(mediaController, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/media', mediaRoutes);

  // Serve stored images. Filenames contain a UUID and are never reused, so a
  // long immutable cache is safe — replacing an image yields a new URL.
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      maxAge: '1y',
      immutable: true,
      // These are user-supplied files; never let the browser sniff a
      // different content type out of one.
      setHeaders: (res: any) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Override Helmet's default CORP to allow cross-origin image loading
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    })
  );

  // Settings Routes
  const { SettingsController } = require('../settings/interfaces/http/SettingsController');
  const { createSettingsRouter } = require('../settings/interfaces/http/settingsRoutes');
  
  const { TenantProfileStore } = require('../settings/infrastructure/TenantProfileStore');
  const { UpdateTenantSettingsUseCase } = require('../settings/application/use-cases/UpdateTenantSettingsUseCase');

  const tenantProfileStore = new TenantProfileStore();
  const updateTenantSettingsUseCase = new UpdateTenantSettingsUseCase(tenantRepository, tenantProfileStore);
  const settingsController = new SettingsController(tenantRepository, tenantProfileStore, updateTenantSettingsUseCase);
  const settingsRoutes = createSettingsRouter(settingsController, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/settings', settingsRoutes);

  // Integrations Routes
  const { PrismaIntegrationRepository } = require('../integrations/infrastructure/repositories/PrismaIntegrationRepository');
  const { GetIntegrationsUseCase } = require('../integrations/application/use-cases/GetIntegrationsUseCase');
  const { ConnectIntegrationUseCase } = require('../integrations/application/use-cases/ConnectIntegrationUseCase');
  const { DisconnectIntegrationUseCase } = require('../integrations/application/use-cases/DisconnectIntegrationUseCase');
  const { IntegrationsController } = require('../integrations/interfaces/http/IntegrationsController');
  const { createIntegrationRouter } = require('../integrations/interfaces/http/integrationRoutes');

  const integrationRepo = overrides?.integrationRepository ?? new PrismaIntegrationRepository(prisma);

  const integrationsController = new IntegrationsController(
    new GetIntegrationsUseCase(integrationRepo),
    new ConnectIntegrationUseCase(integrationRepo),
    new DisconnectIntegrationUseCase(integrationRepo)
  );

  const integrationRoutes = createIntegrationRouter(integrationsController, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/integrations', integrationRoutes);

  // Report Routes
  const { PrismaReportRepository } = require('../reports/infrastructure/PrismaReportRepository');
  const { GetRevenueReportUseCase } = require('../reports/application/use-cases/GetRevenueReportUseCase');
  const { GetClientReportUseCase } = require('../reports/application/use-cases/GetClientReportUseCase');
  const { GetInventoryReportUseCase } = require('../reports/application/use-cases/GetInventoryReportUseCase');
  const { ReportsController } = require('../reports/interfaces/http/ReportsController');
  const { createReportRouter } = require('../reports/interfaces/http/reportRoutes');

  const { GetAppointmentReportUseCase } = require('../reports/application/use-cases/GetAppointmentReportUseCase');
  const { GetClientTrendUseCase } = require('../reports/application/use-cases/GetClientTrendUseCase');
  const { GetLowStockReportUseCase } = require('../reports/application/use-cases/GetLowStockReportUseCase');
  const { ReportPdfRenderer } = require('../reports/infrastructure/ReportPdfRenderer');

  const reportRepo = new PrismaReportRepository(prisma);
  const reportsController = new ReportsController(
    new GetRevenueReportUseCase(reportRepo),
    new GetClientReportUseCase(reportRepo),
    new GetInventoryReportUseCase(reportRepo),
    new GetAppointmentReportUseCase(reportRepo),
    new GetClientTrendUseCase(reportRepo),
    new GetLowStockReportUseCase(reportRepo),
    new ReportPdfRenderer()
  );

  const reportRoutes = createReportRouter(reportsController, tokenService, tenantRepository);
  app.use('/api/:tenantSlug/reports', reportRoutes);

  // Notifications
  const notificationController = new NotificationController(
    new GetNotificationsUseCase(notificationRepository),
    new MarkNotificationReadUseCase(notificationRepository),
    new MarkAllNotificationsReadUseCase(notificationRepository),
    new GetNotificationSettingsUseCase(notificationSettingsRepository),
    new UpdateNotificationSettingsUseCase(notificationSettingsRepository)
  );
  app.use(
    '/api/:tenantSlug/notifications',
    createNotificationRouter(notificationController, tokenService, tenantRepository)
  );

  app.use(errorHandler);

  return app;
};
