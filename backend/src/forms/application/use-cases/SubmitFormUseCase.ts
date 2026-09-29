import { randomUUID } from 'crypto';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { IFormVersionRepository } from '../../domain/repositories/IFormVersionRepository';
import { IFormSubmissionRepository } from '../../domain/repositories/IFormSubmissionRepository';
import { ICustomFieldDefinitionRepository } from '../../../clients/domain/repositories/ICustomFieldDefinitionRepository';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { CreateClientUseCase } from '../../../clients/application/use-cases/CreateClientUseCase';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { FormStatus } from '../../domain/enums/FormStatus';
import { FormSubmission } from '../../domain/entities/FormSubmission';
import { SubmissionValidator } from '../../domain/services/SubmissionValidator';
import { fieldSpecsOf } from '../../domain/value-objects/FormDocument';

interface SubmitFormDTO {
  token: string;
  data: Record<string, unknown>;
  ipHash?: string | null;
  userAgent?: string | null;
}

export type SubmitFormResult =
  | { outcome: 'not_found' }
  | { outcome: 'invalid'; errors: Record<string, string> }
  | { outcome: 'submitted'; submission: FormSubmission };

/**
 * Accepts a public submission against a form's PUBLISHED version (spec §27).
 *
 * Validation is against the FROZEN `FieldSpec`s on that version, never the
 * live document — see `SubmissionValidator`. The stored `data` is likewise
 * sanitised down to exactly the keys the version's fields define; anything
 * else the caller sent (extra keys, prototype-pollution attempts like
 * `__proto__`) is silently dropped rather than stored, since this is the
 * one write path in the whole system with no authenticated caller behind it.
 */
export class SubmitFormUseCase {
  constructor(
    private formRepo: IClientFormRepository,
    private versionRepo: IFormVersionRepository,
    private submissionRepo: IFormSubmissionRepository,
    private customFieldRepo: ICustomFieldDefinitionRepository,
    private userRepo: IUserRepository,
    private createClientUseCase: CreateClientUseCase,
    private notifications?: NotificationService
  ) {}

  async execute(dto: SubmitFormDTO): Promise<SubmitFormResult> {
    const form = await this.formRepo.findByShareToken(dto.token);
    if (!form || form.status !== FormStatus.PUBLISHED || !form.publishedVersionId) {
      return { outcome: 'not_found' };
    }
    if (form.settings.acceptingResponses === false) {
      return { outcome: 'not_found' };
    }

    const version = await this.versionRepo.findById(form.publishedVersionId);
    if (!version) return { outcome: 'not_found' };

    const fields = fieldSpecsOf(version.document);
    const errors = SubmissionValidator.validate(fields, dto.data);
    if (Object.keys(errors).length > 0) {
      return { outcome: 'invalid', errors };
    }

    // Sanitise down to exactly the document's own keys — see the class doc.
    const sanitizedData: Record<string, unknown> = {};
    for (const field of fields) {
      if (dto.data[field.key] !== undefined) sanitizedData[field.key] = dto.data[field.key];
    }

    const clientId = await this.tryCreateBoundClient(form.tenantId, fields, sanitizedData);

    const submission = FormSubmission.create({
      id: randomUUID(),
      tenantId: form.tenantId,
      formId: form.id,
      formVersionId: version.id,
      data: sanitizedData,
      clientId,
      source: 'PUBLIC_LINK',
      ipHash: dto.ipHash,
      userAgent: dto.userAgent,
    });
    await this.submissionRepo.save(submission);

    // No actor — the person filling a public link has no account, same as
    // the scheduler's own notifications. Fanned out to every active
    // Business Owner rather than a single assignee: a submission has no
    // owner of its own the way a client or appointment does.
    await this.notifications?.emitSafe({
      tenantId: form.tenantId,
      toRole: UserRole.BUSINESS_OWNER,
      type: 'FORM_SUBMITTED',
      params: { form: form.name },
      actorUserId: null,
      entityType: 'FORM',
      entityId: form.id,
    });

    return { outcome: 'submitted', submission };
  }

  /**
   * Best-effort. The submission itself is the record of truth for a public
   * response — a downstream problem creating the Client row (an unexpected
   * throw from `CreateClientUseCase`, no active owner to attribute the
   * record to) must never cost the tenant the submission that already
   * validated and is otherwise ready to save.
   */
  private async tryCreateBoundClient(
    tenantId: string,
    fields: ReturnType<typeof fieldSpecsOf>,
    sanitizedData: Record<string, unknown>
  ): Promise<string | null> {
    const boundFields = fields.filter((f) => f.clientFieldId && sanitizedData[f.key] !== undefined);
    if (boundFields.length === 0) return null;

    const owners = await this.userRepo.findActiveByTenantAndRole(tenantId, UserRole.BUSINESS_OWNER);
    const authorUserId = owners[0]?.id;
    if (!authorUserId) return null;

    const definitions = await this.customFieldRepo.findByTenantId(tenantId);
    const byId = new Map(definitions.map((d) => [d.id, d]));

    // Bridges the document's `field.key` to the LIVE definition's
    // `fieldName` — Client.customFieldValues is keyed by fieldName, the same
    // mapping ClientFormContent performs client-side for the internal
    // create/edit page. A definition renamed or deleted since the version
    // was frozen is skipped rather than failing the whole submission.
    const customFieldValues: Record<string, unknown> = {};
    for (const field of boundFields) {
      const definition = byId.get(field.clientFieldId!);
      if (definition) customFieldValues[definition.fieldName] = sanitizedData[field.key];
    }
    if (Object.keys(customFieldValues).length === 0) return null;

    try {
      const { client } = await this.createClientUseCase.execute({
        tenantId,
        customFieldValues,
        authorUserId,
        // A public submission: the system acts, not a signed-in user.
        access: null,
      });
      return client.id;
    } catch (error) {
      console.error('Failed to create a client from a form submission', { tenantId, error });
      return null;
    }
  }
}
