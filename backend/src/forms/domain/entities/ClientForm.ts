import { DomainError } from '../../../shared/domain/errors/DomainError';
import { FormStatus } from '../enums/FormStatus';
import { FormDocument, emptyDocument } from '../value-objects/FormDocument';

/** Submission-side knobs, all optional — every existing form starts with none set. */
export interface FormSettings {
  successMessage?: string;
  notifyEmails?: string[];
  acceptingResponses?: boolean;
}

export interface ClientFormProps {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  status?: FormStatus;
  layout?: FormDocument;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
  shareToken?: string | null;
  isTemplate?: boolean;
  publishedVersionId?: string | null;
  /** See `hasUnpublishedChanges` — the draft `version` at the last publish. */
  publishedAtDraftVersion?: number | null;
  settings?: FormSettings;
}

/** Every field resolved to its stored type — what the constructor and `toProps()` deal in. */
interface ResolvedProps {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  status: FormStatus;
  layout: FormDocument;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  shareToken: string | null;
  isTemplate: boolean;
  publishedVersionId: string | null;
  publishedAtDraftVersion: number | null;
  settings: FormSettings;
}

const MAX_NAME_LENGTH = 80;

/**
 * A tenant-authored intake form: an ordered set of titled sections ("paragraphs")
 * over the tenant's own field definitions.
 *
 * A form owns LAYOUT, never fields. CustomFieldDefinition stays the tenant-level
 * data dictionary — what a client record can store — and a form is one
 * presentation of it. That split is forced rather than stylistic:
 * CustomFieldDefinition carries `@@unique([tenantId, role])`, so a FieldRole is a
 * fact about the tenant, and ClientFieldResolver (called from PDF, email, search
 * and dashboard code that has no form in scope) could not resolve "the client's
 * email" if the answer depended on which form was open. Multiple forms are
 * therefore multiple views of one coherent client record.
 *
 * Immutable in the same style as CustomFieldDefinition: every mutator returns a
 * new instance and re-validates.
 */
export class ClientForm {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly name: string;
  public readonly description: string | null;
  public readonly isDefault: boolean;
  public readonly status: FormStatus;
  public readonly layout: FormDocument;
  /**
   * Optimistic concurrency counter, bumped on every layout write. Two owners
   * with the builder open would otherwise silently overwrite each other — and
   * a layout is a whole document, so the loser's entire session is lost rather
   * than one field.
   */
  public readonly version: number;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly deletedAt: Date | null;
  /** NULL until the first publish — see `publish()`. */
  public readonly shareToken: string | null;
  public readonly isTemplate: boolean;
  /** The FormVersion clients currently submit against. NULL until first publish. */
  public readonly publishedVersionId: string | null;
  public readonly publishedAtDraftVersion: number | null;
  public readonly settings: FormSettings;

  private constructor(props: ResolvedProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description;
    this.isDefault = props.isDefault;
    this.status = props.status;
    this.layout = props.layout;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
    this.shareToken = props.shareToken;
    this.isTemplate = props.isTemplate;
    this.publishedVersionId = props.publishedVersionId;
    this.publishedAtDraftVersion = props.publishedAtDraftVersion;
    this.settings = props.settings;
  }

  private static validate(props: ClientFormProps): void {
    const name = props.name?.trim() ?? '';
    if (!name) {
      throw new DomainError('A form needs a name.');
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new DomainError(`A form name cannot be longer than ${MAX_NAME_LENGTH} characters.`);
    }
  }

  private static resolve(props: ClientFormProps, now: Date): ResolvedProps {
    return {
      id: props.id,
      tenantId: props.tenantId,
      name: props.name,
      description: props.description ?? null,
      isDefault: props.isDefault ?? false,
      status: props.status ?? FormStatus.DRAFT,
      layout: props.layout ?? emptyDocument(),
      version: props.version ?? 1,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      deletedAt: props.deletedAt ?? null,
      shareToken: props.shareToken ?? null,
      isTemplate: props.isTemplate ?? false,
      publishedVersionId: props.publishedVersionId ?? null,
      publishedAtDraftVersion: props.publishedAtDraftVersion ?? null,
      settings: props.settings ?? {},
    };
  }

