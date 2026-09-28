import { Request, Response } from 'express';
import { requireTenantId } from "@main/interfaces/http/tenantContext";
import { GetIntegrationsUseCase } from '../../application/use-cases/GetIntegrationsUseCase';
import { ConnectIntegrationUseCase } from '../../application/use-cases/ConnectIntegrationUseCase';
import { DisconnectIntegrationUseCase } from '../../application/use-cases/DisconnectIntegrationUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';

export class IntegrationsController {
  constructor(
    private getIntegrationsUseCase: GetIntegrationsUseCase,
    private connectIntegrationUseCase: ConnectIntegrationUseCase,
    private disconnectIntegrationUseCase: DisconnectIntegrationUseCase
  ) {}

  getIntegrations = async (req: Request, res: Response) => {
    try {
      const integrations = await this.getIntegrationsUseCase.execute({
        tenantId: requireTenantId(req)
      });
      res.status(200).json({ integrations: integrations.map(i => i.toJSON()) });
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message });
    }
  };

  connectIntegration = async (req: Request, res: Response) => {
    try {
      await this.connectIntegrationUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        provider: req.body.provider,
        config: req.body.config
      });
      res.status(200).json({ message: 'Integration connected' });
    } catch (error: any) {
      console.error(error);
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };

  disconnectIntegration = async (req: Request, res: Response) => {
    try {
      await this.disconnectIntegrationUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        provider: req.body.provider
      });
      res.status(200).json({ message: 'Integration disconnected' });
    } catch (error: any) {
      console.error(error);
      if (error instanceof PermissionDeniedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  };
}
