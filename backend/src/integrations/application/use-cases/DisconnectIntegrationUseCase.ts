import { AccessContext } from '../../../access/domain/AccessContext';
import { IIntegrationRepository } from '../../domain/repositories/IIntegrationRepository';

export interface DisconnectIntegrationDTO {
  tenantId: string;
  access: AccessContext;
  provider: string;
}

export class DisconnectIntegrationUseCase {
  constructor(private integrationRepository: IIntegrationRepository) {}

  async execute(dto: DisconnectIntegrationDTO): Promise<void> {
    dto.access.ensure('integrations.manage');

    const integration = await this.integrationRepository.findByProvider(dto.tenantId, dto.provider);

    if (integration) {
      integration.disconnect();
      await this.integrationRepository.save(integration);
    }
  }
}
