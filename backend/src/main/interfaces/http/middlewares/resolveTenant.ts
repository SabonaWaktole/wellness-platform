import { NextFunction, Request, Response } from 'express';
import { ITenantRepository } from '../../../../tenant/domain/repositories/ITenantRepository';

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        urlSlug: string;
        /**
         * The tenant's IANA timezone, carried on the request so day-bucketing
         * handlers do not each re-read the tenant. See tenantDay.ts.
         */
        timezone: string;
      };
    }
  }
}

export interface ResolveTenantOptions {
  /**
   * Let a request through even when the workspace is suspended, leaving the
   * suspension check to the handler.
   *
   * Exactly one route sets this: tenant login. `LoginUseCase` checks suspension
   * only AFTER verifying the password, so that someone who cannot authenticate
   * cannot use the login endpoint to probe which workspaces are suspended —
   * "this company's account was cut off" is inferable business information, and
   * a slug is public. Rejecting here instead would answer that question to
   * anyone who asked.
   *
   * It is opt-in per route rather than a blanket exemption for the auth router
   * because the rest of that router — invitations, staff management, password
   * reset requests — must stay blocked for a suspended workspace.
   */
  allowSuspended?: boolean;
}

export const resolveTenant = (
  tenantRepository: ITenantRepository,
  options: ResolveTenantOptions = {}
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { tenantSlug } = req.params;

    if (!tenantSlug) {
      return next();
    }

    const tenant = await tenantRepository.findBySlug(tenantSlug as string);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    /*
     * A suspended workspace serves nothing.
     *
     * This is the enforcement point that actually matters, and it is checked
     * before the membership check below so that suspension applies to every
     * caller uniformly.
     *
     * Blocking only at login would not be enough. `authenticate` never reads
     * the database — it verifies the JWT signature and trusts the payload — and
     * there is no revocation, so an already-issued token stays valid until it
     * expires (JWT_EXPIRATION, 24h by default). Login-only enforcement would
     * therefore leave a suspended tenant's users fully operational until
     * their tokens expire. See TD-010.
     *
     * Here the tenant is re-read from the database on every single request
     * regardless of what the token claims, so suspension takes effect at once
     * and mid-session. Every tenant-scoped route in the app is mounted under
     * `/api/:tenantSlug/...` and therefore passes through here; the tenant was
     * already being loaded for the membership check, so this costs no extra
     * query.
     *
     * 403 rather than 404: the workspace exists and the caller may well belong
     * to it. Hiding that would be a lie the frontend cannot act on.
     */
    if (tenant.isSuspended() && !options.allowSuspended) {
      return res.status(403).json({
        error: 'This workspace is suspended :( contact support',
        code: 'TENANT_SUSPENDED',
      });
    }

    // Tenant scoping is absolute: membership of the tenant named in the URL is
    // the only thing that grants access, with no role-based exemption.
    //
    // SUPER_ADMIN is deliberately NOT exempt. It is a platform-level role that
    // administers tenants themselves (e.g. GET /api/tenants), never an
    // individual business's operational data. Its tenantId is null, so the
    // previous exemption let it past this check and straight into controllers
    // that then dereferenced that null — producing 500s rather than either
    // serving data or denying access. It was an accident, not a control.
    if (req.user && req.user.tenantId !== tenant.id) {
      return res.status(403).json({ error: 'Cross-tenant access forbidden' });
    }

    req.tenant = { id: tenant.id, urlSlug: tenant.urlSlug, timezone: tenant.timezone };
    next();
  };
};
