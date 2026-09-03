import { IFormVersionRepository } from '../../domain/repositories/IFormVersionRepository';
import { FormVersion } from '../../domain/entities/FormVersion';

/**
 * Newest-first history for the version-history panel. Read access only — no
 * role check, matching `GetClientFormUseCase`'s own reads: both STAFF and
 * BUSINESS_OWNER can already reach any form's routes (`formRoutes.ts`
 * authorizes both), and history is display-only here, nothing is mutated.
 */
export class ListFormVersionsUseCase {
  constructor(private versionRepo: IFormVersionRepository) {}

  async execute(tenantId: string, formId: string): Promise<FormVersion[]> {
    return this.versionRepo.listByForm(tenantId, formId);
  }
}
