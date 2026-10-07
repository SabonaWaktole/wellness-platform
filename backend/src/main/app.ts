import express from 'express';
import { RecordScopeResolver } from '../access/application/RecordScopeResolver';
import { PrismaTeamRoster } from '../access/infrastructure/PrismaTeamRoster';
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
import { IAccessRepository } from '../access/application/ports/IAccessRepository';
import { PrismaAccessRepository } from '../access/infrastructure/PrismaAccessRepository';
import { InMemoryAccessCache } from '../access/infrastructure/InMemoryAccessCache';
import { IRoleCatalogue } from '../access/application/ports/IRoleCatalogue';
import { PrismaRoleCatalogue } from '../access/infrastructure/PrismaRoleCatalogue';
import { RoleManagementGuard } from '../access/application/RoleManagementGuard';
import { ListRolesUseCase } from '../access/application/use-cases/ListRolesUseCase';
import { ListRolePermissionsUseCase } from '../access/application/use-cases/ListRolePermissionsUseCase';
import { UpdateRolePermissionsUseCase } from '../access/application/use-cases/UpdateRolePermissionsUseCase';
import { CopyRoleUseCase } from '../access/application/use-cases/CopyRoleUseCase';
import { RenameRoleUseCase } from '../access/application/use-cases/RenameRoleUseCase';
import { DeleteCustomRoleUseCase } from '../access/application/use-cases/DeleteCustomRoleUseCase';
import { IRoleAdminTransaction } from '../access/application/ports/IRoleAdminTransaction';
import { PrismaRoleAdminTransaction } from '../access/infrastructure/PrismaRoleAdminTransaction';
import { RolesController } from '../access/interfaces/http/RolesController';
import { createRoleRouter } from '../access/interfaces/http/roleRoutes';
import { IUserAdminTransaction } from '../auth/application/ports/IUserAdminTransaction';
import { PrismaUserAdminTransaction } from '../auth/infrastructure/PrismaUserAdminTransaction';
import { ResolveAccessContextUseCase } from '../access/application/use-cases/ResolveAccessContextUseCase';
import { IAuditEntryReader } from '../audit/application/ports/IAuditEntryReader';
import { PrismaAuditEntryReader } from '../audit/infrastructure/PrismaAuditEntryReader';
import { SearchAuditEntriesUseCase } from '../audit/application/use-cases/SearchAuditEntriesUseCase';
import { GetAuditEntryUseCase } from '../audit/application/use-cases/GetAuditEntryUseCase';
import { ExportAuditEntriesUseCase } from '../audit/application/use-cases/ExportAuditEntriesUseCase';
import { AuditController } from '../audit/interfaces/http/AuditController';
import { createAuditRouter } from '../audit/interfaces/http/auditRoutes';
import { ILookupWriteTransaction } from '../lookups/application/ports/ILookupWriteTransaction';
import { PrismaLookupStore } from '../lookups/infrastructure/PrismaLookupStore';
import { PrismaLookupWriteTransaction } from '../lookups/infrastructure/PrismaLookupWriteTransaction';
import { PrismaLookupInUsePolicy } from '../lookups/infrastructure/PrismaLookupInUsePolicy';
import { createLookupRules } from '../lookups/application/LookupListRules';
import { ListLookupItemsUseCase } from '../lookups/application/use-cases/ListLookupItemsUseCase';
import { CreateLookupItemUseCase } from '../lookups/application/use-cases/CreateLookupItemUseCase';
import { UpdateLookupItemUseCase } from '../lookups/application/use-cases/UpdateLookupItemUseCase';
import { ReorderLookupItemsUseCase } from '../lookups/application/use-cases/ReorderLookupItemsUseCase';
import { SetLookupItemActiveUseCase } from '../lookups/application/use-cases/SetLookupItemActiveUseCase';
import { DeleteLookupItemUseCase } from '../lookups/application/use-cases/DeleteLookupItemUseCase';
import { LookupsController } from '../lookups/interfaces/http/LookupsController';
import { createLookupRouter } from '../lookups/interfaces/http/lookupRoutes';
import { IPricingWriteTransaction } from '../pricing/application/ports/IPricingWriteTransaction';
import { PrismaPricingStore } from '../pricing/infrastructure/PrismaPricingStore';
import { PrismaPricingWriteTransaction } from '../pricing/infrastructure/PrismaPricingWriteTransaction';
import { GetPricingConfigurationUseCase } from '../pricing/application/use-cases/GetPricingConfigurationUseCase';
import { CreatePricingItemUseCase } from '../pricing/application/use-cases/CreatePricingItemUseCase';
import { UpdatePricingItemUseCase } from '../pricing/application/use-cases/UpdatePricingItemUseCase';
import { ReorderPricingItemsUseCase } from '../pricing/application/use-cases/ReorderPricingItemsUseCase';
import { SetPricingItemActiveUseCase } from '../pricing/application/use-cases/SetPricingItemActiveUseCase';
import { DeletePricingItemUseCase } from '../pricing/application/use-cases/DeletePricingItemUseCase';
import { SetPriceZoneCitiesUseCase } from '../pricing/application/use-cases/SetPriceZoneCitiesUseCase';
import { SetRiskSurchargeUseCase } from '../pricing/application/use-cases/SetRiskSurchargeUseCase';
import { SetDiscountCapUseCase } from '../pricing/application/use-cases/SetDiscountCapUseCase';
import { ListCitiesWithoutZoneUseCase } from '../pricing/application/use-cases/ListCitiesWithoutZoneUseCase';
import { LoadPricingConfigUseCase } from '../pricing/application/use-cases/LoadPricingConfigUseCase';
import { TestPriceCalculationUseCase } from '../pricing/application/use-cases/TestPriceCalculationUseCase';
import { CreateServicePackageUseCase } from '../pricing/application/use-cases/CreateServicePackageUseCase';
import { SetPackageServicesUseCase } from '../pricing/application/use-cases/SetPackageServicesUseCase';
import { SetDefaultPackageUseCase } from '../pricing/application/use-cases/SetDefaultPackageUseCase';
import { ListActivePackagesUseCase } from '../pricing/application/use-cases/ListActivePackagesUseCase';
import { UpdateOfferSettingsUseCase } from '../pricing/application/use-cases/UpdateOfferSettingsUseCase';
import { CalculatePriceUseCase } from '../pricing/application/use-cases/CalculatePriceUseCase';
import { SaveDraftOfferUseCase } from '../quotations/application/offers/SaveDraftOfferUseCase';
import { PrismaOfferStore } from '../quotations/infrastructure/offers/PrismaOfferStore';
import { PrismaOfferWriteTransaction } from '../quotations/infrastructure/offers/PrismaOfferWriteTransaction';
import { GetDealOffersUseCase } from '../deals/application/use-cases/GetDealOffersUseCase';
import { ListOffersUseCase } from '../quotations/application/offers/ListOffersUseCase';
import { GetOfferDocumentUseCase } from '../quotations/application/offers/GetOfferDocumentUseCase';
import { MarkOfferReadyUseCase } from '../quotations/application/offers/MarkOfferReadyUseCase';
import { MarkOfferSentUseCase } from '../quotations/application/offers/MarkOfferSentUseCase';
import { RecordOfferResponseUseCase } from '../quotations/application/offers/RecordOfferResponseUseCase';
import { ReviseOfferUseCase } from '../quotations/application/offers/ReviseOfferUseCase';
import { PrismaOfferDocumentSource } from '../quotations/infrastructure/offers/PrismaOfferDocumentSource';
import { OfferPdfRenderer } from '../quotations/infrastructure/offers/OfferPdfRenderer';
import { StandaloneOfferNumbers } from '../quotations/infrastructure/offers/PrismaOfferNumbers';
import { OffersController } from '../quotations/interfaces/http/offers/OffersController';
import { createOfferRouter } from '../quotations/interfaces/http/offers/offerRoutes';
import { DecideDiscountApprovalUseCase } from '../quotations/application/offers/DecideDiscountApprovalUseCase';
import { ListPendingApprovalsUseCase } from '../quotations/application/offers/ListPendingApprovalsUseCase';
import { WithdrawDiscountApprovalUseCase } from '../quotations/application/offers/WithdrawDiscountApprovalUseCase';
import { DiscountApprovalsController } from '../quotations/interfaces/http/offers/DiscountApprovalsController';
import { createDiscountApprovalRouter } from '../quotations/interfaces/http/offers/discountApprovalRoutes';
import { PrismaDiscountApprovalStore } from '../discounts/infrastructure/PrismaDiscountApprovalStore';
import { PrismaPermissionHolderDirectory } from '../notifications/infrastructure/PrismaPermissionHolderDirectory';
import { PricingScreen } from '../pricing/application/PricingScreen';
import { PrismaPricingSubjectReader } from '../pricing/infrastructure/PrismaPricingSubjectReader';
import { PricingController } from '../pricing/interfaces/http/PricingController';
import { createPricingRouter } from '../pricing/interfaces/http/pricingRoutes';
import { ISalesScriptWriteTransaction } from '../salesScript/application/ports/ISalesScriptWriteTransaction';
import { PrismaSalesScriptStore } from '../salesScript/infrastructure/PrismaSalesScriptStore';
import { PrismaSalesScriptWriteTransaction } from '../salesScript/infrastructure/PrismaSalesScriptWriteTransaction';
import { IDealWriteTransaction } from '../deals/application/ports/IDealWriteTransaction';
import { PrismaDealWriteTransaction } from '../deals/infrastructure/PrismaDealWriteTransaction';
import { PrismaDealStore } from '../deals/infrastructure/PrismaDealStore';
import { GetDealUseCase } from '../deals/application/use-cases/GetDealUseCase';
import { CreateDealUseCase } from '../deals/application/use-cases/CreateDealUseCase';
import { UpdateDealUseCase } from '../deals/application/use-cases/UpdateDealUseCase';
import { ChangeDealStageUseCase } from '../deals/application/use-cases/ChangeDealStageUseCase';
import { ReassignDealUseCase } from '../deals/application/use-cases/ReassignDealUseCase';
import { WinDealUseCase } from '../deals/application/use-cases/WinDealUseCase';
import { LoseDealUseCase } from '../deals/application/use-cases/LoseDealUseCase';
import { ReopenDealUseCase } from '../deals/application/use-cases/ReopenDealUseCase';
import { DeleteDealUseCase } from '../deals/application/use-cases/DeleteDealUseCase';
import { SearchDealsUseCase } from '../deals/application/use-cases/SearchDealsUseCase';
import { GetPipelineBoardUseCase } from '../deals/application/use-cases/GetPipelineBoardUseCase';
import { GetDealActivitiesUseCase } from '../deals/application/use-cases/GetDealActivitiesUseCase';
import { PrismaDealActivityStore } from '../deals/infrastructure/PrismaDealActivityStore';
import { DealController } from '../deals/interfaces/http/DealController';
import { createDealRouter } from '../deals/interfaces/http/dealRoutes';
import { GetPublishedScriptUseCase } from '../salesScript/application/use-cases/GetPublishedScriptUseCase';
import { GetScriptDraftUseCase } from '../salesScript/application/use-cases/GetScriptDraftUseCase';
import { SaveScriptDraftUseCase } from '../salesScript/application/use-cases/SaveScriptDraftUseCase';
import { PublishScriptUseCase } from '../salesScript/application/use-cases/PublishScriptUseCase';
import { ListScriptVersionsUseCase } from '../salesScript/application/use-cases/ListScriptVersionsUseCase';
import { GetScriptVersionUseCase } from '../salesScript/application/use-cases/GetScriptVersionUseCase';
import { RestoreScriptVersionUseCase } from '../salesScript/application/use-cases/RestoreScriptVersionUseCase';
import { SalesScriptController } from '../salesScript/interfaces/http/SalesScriptController';
import { createSalesScriptRouter } from '../salesScript/interfaces/http/salesScriptRoutes';
import { PrismaStatusLabelStore } from '../statuses/infrastructure/PrismaStatusLabelStore';
import { PrismaStatusLabelWriteTransaction } from '../statuses/infrastructure/PrismaStatusLabelWriteTransaction';
import { ListStatusLabelsUseCase } from '../statuses/application/use-cases/ListStatusLabelsUseCase';
import { UpdateStatusLabelUseCase } from '../statuses/application/use-cases/UpdateStatusLabelUseCase';
import { ReorderStatusLabelsUseCase } from '../statuses/application/use-cases/ReorderStatusLabelsUseCase';
import { StatusLabelsController } from '../statuses/interfaces/http/StatusLabelsController';
import { createStatusLabelRouter } from '../statuses/interfaces/http/statusLabelRoutes';
import { prisma as sharedPrisma } from '../shared/infrastructure/prisma/client';
import { PrismaFollowUpStore } from '../appointments/infrastructure/followUps/PrismaFollowUpStore';
import { PrismaFollowUpWriteTransaction } from '../appointments/infrastructure/followUps/PrismaFollowUpWriteTransaction';
import { ScheduleFollowUpUseCase } from '../appointments/application/followUps/ScheduleFollowUpUseCase';
import { CompleteFollowUpUseCase } from '../appointments/application/followUps/CompleteFollowUpUseCase';
import {
  CancelFollowUpUseCase,
  ReassignFollowUpUseCase,
  RescheduleFollowUpUseCase,
} from '../appointments/application/followUps/ChangeFollowUpUseCases';
import {
  CountMyOverdueFollowUpsUseCase,
  GetFollowUpUseCase,
  ListFollowUpsUseCase,
  ListMyFollowUpsUseCase,
} from '../appointments/application/followUps/ListFollowUpsUseCases';
import { FollowUpController } from '../appointments/interfaces/http/followUps/FollowUpController';
import { PrismaCalendarStore } from '../appointments/infrastructure/calendar/PrismaCalendarStore';
import { GetCalendarUseCase } from '../appointments/application/calendar/GetCalendarUseCase';
import { CalendarController } from '../appointments/interfaces/http/calendar/CalendarController';
import { createCalendarRouter } from '../appointments/interfaces/http/calendar/calendarRoutes';
import { createFollowUpRouter } from '../appointments/interfaces/http/followUps/followUpRoutes';
import { AddInteractionUseCase } from '../clients/application/use-cases/AddInteractionUseCase';
import { PrismaClientRepository as FollowUpClientRepository } from '../clients/infrastructure/repositories/PrismaClientRepository';
import { PrismaContactPersonRepository } from '../clients/infrastructure/repositories/PrismaContactPersonRepository';
import { PrismaInteractionWriteTransaction } from '../clients/infrastructure/repositories/PrismaInteractionWriteTransaction';
import { PrismaSalesSettingsStore } from '../deals/infrastructure/PrismaSalesSettingsStore';
import { GetSalesSettingsUseCase, UpdateSalesSettingsUseCase } from '../deals/application/use-cases/SalesSettingsUseCases';
import { createSalesSettingsRouter } from '../deals/interfaces/http/salesSettingsRoutes';
import { ContractValidityBadges } from '../contracts/application/ContractValidityBadges';
import { PrismaContractValidityReader } from '../contracts/infrastructure/PrismaContractValidityReader';
import { PrismaContractSettingsStore } from '../contracts/infrastructure/PrismaContractSettingsStore';
import { GetContractSettingsUseCase, UpdateContractSettingsUseCase } from '../contracts/application/use-cases/ContractSettingsUseCases';
import { createContractSettingsRouter } from '../contracts/interfaces/http/contractSettingsRoutes';
import { PrismaMembershipSettingsStore } from '../membership/infrastructure/PrismaMembershipSettingsStore';
import { PrismaRelationshipStore } from '../membership/infrastructure/PrismaRelationshipStore';
import { PrismaBenefitStore } from '../membership/infrastructure/PrismaBenefitStore';
import { PrismaMembershipWriteTransaction } from '../membership/infrastructure/PrismaMembershipWriteTransaction';
import {
  GetMembershipSettingsUseCase,
  UpdateMembershipSettingsUseCase,
  UpdateTierSettingUseCase,
} from '../membership/application/use-cases/MembershipSettingsUseCases';
import {
  CreateRelationshipUseCase,
  ListRelationshipsUseCase,
  UpdateRelationshipUseCase,
} from '../membership/application/use-cases/RelationshipUseCases';
import {
  CreateBenefitServiceUseCase,
  GetBenefitTableUseCase,
  UpdateBenefitServiceUseCase,
} from '../membership/application/use-cases/BenefitUseCases';
import { createMembershipSettingsRouter } from '../membership/interfaces/http/membershipSettingsRoutes';
import { PrismaMemberStore } from '../membership/infrastructure/PrismaMemberStore';
import {
  ChangeMemberStatusUseCase,
  GetMemberUseCase,
  RegisterMemberUseCase,
  SearchMembersUseCase,
  UpdateMemberUseCase,
} from '../membership/application/use-cases/MemberUseCases';
import { AddFamilyMemberUseCase, ListFamilyRelationshipsUseCase, RemoveFamilyLinkUseCase } from '../membership/application/use-cases/FamilyUseCases';
import { CorrectMemberTierUseCase, ExpireMemberTermsUseCase } from '../membership/application/use-cases/MemberTermUseCases';
import { GetCompanyMembershipUseCase, RemoveEmployeesUseCase, RemoveEmployeeUseCase, SyncEmployerMembersUseCase } from '../membership/application/use-cases/EmployerUseCases';
import { ContractValidityListener } from '../membership/application/ContractValidityListener';
import { SponsorValidity } from '../membership/application/SponsorValidity';
import { createCompanyMembershipRouter } from '../membership/interfaces/http/companyMembershipRoutes';
import { DecideVipRequestUseCase, EndVipUseCase, ListVipRequestsUseCase, RequestVipUseCase } from '../membership/application/use-cases/VipUseCases';
import { PrismaVipRequestStore } from '../membership/infrastructure/PrismaVipRequestStore';
import { createMemberRouter } from '../membership/interfaces/http/memberRoutes';
import { createMemberPaymentRouter } from '../membership/interfaces/http/memberPaymentRoutes';
import { createMembershipReportRouter } from '../membership/interfaces/http/membershipReportRoutes';
import { PrismaMembershipReportReader } from '../membership/infrastructure/PrismaMembershipReportReader';
import { GetMembershipReportUseCase } from '../membership/application/reports/GetMembershipReportUseCase';
import { ExportMembershipReportUseCase } from '../membership/application/reports/ExportMembershipReportUseCase';
import { createEmployeeImportRouter } from '../membership/interfaces/http/employeeImportRoutes';
import { PrismaEmployeeImportStore } from '../membership/infrastructure/PrismaEmployeeImportStore';
import { PrismaCardStore } from '../membership/infrastructure/PrismaCardStore';
import { MemberStandingResolver } from '../membership/application/memberStanding';
import { PrismaVerificationStore } from '../membership/infrastructure/PrismaVerificationStore';
import { PublicVerifyUseCase, RecordIdentityCheckUseCase, VerifyMemberUseCase } from '../membership/application/use-cases/VerificationUseCases';
import { createVerificationRouter } from '../membership/interfaces/http/verificationRoutes';
import { createPublicVerifyRouter } from '../membership/interfaces/http/publicVerifyRoutes';
import { QrCodeSvg } from '../membership/infrastructure/QrCodeSvg';
import { createPublicCardRouter } from '../membership/interfaces/http/publicCardRoutes';
import { ExportUploadCardLinksUseCase, GetCardLinkUseCase, GetPublicCardUseCase, ReplaceCardLinkUseCase } from '../membership/application/use-cases/CardUseCases';
import { readPublicBaseUrl, requireJwtSecret } from './config/env';
import { XlsxEmployeeSheets } from '../membership/infrastructure/excel/XlsxEmployeeSheets';
import {
  ConfirmEmployeeImportUseCase,
  GetEmployeeImportResultUseCase,
  GetEmployeeTemplateUseCase,
  ListEmployeeImportsUseCase,
  PreviewEmployeeImportUseCase,
} from '../membership/application/use-cases/EmployeeImportUseCases';
import { PrismaMemberPaymentStore } from '../membership/infrastructure/PrismaMemberPaymentStore';
import { MemberReceiptPdfRenderer } from '../membership/infrastructure/MemberReceiptPdfRenderer';
import {
  ExportMemberPaymentsUseCase,
  GetPaymentReceiptUseCase,
  QuotePaymentUseCase,
  RecordMemberPaymentUseCase,
  SearchMemberPaymentsUseCase,
  VoidMemberPaymentUseCase,
} from '../membership/application/use-cases/MemberPaymentUseCases';
import { generateShareToken } from '../quotations/domain/shareToken';

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
  /** Slice 3: overridable so tests can seed a fake AccessRecord instead of hitting Postgres. */
  accessRepository: IAccessRepository;
  /** Fresh per `createApp()` call by default, so test suites never share cached grants. */
  accessCache: InMemoryAccessCache;
  /** Slice 5: the workspace's roles, and the transaction user-admin writes and their audit entries share. */
  roleCatalogue: IRoleCatalogue;
  userAdminTransaction: IUserAdminTransaction;
  /** Slice 6: the transaction role edits and their audit entries share. */
  roleAdminTransaction: IRoleAdminTransaction;
  /** Slice 7: the audit log viewer's read side. */
  auditEntryReader: IAuditEntryReader;
  /** Slice 8: the transaction list writes and their audit entries share. */
  lookupWriteTransaction: ILookupWriteTransaction;
  /** M2 Slice 3: the transaction pricing writes and their audit entries share. */
  pricingWriteTransaction: IPricingWriteTransaction;
  /** M2 Slice 5: the transaction script writes, and a publish with its audit entry, share. */
  salesScriptWriteTransaction: ISalesScriptWriteTransaction;
  /** M2 Slice 6: the transaction deal writes, their stage history and audit entries share. */
  dealWriteTransaction: IDealWriteTransaction;
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
        'https://nevacrm.eu',
        'https://www.nevacrm.eu',
        process.env.FRONTEND_URL
      ];
      const devOrigin = process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin ?? '');
      if (!origin || devOrigin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    // The offer PDF's file name (FR-OFR-06) must be readable by the frontend
    // when it is served from another origin.
    exposedHeaders: ['Content-Disposition'],
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
  const accessRepository = overrides?.accessRepository ?? new PrismaAccessRepository();
  const accessCache = overrides?.accessCache ?? new InMemoryAccessCache();
  const resolveAccessContext = new ResolveAccessContextUseCase(accessRepository, accessCache);
  const recordScopes = new RecordScopeResolver(new PrismaTeamRoster());
  const roleCatalogue = overrides?.roleCatalogue ?? new PrismaRoleCatalogue();
  const userAdminTransaction = overrides?.userAdminTransaction ?? new PrismaUserAdminTransaction();
  const roleManagementGuard = new RoleManagementGuard(roleCatalogue);
  const roleAdminTransaction = overrides?.roleAdminTransaction ?? new PrismaRoleAdminTransaction();
  const auditEntryReader = overrides?.auditEntryReader ?? new PrismaAuditEntryReader();
  const lookupWriteTransaction = overrides?.lookupWriteTransaction ?? new PrismaLookupWriteTransaction();
  const pricingWriteTransaction = overrides?.pricingWriteTransaction ?? new PrismaPricingWriteTransaction();
  const salesScriptWriteTransaction = overrides?.salesScriptWriteTransaction ?? new PrismaSalesScriptWriteTransaction();
  const dealWriteTransaction = overrides?.dealWriteTransaction ?? new PrismaDealWriteTransaction();

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
  const createUserUseCase = new CreateUserUseCase(userRepository, passwordHasher, roleCatalogue, userAdminTransaction);
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
  const inviteStaffUseCase = new InviteStaffUseCase(roleCatalogue, userAdminTransaction, emailSender);
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
  const acceptInvitationUseCase = new AcceptInvitationUseCase(
    invitationRepository,
    passwordHasher,
    tenantRepository,
    roleCatalogue,
    userAdminTransaction,
    notificationService
  );
  const requestPasswordResetUseCase = new RequestPasswordResetUseCase(userRepository, prtRepository, emailSender, tenantRepository);
  const resetPasswordUseCase = new ResetPasswordUseCase(prtRepository, userRepository, passwordHasher);
  const getTenantStaffUseCase = new GetTenantStaffUseCase(userRepository, roleCatalogue);
  const listRolesUseCase = new ListRolesUseCase(roleCatalogue);
  const getPendingInvitationsUseCase = new GetPendingInvitationsUseCase(invitationRepository);
  const updateUserProfileUseCase = new UpdateUserProfileUseCase(userRepository);
  const changePasswordUseCase = new ChangePasswordUseCase(userRepository, passwordHasher);
  const getUserProfileUseCase = new GetUserProfileUseCase(userRepository);
  const updateUserRoleUseCase = new UpdateUserRoleUseCase(
    userRepository,
    roleCatalogue,
    roleManagementGuard,
    userAdminTransaction,
    accessCache
  );
  const cancelInvitationUseCase = new CancelInvitationUseCase(invitationRepository);
  const deactivateUserUseCase = new DeactivateUserUseCase(userRepository, roleManagementGuard, userAdminTransaction, accessCache);
  const getDeactivationImpactUseCase = new GetDeactivationImpactUseCase(userRepository);
  const reactivateUserUseCase = new ReactivateUserUseCase(userRepository, userAdminTransaction, accessCache);

  // Platform Admin user lifecycle (suspend/reactivate/delete, including
  // Business Owner ownership transfer). Distinct actor and scope from the
  // Business-Owner-only deactivate/reactivate above — see PlatformSuspendUserUseCase.
  const ownershipTransferRepository = new PrismaOwnershipTransferRepository();
  const ownershipTransactions = new PrismaOwnershipTransactions(undefined, accessCache);
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
    changePasswordUseCase,
    resolveAccessContext,
    listRolesUseCase
  );

  // Auth Routes
  const { createGlobalAuthRoutes, createTenantAuthRoutes } = require('@auth/interfaces/http/routes/authRoutes');
  const globalAuthRoutes = createGlobalAuthRoutes(authController, tokenService, resolveAccessContext);
  const tenantAuthRoutes = createTenantAuthRoutes(authController, tokenService, tenantRepository, resolveAccessContext);
  
  app.use('/api/auth', globalAuthRoutes);
  app.use('/api/:tenantSlug/auth', tenantAuthRoutes);

  // Roles & permissions (Slice 6: FR-RBAC-03, 04, 08, 10).
  const rolesController = new RolesController(
    new ListRolePermissionsUseCase(roleCatalogue),
    new UpdateRolePermissionsUseCase(roleCatalogue, roleManagementGuard, roleAdminTransaction, accessCache),
    new CopyRoleUseCase(roleCatalogue, roleAdminTransaction),
    new RenameRoleUseCase(roleCatalogue, roleAdminTransaction),
    new DeleteCustomRoleUseCase(roleCatalogue, roleAdminTransaction)
  );
  app.use('/api/:tenantSlug/roles', createRoleRouter(rolesController, tokenService, tenantRepository, resolveAccessContext));

  // Audit log viewer (Slice 7: FR-AUD-06, 08).
  const auditController = new AuditController(
    new SearchAuditEntriesUseCase(auditEntryReader),
    new GetAuditEntryUseCase(auditEntryReader),
    new ExportAuditEntriesUseCase(auditEntryReader)
  );
  app.use('/api/:tenantSlug/audit', createAuditRouter(auditController, tokenService, tenantRepository, resolveAccessContext));

  // Settings → Lists: risk levels, business types (Slice 8: FR-SET-01, 02),
  // and areas, cities (Slice 9: FR-SET-03, 04).
  const lookupStore = new PrismaLookupStore();
  const lookupRules = createLookupRules(lookupStore);
  const lookupsController = new LookupsController(
    new ListLookupItemsUseCase(lookupStore, lookupRules),
    new CreateLookupItemUseCase(lookupStore, lookupRules, lookupWriteTransaction),
    new UpdateLookupItemUseCase(lookupStore, lookupRules, lookupWriteTransaction),
    new ReorderLookupItemsUseCase(lookupStore, lookupRules, lookupWriteTransaction),
    new SetLookupItemActiveUseCase(lookupStore, lookupRules, lookupWriteTransaction),
    new DeleteLookupItemUseCase(lookupStore, lookupRules, new PrismaLookupInUsePolicy(), lookupWriteTransaction)
  );
  app.use('/api/:tenantSlug/lookups', createLookupRouter(lookupsController, tokenService, tenantRepository, resolveAccessContext));

  // Settings → Pricing: bands, risk surcharges, visit frequencies, price zones,
  // discount cap and the test calculator (M2 Slice 3: FR-PCF-01..05, 07, 09).
  const pricingStore = new PrismaPricingStore();
  // The pricing screen (M2 Slice 8): one resolve step, shared by the
  // calculation and the draft offer's save.
  const pricingScreen = new PricingScreen(pricingStore, lookupStore, new LoadPricingConfigUseCase(pricingStore));
  const pricingSubjects = new PrismaPricingSubjectReader();
  const offerStore = new PrismaOfferStore();
  const offerWriteTransaction = new PrismaOfferWriteTransaction();
  const pricingController = new PricingController(
    new GetPricingConfigurationUseCase(pricingStore),
    new CreatePricingItemUseCase(pricingStore, pricingWriteTransaction),
    new UpdatePricingItemUseCase(pricingStore, pricingWriteTransaction),
    new ReorderPricingItemsUseCase(pricingStore, pricingWriteTransaction),
    new SetPricingItemActiveUseCase(pricingStore, pricingWriteTransaction),
    new DeletePricingItemUseCase(pricingStore, pricingWriteTransaction),
    new SetPriceZoneCitiesUseCase(pricingStore, pricingWriteTransaction),
    new SetRiskSurchargeUseCase(pricingStore, pricingWriteTransaction),
    new SetDiscountCapUseCase(pricingStore, pricingWriteTransaction),
    new ListCitiesWithoutZoneUseCase(pricingStore),
    new TestPriceCalculationUseCase(new LoadPricingConfigUseCase(pricingStore)),
    new CreateServicePackageUseCase(pricingStore, pricingWriteTransaction),
    new SetPackageServicesUseCase(pricingStore, pricingWriteTransaction),
    new SetDefaultPackageUseCase(pricingStore, pricingWriteTransaction),
    new ListActivePackagesUseCase(pricingStore),
    new UpdateOfferSettingsUseCase(pricingStore, pricingWriteTransaction),
    new CalculatePriceUseCase(pricingSubjects, pricingScreen, recordScopes)
  );
  app.use('/api/:tenantSlug/pricing', createPricingRouter(pricingController, tokenService, tenantRepository, resolveAccessContext));

  // The sales script: the panel salespeople read, and Settings → Sales script
  // where the Administrator edits, publishes and restores it (M2 Slice 5:
  // FR-SCR-03..07).
  const salesScriptStore = new PrismaSalesScriptStore();
  const salesScriptController = new SalesScriptController(
    new GetPublishedScriptUseCase(salesScriptStore),
    new GetScriptDraftUseCase(salesScriptStore),
    new SaveScriptDraftUseCase(salesScriptWriteTransaction),
    new PublishScriptUseCase(salesScriptWriteTransaction),
    new ListScriptVersionsUseCase(salesScriptStore),
    new GetScriptVersionUseCase(salesScriptStore),
    new RestoreScriptVersionUseCase(salesScriptWriteTransaction)
  );
  app.use(
    '/api/:tenantSlug/sales-script',
    createSalesScriptRouter(salesScriptController, tokenService, tenantRepository, resolveAccessContext)
  );

  // Deals and the pipeline board (M2 Slice 6: FR-DEAL-01..11, 13, 19).
  const dealStore = new PrismaDealStore();
  const getDeal = new GetDealUseCase(dealStore, recordScopes);
  // Who holds a scoped permission at a scope admitting a record's owner (M2
  // Slice 10, D9: discount approval fan-out, FR-DSC-05, 09).
  const permissionDirectory = new PrismaPermissionHolderDirectory(undefined, new PrismaTeamRoster());
  const dealController = new DealController(
    new CreateDealUseCase(dealStore, dealWriteTransaction, recordScopes, getDeal),
    getDeal,
    new UpdateDealUseCase(dealWriteTransaction, recordScopes, getDeal),
    new ChangeDealStageUseCase(dealWriteTransaction, recordScopes, getDeal),
    new ReassignDealUseCase(dealStore, dealWriteTransaction, recordScopes, getDeal),
    new DeleteDealUseCase(dealWriteTransaction, recordScopes),
    new SearchDealsUseCase(dealStore, recordScopes),
    new GetPipelineBoardUseCase(dealStore, recordScopes),
    new GetDealActivitiesUseCase(getDeal, new PrismaDealActivityStore()),
    // The deal's offers (M2 Slice 8): read on the deal page, saved from the pricing screen.
    new GetDealOffersUseCase(getDeal, offerStore, recordScopes),
    new SaveDraftOfferUseCase(
      pricingSubjects,
      pricingScreen,
      recordScopes,
      offerWriteTransaction,
      offerStore,
      userRepository,
      permissionDirectory,
      notificationEmailDispatcher
    ),
    // Won and lost (M2 Slice 13): one transaction over the deal, its offers, follow-ups and company.
    new WinDealUseCase(offerWriteTransaction, recordScopes, getDeal),
    new LoseDealUseCase(offerWriteTransaction, recordScopes, getDeal),
    new ReopenDealUseCase(dealWriteTransaction, recordScopes, getDeal)
  );
  app.use('/api/:tenantSlug/deals', createDealRouter(dealController, tokenService, tenantRepository, resolveAccessContext));

  // Offers (M2 Slice 9): the list, the PDF and its preview, and the status
  // steps Ready → Sent → Accepted / Rejected, with versions (FR-OFR-05..15).
  const offerDocuments = new PrismaOfferDocumentSource();
  const offersController = new OffersController(
    new ListOffersUseCase(offerStore, recordScopes),
    new GetOfferDocumentUseCase(offerStore, recordScopes, offerDocuments, new OfferPdfRenderer()),
    new MarkOfferReadyUseCase(offerWriteTransaction, recordScopes, offerDocuments, offerStore),
    new MarkOfferSentUseCase(offerWriteTransaction, recordScopes, offerStore),
    new RecordOfferResponseUseCase(offerWriteTransaction, recordScopes, offerStore),
    new ReviseOfferUseCase(offerWriteTransaction, recordScopes, offerStore)
  );
  app.use('/api/:tenantSlug/offers', createOfferRouter(offersController, tokenService, tenantRepository, resolveAccessContext));

  // Discount approvals above the cap (M2 Slice 10, FR-DSC-03..12): the
  // approver's pending list and the inline approve / reject / withdraw steps.
  const discountApprovalStore = new PrismaDiscountApprovalStore();
  const discountApprovalsController = new DiscountApprovalsController(
    new ListPendingApprovalsUseCase(discountApprovalStore, recordScopes),
    new DecideDiscountApprovalUseCase(
      offerWriteTransaction,
      recordScopes,
      offerDocuments,
      offerStore,
      userRepository,
      permissionDirectory,
      notificationEmailDispatcher
    ),
    new WithdrawDiscountApprovalUseCase(offerWriteTransaction, recordScopes, offerStore)
  );
  app.use(
    '/api/:tenantSlug/discount-approvals',
    createDiscountApprovalRouter(discountApprovalsController, tokenService, tenantRepository, resolveAccessContext)
  );

  // Follow-ups (M2 Slice 11: FR-FUP-01..10, FR-ACT-04, FR-DEAL-08): scheduled
  // with one click, "My follow-ups" and its overdue count, the team view,
  // and completing one by recording the activity in the same transaction.
  const followUpStore = new PrismaFollowUpStore();
  const followUpWriteTransaction = new PrismaFollowUpWriteTransaction();
  const followUpActivities = new AddInteractionUseCase(
    new FollowUpClientRepository(sharedPrisma),
    { contacts: new PrismaContactPersonRepository(sharedPrisma), lookups: lookupStore, scopes: recordScopes },
    new PrismaInteractionWriteTransaction()
  );
  const followUpController = new FollowUpController(
    new ScheduleFollowUpUseCase(followUpStore, dealStore, followUpWriteTransaction, recordScopes, notificationService),
    new CompleteFollowUpUseCase(followUpStore, followUpWriteTransaction, followUpActivities, recordScopes),
    new RescheduleFollowUpUseCase(followUpStore, followUpWriteTransaction, recordScopes),
    new CancelFollowUpUseCase(followUpStore, followUpWriteTransaction, recordScopes),
    new ReassignFollowUpUseCase(followUpStore, followUpWriteTransaction, recordScopes, dealStore, notificationService),
    new ListMyFollowUpsUseCase(followUpStore),
    new CountMyOverdueFollowUpsUseCase(followUpStore),
    new ListFollowUpsUseCase(followUpStore, recordScopes),
    new GetFollowUpUseCase(followUpStore, recordScopes)
  );
  app.use('/api/:tenantSlug/follow-ups', createFollowUpRouter(followUpController, tokenService, tenantRepository, resolveAccessContext));

  // The sales calendar (M2 Slice 12: FR-CAL-01..08): follow-ups and planned
  // items in a range, with the overdue ones, within the caller's scope.
  app.use(
    '/api/:tenantSlug/calendar',
    createCalendarRouter(
      new CalendarController(new GetCalendarUseCase(new PrismaCalendarStore(), recordScopes)),
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // Workspace sales settings (M2 Slice 11): the days without activity after
  // which a deal is highlighted (FR-DEAL-12).
  const salesSettingsStore = new PrismaSalesSettingsStore();
  app.use(
    '/api/:tenantSlug/sales-settings',
    createSalesSettingsRouter(
      new GetSalesSettingsUseCase(salesSettingsStore),
      new UpdateSalesSettingsUseCase(salesSettingsStore),
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // Settings → Statuses: contract and payment status labels, and the deal
  // stages (Slice 10: FR-SET-07, 08; M2 Slice 6: FR-DEAL-06).
  const statusLabelStore = new PrismaStatusLabelStore();
  const statusLabelWriteTransaction = new PrismaStatusLabelWriteTransaction();
  const statusLabelsController = new StatusLabelsController(
    new ListStatusLabelsUseCase(statusLabelStore),
    new UpdateStatusLabelUseCase(statusLabelStore, statusLabelWriteTransaction),
    new ReorderStatusLabelsUseCase(statusLabelStore, statusLabelWriteTransaction)
  );
  app.use(
    '/api/:tenantSlug/status-labels',
    createStatusLabelRouter(statusLabelsController, tokenService, tenantRepository, resolveAccessContext)
  );

  // Client routes require PrismaClient, TokenService, TenantRepository
  const { prisma } = require('@shared/infrastructure/prisma/client');
  const clientRoutes = createClientRouter(prisma, tokenService, tenantRepository, notificationService, resolveAccessContext);
  // The Wellness+ tab of the company page (M4 Slice 10): one path, the rest falls through to the clients routes.
  app.use(
    '/api/:tenantSlug/clients',
    createCompanyMembershipRouter(
      new GetCompanyMembershipUseCase(new PrismaMemberStore(prisma), new PrismaEmployeeImportStore(prisma), new SponsorValidity(new PrismaMemberPaymentStore(prisma))),
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );
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
    // No lookup store: a public submission never carries a company profile.
    undefined,
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
  const formRoutes = createFormRouter(prisma, tokenService, tenantRepository, resolveAccessContext);
  app.use('/api/:tenantSlug/forms', formRoutes);

  // Appointment routes
  const { createAppointmentRouter } = require('../appointments/interfaces/http/routes/appointmentRoutes');
  const appointmentRoutes = createAppointmentRouter(prisma, tokenService, tenantRepository, notificationService, resolveAccessContext);
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
  
  const getTenantClientMetricsUseCase = new GetTenantClientMetricsUseCase(prismaClientRepository, notificationSettingsRepository, recordScopes);
  const getTenantActivityFeedUseCase = new GetTenantActivityFeedUseCase(prismaClientRepository, interactionRepository, appointmentRepository, recordScopes, userRepository);
  
  const { createDashboardRouter } = require('../dashboard/interfaces/http/routes/dashboardRoutes');
  const dashboardRoutes = createDashboardRouter(getTenantClientMetricsUseCase, getTenantActivityFeedUseCase, tokenService, tenantRepository, resolveAccessContext);
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

  const inventoryRoutes = createInventoryRouter(inventoryController, tokenService, tenantRepository, resolveAccessContext);
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
  const markQuotationAcceptedUseCase = new MarkQuotationAcceptedUseCase(quotationRepo, quotationLineItemRepo, quotationHistoryRepo, stockLevelRepo, stockTxManager, quotationWriteTx, userRepository, recordScopes, notificationEmailDispatcher);
  const markQuotationRejectedUseCase = new MarkQuotationRejectedUseCase(quotationWriteTx, userRepository, recordScopes, notificationEmailDispatcher);

  const quotationsController = new QuotationsController(
    new CreateQuotationUseCase(quotationRepo, quotationLineItemRepo, quotationHistoryRepo, prismaClientRepository, productRepo, warehouseRepo, recordScopes, tenantRepository, new StandaloneOfferNumbers(prisma)),
    new UpdateQuotationUseCase(quotationRepo, quotationLineItemRepo, productRepo, warehouseRepo, stockLevelRepo, quotationWriteTx, recordScopes, quotationDelivery),
    // Each transition takes the email dispatcher so it can send AFTER its
    // transaction commits — see runWithPostCommitEmail.
    // Submit and Approve are the two routes into SENT, so they are the two
    // that deliver to the customer.
    new SubmitQuotationUseCase(quotationWriteTx, userRepository, quotationLineItemRepo, stockLevelRepo, recordScopes, notificationEmailDispatcher, quotationDelivery),
    new ApproveQuotationUseCase(quotationWriteTx, userRepository, quotationLineItemRepo, stockLevelRepo, notificationEmailDispatcher, quotationDelivery),
    new ReturnQuotationToDraftUseCase(quotationWriteTx, userRepository, notificationEmailDispatcher),
    markQuotationAcceptedUseCase,
    markQuotationRejectedUseCase,
    new ExpireQuotationUseCase(quotationWriteTx, userRepository, recordScopes, notificationEmailDispatcher),
    new SearchQuotationsUseCase(quotationRepo, recordScopes),
    new GetQuotationDetailUseCase(quotationRepo, quotationLineItemRepo, quotationHistoryRepo, recordScopes, invoiceRepoForQuotationDetail),
    new GetPendingApprovalsUseCase(quotationRepo),
    settingsService,
    tenantRepository
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

  const quotationRoutes = createQuotationRouter(quotationsController, tokenService, tenantRepository, resolveAccessContext);
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
    new ConvertQuotationToInvoiceUseCase(quotationRepo, quotationLineItemRepo, invoiceRepo, invoiceWriteTx, recordScopes),
    new SendInvoiceUseCase(invoiceWriteTx, recordScopes),
    new MarkInvoicePaidUseCase(invoiceWriteTx, recordScopes),
    new VoidInvoiceUseCase(invoiceWriteTx, recordScopes),
    new SearchInvoicesUseCase(invoiceRepo, recordScopes),
    new GetInvoiceDetailUseCase(invoiceRepo, invoiceLineItemRepo, invoiceHistoryRepo, recordScopes),
    new GetInvoicePdfViewUseCase(invoicePdfReader),
    new InvoicePdfRenderer()
  );

  const invoiceRoutes = createInvoiceRouter(invoicesController, tokenService, tenantRepository, resolveAccessContext);
  app.use('/api/:tenantSlug/invoices', invoiceRoutes);

  // Contracts Routes
  //
  // Subscriptions a tenant has sold to its own clients — deliberately not the
  // same thing as Tenant.subscriptionStatus, which is the platform billing its
  // tenants. See the Contract model's docblock.
  const { PrismaContractRepository } = require('../contracts/infrastructure/repositories/PrismaContractRepository');
  const { PrismaContractPaymentRepository } = require('../contracts/infrastructure/repositories/PrismaContractPaymentRepository');
  const { PrismaContractStatusHistoryRepository } = require('../contracts/infrastructure/repositories/PrismaContractStatusHistoryRepository');
  const { PrismaContractWriteTransaction } = require('../contracts/infrastructure/PrismaContractWriteTransaction');
  const { ContractDocumentStore } = require('../contracts/infrastructure/ContractDocumentStore');

  const { CreateContractUseCase } = require('../contracts/application/use-cases/CreateContractUseCase');
  const { CreateContractFromDealUseCase } = require('../contracts/application/use-cases/CreateContractFromDealUseCase');
  const { RefreshContractFromDealUseCase } = require('../contracts/application/use-cases/RefreshContractFromDealUseCase');
  const { UpdateContractUseCase } = require('../contracts/application/use-cases/UpdateContractUseCase');
  const { ChangeContractStatusUseCase } = require('../contracts/application/use-cases/ChangeContractStatusUseCase');
  const { ContractDocumentsUseCases } = require('../contracts/application/use-cases/ContractDocumentsUseCases');
  const { PrismaContractDocumentRepository } = require('../contracts/infrastructure/repositories/PrismaContractDocumentRepository');
  const { RenewContractUseCase } = require('../contracts/application/use-cases/RenewContractUseCase');
  const { StartRenewalUseCase } = require('../contracts/application/use-cases/StartRenewalUseCase');
  const { PrismaContractRenewals } = require('../contracts/infrastructure/PrismaContractRenewals');
  const { SearchContractsUseCase } = require('../contracts/application/use-cases/SearchContractsUseCase');
  const { GetContractDetailUseCase } = require('../contracts/application/use-cases/GetContractDetailUseCase');
  const { GetClientContractsUseCase } = require('../contracts/application/use-cases/GetClientContractsUseCase');
  const instalments = require('../contracts/application/use-cases/InstalmentUseCases');
  const { GetContractPaymentsUseCase } = require('../contracts/application/use-cases/GetContractPaymentsUseCase');
  const { PrismaContractPaymentHistoryRepository } = require('../contracts/infrastructure/repositories/PrismaContractPaymentHistoryRepository');
  const { AttachContractDocumentUseCase } = require('../contracts/application/use-cases/AttachContractDocumentUseCase');

  const { ContractsController } = require('../contracts/interfaces/http/ContractsController');
  const { createContractRouter, createPaymentsRouter, createRenewalsRouter } = require('../contracts/interfaces/http/contractRoutes');
  const { RenewalsController } = require('../contracts/interfaces/http/RenewalsController');
  const { SearchRenewalsUseCase } = require('../contracts/application/use-cases/SearchRenewalsUseCase');
  const { MarkNotRenewingUseCase, ClearNotRenewingUseCase } = require('../contracts/application/use-cases/NotRenewingUseCases');
  const { PrismaRenewalsReader } = require('../contracts/infrastructure/repositories/PrismaRenewalsReader');
  const { PaymentsController } = require('../contracts/interfaces/http/PaymentsController');
  const { SearchPaymentsUseCase, ExportPaymentsUseCase } = require('../contracts/application/use-cases/PaymentsOverviewUseCases');
  const { PrismaPaymentOverviewReader } = require('../contracts/infrastructure/repositories/PrismaPaymentOverviewReader');
  const { PrismaAuditTrail: PaymentExportAuditTrail } = require('../audit/infrastructure/PrismaAuditTrail');

  const contractRepo = new PrismaContractRepository(prisma);
  const contractPaymentRepo = new PrismaContractPaymentRepository(prisma);
  const contractHistoryRepo = new PrismaContractStatusHistoryRepository(prisma);
  const contractWriteTx = new PrismaContractWriteTransaction(prisma);
  const contractDocumentRepo = new PrismaContractDocumentRepository(prisma);
  const contractDocumentStore = new ContractDocumentStore();
  // Suspending or cancelling tells the people who hold contracts.terminate over the company (M3 Slice 5).
  const contractNotifications = new NotificationService(notificationRepository, userRepository, notificationEmailDispatcher, permissionDirectory);

  // M4 Slice 10 (D8): a contract change tells Wellness+ so employees follow the employer at once.
  const contractValidityListener = new ContractValidityListener(
    new SyncEmployerMembersUseCase(new PrismaMemberStore(prisma), new ExpireMemberTermsUseCase(new PrismaMembershipWriteTransaction(prisma)))
  );
  const contractsController = new ContractsController(
    new CreateContractUseCase(contractWriteTx, prismaClientRepository, recordScopes, tenantRepository),
    new UpdateContractUseCase(contractWriteTx, recordScopes),
    new ChangeContractStatusUseCase(contractWriteTx, recordScopes, tenantRepository, contractNotifications, undefined, contractValidityListener),
    new RenewContractUseCase(contractWriteTx, recordScopes, tenantRepository),
    new StartRenewalUseCase(contractWriteTx, recordScopes, tenantRepository),
    new SearchContractsUseCase(contractRepo, recordScopes, new PrismaContractSettingsStore(prisma)),
    new GetContractDetailUseCase(contractRepo, contractPaymentRepo, contractHistoryRepo, contractDocumentRepo, recordScopes, new PrismaContractRenewals(prisma), tenantRepository),
    new GetClientContractsUseCase(contractRepo, recordScopes),
    {
      recordInvoice: new instalments.RecordInvoiceUseCase(contractWriteTx, tenantRepository),
      markPending: new instalments.MarkPaymentPendingUseCase(contractWriteTx, tenantRepository),
      recordReceipt: new instalments.RecordReceiptUseCase(contractWriteTx, tenantRepository),
      reverseReceipt: new instalments.ReverseReceiptUseCase(contractWriteTx, tenantRepository),
      correctStatus: new instalments.CorrectPaymentStatusUseCase(contractWriteTx, tenantRepository),
      add: new instalments.AddContractPaymentUseCase(contractWriteTx, tenantRepository),
      update: new instalments.UpdateContractPaymentUseCase(contractWriteTx, tenantRepository),
      remove: new instalments.DeleteContractPaymentUseCase(contractWriteTx, tenantRepository),
    },
    new GetContractPaymentsUseCase(contractRepo, contractPaymentRepo, new PrismaContractPaymentHistoryRepository(prisma), recordScopes, tenantRepository),
    new AttachContractDocumentUseCase(contractWriteTx, contractDocumentStore, recordScopes),
    new CreateContractFromDealUseCase(contractWriteTx, recordScopes, tenantRepository),
    new RefreshContractFromDealUseCase(contractWriteTx, recordScopes),
    new ContractDocumentsUseCases(contractRepo, contractDocumentRepo, contractDocumentStore, recordScopes),
    new ContractValidityBadges(new PrismaContractValidityReader(prisma), new PrismaContractSettingsStore(prisma)),
    { mark: new MarkNotRenewingUseCase(contractWriteTx, recordScopes), clear: new ClearNotRenewingUseCase(contractWriteTx, recordScopes) }
  );

  const contractRoutes = createContractRouter(contractsController, tokenService, tenantRepository, resolveAccessContext);
  app.use('/api/:tenantSlug/contracts', contractRoutes);

  // The Renewals screen (M3 Slice 11, FR-REN-05, FR-REN-09).
  app.use(
    '/api/:tenantSlug/renewals',
    createRenewalsRouter(
      new RenewalsController(new SearchRenewalsUseCase(new PrismaRenewalsReader(prisma), recordScopes, tenantRepository)),
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // The Performance screen (M3 Slice 12, FR-PRF-01 to 10, FR-RBAC-23, FR-AUD-13).
  {
    const { PrismaPerformanceReader } = require('../dashboard/infrastructure/PrismaPerformanceReader');
    const { GetPerformanceUseCase } = require('../dashboard/application/wellness/GetPerformanceUseCase');
    const { GetPerformanceRecordsUseCase } = require('../dashboard/application/wellness/GetPerformanceRecordsUseCase');
    const { GetPerformanceSeriesUseCase } = require('../dashboard/application/wellness/GetPerformanceSeriesUseCase');
    const { ExportPerformanceUseCase } = require('../dashboard/application/wellness/ExportPerformanceUseCase');
    const { PerformanceController } = require('../dashboard/interfaces/http/PerformanceController');
    const { createPerformanceRouter } = require('../dashboard/interfaces/http/performanceRoutes');
    const performanceReader = new PrismaPerformanceReader(prisma);
    const performanceRoster = new PrismaTeamRoster();
    const getPerformance = new GetPerformanceUseCase(performanceReader, performanceRoster);
    app.use(
      '/api/:tenantSlug/performance',
      createPerformanceRouter(
        new PerformanceController(
          getPerformance,
          new GetPerformanceRecordsUseCase(performanceReader, performanceRoster),
          new GetPerformanceSeriesUseCase(performanceReader, performanceRoster),
          new ExportPerformanceUseCase(getPerformance, new PaymentExportAuditTrail(prisma)),
          tenantRepository
        ),
        tokenService,
        tenantRepository,
        resolveAccessContext
      )
    );
  }

  // The role dashboards (M3 Slices 13 and 14, FR-DSH-01 to 13, FR-RBAC-23). Mounted beside the older metrics
  // router; its paths are different, so each request reaches exactly one of them.
  {
    const { PrismaDashboardReader } = require('../dashboard/infrastructure/PrismaDashboardReader');
    const { PrismaPerformanceReader } = require('../dashboard/infrastructure/PrismaPerformanceReader');
    const { GetDashboardHomeUseCase } = require('../dashboard/application/wellness/GetDashboardHomeUseCase');
    const { GetSalesUserDashboardUseCase } = require('../dashboard/application/wellness/GetSalesUserDashboardUseCase');
    const { GetSalesManagerDashboardUseCase } = require('../dashboard/application/wellness/GetSalesManagerDashboardUseCase');
    const { GetAdministratorDashboardUseCase } = require('../dashboard/application/wellness/GetAdministratorDashboardUseCase');
    const { GetCeoDashboardUseCase } = require('../dashboard/application/wellness/GetCeoDashboardUseCase');
    const { GetPerformanceUseCase: GetCeoPerformanceUseCase } = require('../dashboard/application/wellness/GetPerformanceUseCase');
    const { PrismaAdministratorDashboardReader } = require('../dashboard/infrastructure/PrismaAdministratorDashboardReader');
    const { PrismaCeoDashboardReader } = require('../dashboard/infrastructure/PrismaCeoDashboardReader');
    const { DashboardController } = require('../dashboard/interfaces/http/DashboardController');
    const { createRoleDashboardRouter } = require('../dashboard/interfaces/http/dashboardHomeRoutes');
    const performanceReader = new PrismaPerformanceReader(prisma);
    const dashboardReader = new PrismaDashboardReader(prisma, performanceReader);
    const dashboardRoster = new PrismaTeamRoster();
    const dashboardSettings = new PrismaContractSettingsStore(prisma);
    app.use(
      '/api/:tenantSlug/dashboard',
      createRoleDashboardRouter(
        new DashboardController(
          new GetDashboardHomeUseCase(dashboardReader),
          new GetSalesUserDashboardUseCase(performanceReader, dashboardReader, dashboardRoster, dashboardSettings),
          new GetSalesManagerDashboardUseCase(performanceReader, dashboardReader, dashboardRoster, dashboardSettings),
          new GetAdministratorDashboardUseCase(dashboardReader, new PrismaAdministratorDashboardReader(prisma), auditEntryReader),
          new GetCeoDashboardUseCase(
            performanceReader,
            dashboardReader,
            new PrismaCeoDashboardReader(prisma),
            new PrismaPaymentOverviewReader(prisma),
            new GetCeoPerformanceUseCase(performanceReader, dashboardRoster),
            dashboardRoster,
            dashboardSettings
          )
        ),
        tokenService,
        tenantRepository,
        resolveAccessContext
      )
    );
  }

  // Payments overview and CSV export (M3 Slice 9, FR-PAY-11, 14, FR-AUD-13).
  const paymentOverviewReader = new PrismaPaymentOverviewReader(prisma);
  app.use(
    '/api/:tenantSlug/payments',
    createPaymentsRouter(
      new PaymentsController(
        new SearchPaymentsUseCase(paymentOverviewReader, recordScopes),
        new ExportPaymentsUseCase(paymentOverviewReader, recordScopes, new PaymentExportAuditTrail(prisma))
      ),
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // Contract settings (M3 Slice 3): reminder lead times, expiring-soon window,
  // payment grace days and number prefix, under settings.manage.
  const contractSettingsStore = new PrismaContractSettingsStore(prisma);
  app.use(
    '/api/:tenantSlug/settings/contracts',
    createContractSettingsRouter(
      new GetContractSettingsUseCase(contractSettingsStore),
      new UpdateContractSettingsUseCase(contractSettingsStore, contractWriteTx),
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // Wellness+ settings and benefit table (M4 Slice 3): tiers and fees, rules,
  // relationships and benefits under wellnessplus.settings.manage, and the
  // read-only benefit table for members.view / members.verify.
  const membershipSettingsStore = new PrismaMembershipSettingsStore(prisma);
  const relationshipStore = new PrismaRelationshipStore(prisma);
  const benefitStore = new PrismaBenefitStore(prisma);
  const membershipWriteTx = new PrismaMembershipWriteTransaction(prisma);
  app.use(
    '/api/:tenantSlug/membership',
    createMembershipSettingsRouter(
      {
        getSettings: new GetMembershipSettingsUseCase(membershipSettingsStore),
        updateSettings: new UpdateMembershipSettingsUseCase(membershipSettingsStore, membershipWriteTx),
        updateTier: new UpdateTierSettingUseCase(membershipSettingsStore, membershipWriteTx),
        listRelationships: new ListRelationshipsUseCase(relationshipStore),
        createRelationship: new CreateRelationshipUseCase(relationshipStore, membershipWriteTx),
        updateRelationship: new UpdateRelationshipUseCase(relationshipStore, membershipWriteTx),
        getBenefits: new GetBenefitTableUseCase(benefitStore, membershipSettingsStore),
        createBenefit: new CreateBenefitServiceUseCase(benefitStore, membershipWriteTx),
        updateBenefit: new UpdateBenefitServiceUseCase(benefitStore, membershipWriteTx),
      },
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // The Wellness+ member record (M4 Slice 4): register, search, edit personal
  // details, suspend and close. Members: view reads, Members: manage writes.
  const memberStore = new PrismaMemberStore(prisma);
  const memberPaymentStore = new PrismaMemberPaymentStore(prisma);
  const vipRequestStore = new PrismaVipRequestStore(prisma);
  const quotePayment = new QuotePaymentUseCase(memberStore, memberPaymentStore, membershipSettingsStore, relationshipStore);
  const searchMemberPayments = new SearchMemberPaymentsUseCase(memberPaymentStore, memberStore);
  // The one place a card link is built (NFR-OPS-05). Production requires PUBLIC_BASE_URL; elsewhere it falls back to the frontend address.
  const publicLink = (path: string): string => `${readPublicBaseUrl() ?? (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}${path}`;
  const cardStore = new PrismaCardStore(prisma);
  const verificationStore = new PrismaVerificationStore(prisma);
  const standingResolver = new MemberStandingResolver(memberStore, membershipSettingsStore, benefitStore, memberPaymentStore);
  app.use(
    '/api/:tenantSlug/membership/members',
    createMemberRouter(
      {
        search: new SearchMembersUseCase(memberStore, membershipSettingsStore),
        get: new GetMemberUseCase(memberStore, membershipSettingsStore, memberPaymentStore, relationshipStore, vipRequestStore, verificationStore),
        register: new RegisterMemberUseCase(membershipWriteTx, generateShareToken),
        update: new UpdateMemberUseCase(membershipWriteTx),
        changeStatus: new ChangeMemberStatusUseCase(membershipWriteTx),
        quotePayment,
        recordPayment: new RecordMemberPaymentUseCase(membershipWriteTx),
        addFamilyMember: new AddFamilyMemberUseCase(membershipWriteTx, generateShareToken),
        removeFamilyLink: new RemoveFamilyLinkUseCase(membershipWriteTx),
        familyRelationships: new ListFamilyRelationshipsUseCase(relationshipStore),
        requestVip: new RequestVipUseCase(membershipWriteTx),
        decideVip: new DecideVipRequestUseCase(membershipWriteTx),
        endVip: new EndVipUseCase(membershipWriteTx),
        listVipRequests: new ListVipRequestsUseCase(vipRequestStore, memberStore),
        correctTier: new CorrectMemberTierUseCase(membershipWriteTx),
        removeEmployee: new RemoveEmployeeUseCase(membershipWriteTx, memberStore),
        removeEmployees: new RemoveEmployeesUseCase(membershipWriteTx),
        cardLink: new GetCardLinkUseCase(cardStore, new QrCodeSvg(), publicLink),
        replaceCardLink: new ReplaceCardLinkUseCase(membershipWriteTx, generateShareToken, publicLink),
      },
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // The member's card page (M4 Slice 11, FR-CRD-01): public, no tenant in the path, found by the card token alone.
  app.use(
    '/api/public/cards',
    createPublicCardRouter(new GetPublicCardUseCase(cardStore, memberStore, standingResolver, new QrCodeSvg(), publicLink), undefined, publicLink)
  );

  // Verification (M4 Slice 13): Reception checks a card under Members: verify,
  // and a partner clinic's ordinary phone opens the same link with no login and
  // sees the public shape (D12). Registered before the wildcard tenant routes.
  app.use(
    '/api/public/verify',
    createPublicVerifyRouter(new PublicVerifyUseCase(cardStore, memberStore, standingResolver, verificationStore, () => process.env.VERIFY_IP_HASH_SECRET?.trim() || requireJwtSecret()))
  );
  app.use(
    '/api/:tenantSlug/membership/verify',
    createVerificationRouter(
      { verify: new VerifyMemberUseCase(cardStore, memberStore, standingResolver, verificationStore), recordIdentity: new RecordIdentityCheckUseCase(verificationStore) },
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // Corporate employee upload (M4 Slice 9): template, preview, confirm, history
  // and the result file. Members: import employees.
  const employeeImportStore = new PrismaEmployeeImportStore(prisma);
  const employeeSheets = new XlsxEmployeeSheets();
  app.use(
    '/api/:tenantSlug/membership',
    createEmployeeImportRouter(
      {
        template: new GetEmployeeTemplateUseCase(employeeSheets),
        preview: new PreviewEmployeeImportUseCase(employeeImportStore, memberStore, memberPaymentStore, employeeSheets, generateShareToken),
        confirm: new ConfirmEmployeeImportUseCase(membershipWriteTx, employeeImportStore, generateShareToken),
        list: new ListEmployeeImportsUseCase(employeeImportStore, memberStore),
        result: new GetEmployeeImportResultUseCase(employeeImportStore, employeeSheets),
        cardLinks: new ExportUploadCardLinksUseCase(membershipWriteTx, employeeSheets, publicLink),
      },
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // Membership payments (M4 Slice 5): the list with totals, the CSV export, the
  // PDF receipt and the void. Members: view payments reads, record payments voids.
  app.use(
    '/api/:tenantSlug/membership/payments',
    createMemberPaymentRouter(
      {
        search: searchMemberPayments,
        export: new ExportMemberPaymentsUseCase(searchMemberPayments, membershipWriteTx),
        receipt: new GetPaymentReceiptUseCase(memberPaymentStore, memberStore, new MemberReceiptPdfRenderer()),
        void: new VoidMemberPaymentUseCase(membershipWriteTx),
      },
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // Wellness+ reports (M4 Slice 14): the figures of SRS 9.3, the working lists
  // and the audited CSV export. Members: view reports.
  const getMembershipReport = new GetMembershipReportUseCase(new PrismaMembershipReportReader(prisma), membershipSettingsStore);
  app.use(
    '/api/:tenantSlug/membership/reports',
    createMembershipReportRouter(
      { get: getMembershipReport, export: new ExportMembershipReportUseCase(getMembershipReport, membershipWriteTx) },
      tokenService,
      tenantRepository,
      resolveAccessContext
    )
  );

  // Media Routes (profile photos + workspace branding)
  const { MediaController } = require('../media/interfaces/http/MediaController');
  const { createMediaRouter } = require('../media/interfaces/http/mediaRoutes');
  const { UPLOADS_DIR } = require('../media/MediaService');

  const mediaController = new MediaController();
  const mediaRoutes = createMediaRouter(mediaController, tokenService, tenantRepository, resolveAccessContext);
  app.use('/api/:tenantSlug/media', mediaRoutes);

  // Serve stored images. Filenames contain a UUID and are never reused, so a
  // long immutable cache is safe — replacing an image yields a new URL.
  // Signed contracts are not public files: they are read through the contract's
  // document endpoint, which checks commercial.view and the contract's scope
  // (FR-CON-19, NFR-SEC-06). The store names every one `contract-<uuid>.pdf`.
  // The name is tested after the percent-decoding express.static applies, or `%63ontract-<uuid>.pdf`
  // would slip past the check and be served (found in the M3 security review).
  app.use('/uploads', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(req.path);
    } catch {
      return res.status(404).end();
    }
    if (/(^|[/\\])contract-[^/\\]*\.pdf$/i.test(decoded)) return res.status(404).end();
    next();
  });
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
  const { PrismaSettingsWriteTransaction } = require('../settings/infrastructure/PrismaSettingsWriteTransaction');

  const tenantProfileStore = new TenantProfileStore();
  const settingsWriteTransaction = new PrismaSettingsWriteTransaction();
  const updateTenantSettingsUseCase = new UpdateTenantSettingsUseCase(tenantRepository, tenantProfileStore, settingsWriteTransaction);
  const settingsController = new SettingsController(tenantRepository, tenantProfileStore, updateTenantSettingsUseCase);
  const settingsRoutes = createSettingsRouter(settingsController, tokenService, tenantRepository, resolveAccessContext);
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

  const integrationRoutes = createIntegrationRouter(integrationsController, tokenService, tenantRepository, resolveAccessContext);
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
    new GetRevenueReportUseCase(reportRepo, recordScopes),
    new GetClientReportUseCase(reportRepo, recordScopes),
    new GetInventoryReportUseCase(reportRepo),
    new GetAppointmentReportUseCase(reportRepo, recordScopes),
    new GetClientTrendUseCase(reportRepo, recordScopes),
    new GetLowStockReportUseCase(reportRepo),
    new ReportPdfRenderer()
  );

  const reportRoutes = createReportRouter(reportsController, tokenService, tenantRepository, resolveAccessContext);
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
    createNotificationRouter(notificationController, tokenService, tenantRepository, resolveAccessContext)
  );

  app.use(errorHandler);

  return app;
};
