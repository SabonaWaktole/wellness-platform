import { IFormVersionRepository } from '../../domain/repositories/IFormVersionRepository';
import { FormVersion } from '../../domain/entities/FormVersion';

/** Reads one frozen version — the version-history panel's "view" action. */
export class GetFormVersionUseCase {
  constructor(private versionRepo: IFormVersionRepository) {}

  async execute(tenantId: string, formId: string, versionNumber: number): Promise<FormVersion | null> {
    return this.versionRepo.findByFormAndVersionNumber(tenantId, formId, versionNumber);
  }
}
