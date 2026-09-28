import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { ITenantRepository, TenantSettingsUpdate } from '../../../tenant/domain/repositories/ITenantRepository';
import { TenantProfileStore, TenantProfile } from '../../infrastructure/TenantProfileStore';
import { ISettingsWriteTransaction } from '../ports/ISettingsWriteTransaction';
import { updateTenantSettingsSchema } from '../../interfaces/http/schemas/settingsSchemas';

export interface UpdateTenantSettingsDTO {
  tenantId: string;
  access: AccessContext;
  /** The raw request body. Parsed here — see the note below. */
  patch: unknown;
}

const AUDITED_FIELDS = [
  'name',
  'requiresQuotationApproval',
  'currency',
  'locale',
  'timezone',
  'dateFormat',
  'defaultLanguage',
  'registrationNumber',
  'addressLine',
  'addressCity',
  'addressState',
  'addressPostalCode',
  'contactEmail',
  'contactPhone',
] as const;

export class UpdateTenantSettingsUseCase {
  constructor(
    private tenantRepository: ITenantRepository,
    private profileStore: TenantProfileStore,
    private writeTx: ISettingsWriteTransaction
  ) {}

  async execute(dto: UpdateTenantSettingsDTO) {
    // settings.manage (FR-RBAC-05). A bare SUPER_ADMIN never reaches this:
    // resolveTenant refuses it on tenant routes, so the platform operator
    // only gets here while impersonating the workspace, as before.
    dto.access.ensure('settings.manage');

    // Validation happens HERE rather than via the usual validateRequest route
    // middleware, on purpose. That middleware calls `schema.parseAsync(req.body)`
    // and throws the RESULT away, so every .default() and .transform() in this
    // codebase is currently inert and controllers still see the raw body. This
    // schema relies on transforms (trimming, empty-string-to-null), so routing
    // it through the middleware would validate the input and then discard the
    // normalisation. Parsing in the use case makes both actually take effect,
    // and keeps validation in one place rather than two.
    //
    // Fixing the middleware itself is deliberately out of scope: it is shared by
    // ten routes written against the broken semantics, and making defaults
    // suddenly start landing could change behaviour in code that never expected
    // them. See TD-011.
    const parsed = updateTenantSettingsSchema.parse(dto.patch);

    const tenant = await this.tenantRepository.findById(dto.tenantId);
    if (!tenant) {
      throw new Error('Tenant not found.');
    }
    const profileBefore = await this.profileStore.get(dto.tenantId);

    // Split by the same rule the schema is organised around: fields with
    // behaviour go through the domain repository, presentation-only fields go
    // to the profile store.
    const settings: TenantSettingsUpdate = {
      name: parsed.name,
      requiresQuotationApproval: parsed.requiresQuotationApproval,
      currency: parsed.currency,
      locale: parsed.locale,
      timezone: parsed.timezone,
      dateFormat: parsed.dateFormat,
      defaultLanguage: parsed.defaultLanguage,
    };

    const profile: Partial<TenantProfile> = {
      registrationNumber: parsed.registrationNumber,
      addressLine: parsed.addressLine,
      addressCity: parsed.addressCity,
      addressState: parsed.addressState,
      addressPostalCode: parsed.addressPostalCode,
      contactEmail: parsed.contactEmail,
      contactPhone: parsed.contactPhone,
    };

    const before: Record<string, unknown> = { ...tenant, ...(profileBefore ?? {}) };
    const after: Record<string, unknown> = { ...before, ...settings, ...profile };
    // Only the fields the caller actually sent count — an absent key means
    // "leave it alone" (TenantSettingsUpdate's own contract), so it must not
    // show up as a change just because `parsed` carries the key as `undefined`.
    const touched = AUDITED_FIELDS.filter((field) => (parsed as Record<string, unknown>)[field] !== undefined);
    const changes = diff(before, after, touched);

    if (changes.length > 0) {
      await this.writeTx.run(async ({ tenantRepository, profileStore, auditTrail }) => {
        await tenantRepository.updateSettings(dto.tenantId, settings);
        await profileStore.update(dto.tenantId, profile);
        await auditTrail.record({
          tenantId: dto.tenantId,
          userId: dto.access.userId,
          userRole: dto.access.auditRole,
          action: AuditAction.Update,
          entityType: 'Workspace',
          entityId: dto.tenantId,
          entityLabel: (settings.name ?? tenant.name) as string,
          changes,
        });
      });
    }

    return { tenantId: dto.tenantId };
  }
}
