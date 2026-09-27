import { IPlatformSettingsRepository } from '../../../settings/domain/IPlatformSettingsRepository';
import { ITenantRepository } from '../../domain/repositories/ITenantRepository';
import { ALBANIA_WORKSPACE_DEFAULTS, WELLNESS_WORKSPACE } from '../../domain/wellnessWorkspace';
import { CreateTenantWithOwnerUseCase } from './CreateTenantWithOwnerUseCase';

export interface ProvisionWellnessWorkspaceInput {
  /** The first Administrator. Only needed when the workspace does not exist yet. */
  owner?: { email: string; password: string };
  /**
   * Apply the Albanian defaults to a workspace that already exists — one first
   * created from the platform console with the SaaS defaults, for instance.
   * Off by default, so running the seed again cannot quietly undo settings an
   * Administrator has changed since.
   */
  updateExisting?: boolean;
}

export interface ProvisionWellnessWorkspaceResult {
  outcome: 'created' | 'updated' | 'unchanged';
  tenantId: string;
}

export class WorkspaceOwnerRequiredError extends Error {
  constructor() {
    super(
      `The ${WELLNESS_WORKSPACE.name} workspace does not exist yet, and creating it needs its first Administrator's email and password.`
    );
    this.name = 'WorkspaceOwnerRequiredError';
  }
}

/**
 * Seeds the Wellness Albania workspace with its regional defaults (FR-LNG-04).
 *
 * The platform defaults are set first because they are exactly what
 * CreateTenantWithOwnerUseCase reads when it provisions a workspace, so the
 * workspace is created by the same code as one made from the platform console,
 * and any workspace provisioned later (a UAT copy, say) starts Albanian too.
 */
export class ProvisionWellnessWorkspaceUseCase {
  constructor(
    private readonly platformSettings: IPlatformSettingsRepository,
    private readonly tenants: ITenantRepository,
    private readonly createTenantWithOwner: Pick<CreateTenantWithOwnerUseCase, 'execute'>
  ) {}

  async execute(input: ProvisionWellnessWorkspaceInput): Promise<ProvisionWellnessWorkspaceResult> {
    const existing = await this.tenants.findBySlug(WELLNESS_WORKSPACE.urlSlug);

    if (existing) {
      if (!input.updateExisting) {
        return { outcome: 'unchanged', tenantId: existing.id };
      }
      await this.platformSettings.save({ ...ALBANIA_WORKSPACE_DEFAULTS });
      await this.tenants.updateSettings(existing.id, { ...ALBANIA_WORKSPACE_DEFAULTS });
      return { outcome: 'updated', tenantId: existing.id };
    }

    // Checked before anything is written, so a missing argument leaves the
    // platform exactly as it was.
    if (!input.owner) {
      throw new WorkspaceOwnerRequiredError();
    }

    await this.platformSettings.save({ ...ALBANIA_WORKSPACE_DEFAULTS });
    const { tenant } = await this.createTenantWithOwner.execute({
      companyName: WELLNESS_WORKSPACE.name,
      urlSlug: WELLNESS_WORKSPACE.urlSlug,
      ownerEmail: input.owner.email,
      ownerPassword: input.owner.password,
    });
    return { outcome: 'created', tenantId: tenant.id };
  }
}
