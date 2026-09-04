import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ClientForm } from '../../domain/entities/ClientForm';

/**
 * Lists the tenant's active forms for the Forms tab.
 *
 * Templates (spec §30) share the same table and repository method, so the
 * split happens here rather than as a new repository query — one more
 * `IClientFormRepository` method for what is fundamentally a client-side
 * filter is exactly the fan-out this module has avoided everywhere else
 * (see `IFormVersionRepository`'s own doc comment). A template is never a
 * form the owner is meant to fill in and send — it defaults out of the
 * regular list, `executeTemplates` is the one place it shows up.
 */
export class GetClientFormsUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  async execute(tenantId: string): Promise<ClientForm[]> {
    const forms = await this.formRepo.findByTenantId(tenantId);
    return forms.filter((f) => !f.isTemplate);
  }

  /** The "Create from template" picker's list. */
  async executeTemplates(tenantId: string): Promise<ClientForm[]> {
    const forms = await this.formRepo.findByTenantId(tenantId);
    return forms.filter((f) => f.isTemplate);
  }
}
