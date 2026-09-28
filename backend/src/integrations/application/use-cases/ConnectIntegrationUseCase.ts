import { AccessContext } from '../../../access/domain/AccessContext';
import { IIntegrationRepository } from '../../domain/repositories/IIntegrationRepository';
import { Integration } from '../../domain/entities/Integration';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectIntegrationDTO {
  tenantId: string;
  access: AccessContext;
  provider: string;
  config?: Record<string, any>;
}

export class ConnectIntegrationUseCase {
  constructor(private integrationRepository: IIntegrationRepository) {}

  async execute(dto: ConnectIntegrationDTO): Promise<Integration> {
    dto.access.ensure('integrations.manage');

    let integration = await this.integrationRepository.findByProvider(dto.tenantId, dto.provider);

    if (integration) {
      integration.connect(dto.config || null);
    } else {
      integration = new Integration({
        id: uuidv4(),
        tenantId: dto.tenantId,
        provider: dto.provider,
        status: 'CONNECTED',
        config: dto.config || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await this.integrationRepository.save(integration);
    return integration;
  }
}