  public static create(props: ClientFormProps): ClientForm {
    this.validate(props);
    const now = new Date();
    return new ClientForm(this.resolve({ ...props, name: props.name.trim() }, now));
  }

  /** Rebuilds a persisted form without re-running creation rules. */
  public static reconstitute(props: ClientFormProps): ClientForm {
    return new ClientForm(this.resolve(props, new Date()));
  }

  public isArchived(): boolean {
    return this.deletedAt != null;
  }

  /**
   * Whether the draft has changed since the last publish. Read straight off
   * the two version counters — `version > publishedAtDraftVersion` — rather
   * than diffing `layout` against the frozen FormVersion snapshot, so this
   * costs nothing on every read. Always false for a form that has never been
   * published (there is nothing to have "unpublished changes" relative to).
   */
  public hasUnpublishedChanges(): boolean {
    if (this.publishedAtDraftVersion == null) return false;
    return this.version > this.publishedAtDraftVersion;
  }

  /**
   * Replaces the layout and bumps `version`.
   *
   * The caller must have validated the new layout against the tenant's live
   * definitions first (FormDocumentValidator) — that check needs a repository and
   * so cannot live in the entity.
   */
  public withLayout(layout: FormDocument): ClientForm {
    return ClientForm.create({
      ...this.toProps(),
      layout,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  /**
   * Bumps `version`, same as `withLayout` — a rename or a status change loses
   * a concurrent edit exactly as easily as a layout change does, and
   * `UpdateClientFormSettingsUseCase` runs the same compare-and-set on it.
   */
  public withSettings(changes: {
    name?: string;
    description?: string | null;
    status?: FormStatus;
    isDefault?: boolean;
  }): ClientForm {
    return ClientForm.create({
      ...this.toProps(),
      name: changes.name ?? this.name,
      description: changes.description !== undefined ? changes.description : this.description,
      status: changes.status ?? this.status,
      isDefault: changes.isDefault ?? this.isDefault,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  /**
   * Snapshots the draft as a new published version (the caller creates the
   * `FormVersion` row and passes its id here — this entity only records the
   * pointer). The share token is minted once and kept forever after: a
   * re-publish must not invalidate a link already handed to clients, so
   * `shareToken` is ignored on every publish after the first.
   *
   * Like every other mutator this bumps `version` — and the RESULTING value
   * is what gets stamped into `publishedAtDraftVersion`, so
   * `hasUnpublishedChanges()` reads false immediately after this call.
   */
  public publish(args: { versionId: string; shareToken: string }): ClientForm {
    const nextVersion = this.version + 1;
    return ClientForm.create({
      ...this.toProps(),
      status: FormStatus.PUBLISHED,
      publishedVersionId: args.versionId,
      shareToken: this.shareToken ?? args.shareToken,
      version: nextVersion,
      publishedAtDraftVersion: nextVersion,
      updatedAt: new Date(),
    });
  }

  /** Soft delete, mirroring Client.deletedAt — the form's identity survives
   *  for any FormSubmission that already references it. */
  public withDeletion(): ClientForm {
    return new ClientForm({ ...this.toProps(), deletedAt: new Date(), updatedAt: new Date() });
  }

  private toProps(): ResolvedProps {
    return {
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      isDefault: this.isDefault,
      status: this.status,
      layout: this.layout,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      deletedAt: this.deletedAt,
      shareToken: this.shareToken,
      isTemplate: this.isTemplate,
      publishedVersionId: this.publishedVersionId,
      publishedAtDraftVersion: this.publishedAtDraftVersion,
      settings: this.settings,
    };
  }
}
