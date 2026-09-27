import { Request, Response, Router } from 'express';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { TenantProfileStore } from '../../infrastructure/TenantProfileStore';
import { UpdateTenantSettingsUseCase } from '../../application/use-cases/UpdateTenantSettingsUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { ZodError } from 'zod';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';

export class SettingsController {
  public router = Router({ mergeParams: true });

  constructor(
    private tenantRepository: ITenantRepository,
    private profileStore: TenantProfileStore,
    private updateTenantSettingsUseCase: UpdateTenantSettingsUseCase
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get('/', this.getSettings.bind(this));
    this.router.put('/', requirePermission('settings.manage'), this.updateSettings.bind(this));
  }

  /**
   * Returns the tenant's full settings in one payload: the localization fields
   * from the domain entity, and the company profile plus branding from the
   * profile store.
   */
  private async getSettings(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const [tenant, profile] = await Promise.all([
        this.tenantRepository.findById(tenantId),
        this.profileStore.get(tenantId),
      ]);

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      res.json({
        name: tenant.name,
        requiresQuotationApproval: tenant.requiresQuotationApproval,

        currency: tenant.currency,
        locale: tenant.locale,
        timezone: tenant.timezone,
        dateFormat: tenant.dateFormat,
        defaultLanguage: tenant.defaultLanguage,

        registrationNumber: profile?.registrationNumber ?? null,
        addressLine: profile?.addressLine ?? null,
        addressCity: profile?.addressCity ?? null,
        addressState: profile?.addressState ?? null,
        addressPostalCode: profile?.addressPostalCode ?? null,
        contactEmail: profile?.contactEmail ?? null,
        contactPhone: profile?.contactPhone ?? null,

        logoUrl: profile?.logoUrl ?? null,
        coverImageUrl: profile?.coverImageUrl ?? null,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  private async updateSettings(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      if (!req.user) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }

      await this.updateTenantSettingsUseCase.execute({
        tenantId,
        access: req.access!,
        patch: req.body,
      });

      // Re-read rather than echoing the request back. The previous version
      // returned `Boolean(req.body.requiresQuotationApproval)` — which reported
      // whatever it had just coerced, so it confirmed a value that may never
      // have been what the caller meant. Returning stored state means the client
      // cannot be told a change happened that did not.
      return this.getSettings(req, res);
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        return res.status(403).json({ error: error.message });
      }
      if (error instanceof ZodError) {
        return res.status(400).json({ issues: error.issues });
      }
      res.status(400).json({ error: error.message });
    }
  }
}
