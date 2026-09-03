import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ClientForm } from '../../domain/entities/ClientForm';

/** Lists the tenant's active forms for the Forms tab. */
export class GetClientFormsUseCase {
  constructor(private formRepo: IClientFormRepository) {}

  execute(tenantId: string): Promise<ClientForm[]> {
    return this.formRepo.findByTenantId(tenantId);
  }
}
