import { ClientForm } from '../entities/ClientForm';

export interface IClientFormRepository {
  /** Active (not soft-deleted) forms, newest default first. */
  findByTenantId(tenantId: string): Promise<ClientForm[]>;
  findById(tenantId: string, id: string): Promise<ClientForm | null>;
  /**
   * The public-fill lookup — no `tenantId` because the caller does not have
   * one yet: the whole point of the token is to stand in for both
   * authentication and tenant resolution on the unauthenticated public route
   * (see `publicFormRoutes.ts`). Returns a soft-deleted form's row exactly
   * like any other lookup would refuse to — `deletedAt` is checked by the
   * implementation, not the caller.
   */
  findByShareToken(shareToken: string): Promise<ClientForm | null>;
  /** The tenant's `isDefault` form, or null before it has been seeded. */
  findDefault(tenantId: string): Promise<ClientForm | null>;
  save(form: ClientForm): Promise<void>;
  /**
   * Writes only if the stored `version` still matches `expectedVersion`,
   * returning false when it does not. Compare-and-set rather than read-then-
   * write: two owners saving the builder concurrently would otherwise have one
   * session silently overwrite the other's entire layout.
   */
  updateWithVersionCheck(form: ClientForm, expectedVersion: number): Promise<boolean>;

  /**
   * Whether this tenant's starter form has already been created once — see
   * EnsureDefaultClientFormUseCase. Same reasoning as
   * ICustomFieldDefinitionRepository.hasSeededDefaults: without a one-shot
   * stamp, "create the default form if none exists" makes deleting it
   * impossible, because the next read resurrects it.
   */
  hasSeededDefaultForm(tenantId: string): Promise<boolean>;
  markDefaultFormSeeded(tenantId: string): Promise<void>;

  /**
   * Stamps `deletedAt`. Not a hard delete: FormSubmission (Phase D) will
   * reference a formId, and a form that already produced clients should keep
   * its identity rather than vanish out from under its own history.
   */
  softDelete(tenantId: string, id: string): Promise<void>;
}
