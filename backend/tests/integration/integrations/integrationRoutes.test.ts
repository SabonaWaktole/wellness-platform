import request from 'supertest';
import express from 'express';
import { createApp } from '../../../src/main/app';
import { Tenant } from '../../../src/tenant/domain/entities/Tenant';
import { UserRole } from '../../../src/auth/domain/enums/UserRole';
import { IIntegrationRepository } from '../../../src/integrations/domain/repositories/IIntegrationRepository';
import { Integration } from '../../../src/integrations/domain/entities/Integration';
import { ITenantRepository } from '../../../src/tenant/domain/repositories/ITenantRepository';
import { IAccessRepository, AccessRecord } from '../../../src/access/application/ports/IAccessRepository';

// Basic in-memory implementations for the test
class InMemoryIntegrationRepository implements IIntegrationRepository {
  public integrations: Integration[] = [];

  async findByTenantId(tenantId: string): Promise<Integration[]> {
    return this.integrations.filter(i => i.tenantId === tenantId);
  }

  async findByProvider(tenantId: string, provider: string): Promise<Integration | null> {
    return this.integrations.find(i => i.tenantId === tenantId && i.provider === provider) ?? null;
  }

  async save(integration: Integration): Promise<void> {
    const idx = this.integrations.findIndex(i => i.id === integration.id);
    if (idx >= 0) {
      this.integrations[idx] = integration;
    } else {
      this.integrations.push(integration);
    }
  }
}

class InMemoryTenantRepository implements ITenantRepository {
  public tenants: Tenant[] = [];
  async findById(id: string): Promise<Tenant | null> { return this.tenants.find(t => t.id === id) ?? null; }
  async findBySlug(slug: string): Promise<Tenant | null> { return this.tenants.find(t => t.urlSlug === slug) ?? null; }
  async create(tenant: Tenant): Promise<Tenant> { this.tenants.push(tenant); return tenant; }
  async findAll(skip: number, take: number) { return { items: this.tenants, total: this.tenants.length }; }
  async updateSettings() {}
  async updateSettingsForMany() { return 0; }
  async setSubscriptionStatus() {}
}

/**
 * Slice 3: `loadAccess` resolves `req.access` through `IAccessRepository`,
 * separately from `IUserRepository` — this test never seeds one, so its
 * fixture users (u1 = BUSINESS_OWNER, u2 = STAFF) are hard-coded here,
 * always active and with no `roleId`, resolving through `LegacyRoleMapping`
 * (D2) exactly as the fake tokens' `role` claim intends.
 */
class FakeAccessRepository implements IAccessRepository {
  private static readonly LEGACY_ROLES: Record<string, string> = { u1: UserRole.BUSINESS_OWNER, u2: UserRole.STAFF };

  async findAccessRecord(tenantId: string, userId: string): Promise<AccessRecord | null> {
    const legacyRole = FakeAccessRepository.LEGACY_ROLES[userId];
    if (!legacyRole) {
      return null;
    }
    return {
      userId,
      tenantId,
      legacyRole,
      roleId: null,
      roleKey: null,
      isActive: true,
      deletedAt: null,
      grants: {},
    };
  }
}

const fakeTokenService = {
  sign: (payload: any) => Buffer.from(JSON.stringify(payload)).toString('base64'),
  verify: (token: string) => {
    try {
      return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    } catch {
      throw new Error('Invalid token');
    }
  }
};

describe('Integration Routes', () => {
  let app: express.Express;
  let integrationRepo: InMemoryIntegrationRepository;
  let tenantRepo: InMemoryTenantRepository;
  
  let ownerToken: string;
  let staffToken: string;
  let tenantId = 't1';

  beforeEach(async () => {
    integrationRepo = new InMemoryIntegrationRepository();
    tenantRepo = new InMemoryTenantRepository();

    await tenantRepo.create(Tenant.create({ id: tenantId, name: 'T1', urlSlug: 't1-slug', createdAt: new Date() }));

    // @ts-ignore
    app = createApp({
      tenantRepository: tenantRepo,
      tokenService: fakeTokenService as any,
      integrationRepository: integrationRepo,
      accessRepository: new FakeAccessRepository(),
    });

    ownerToken = fakeTokenService.sign({ userId: 'u1', role: UserRole.BUSINESS_OWNER, tenantId, tenantSlug: 't1-slug' });
    staffToken = fakeTokenService.sign({ userId: 'u2', role: UserRole.STAFF, tenantId, tenantSlug: 't1-slug' });
  });

  describe('GET /api/:tenantSlug/integrations', () => {
    it('should return 200 and list integrations', async () => {
      const integration = new Integration({
        id: 'i1',
        tenantId,
        provider: 'GOOGLE_CALENDAR',
        status: 'CONNECTED',
        config: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await integrationRepo.save(integration);

      const res = await request(app)
        .get('/api/t1-slug/integrations')
        .set('Authorization', `Bearer ${ownerToken}`);
        
      if (res.status !== 200) console.error(res.status, res.body); expect(res.status).toBe(200);
      expect(res.body.integrations).toHaveLength(1);
      expect(res.body.integrations[0].provider).toBe('GOOGLE_CALENDAR');
    });
  });

  describe('POST /api/:tenantSlug/integrations/connect', () => {
    it('should return 403 for STAFF', async () => {
      const res = await request(app)
        .post('/api/t1-slug/integrations/connect')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ provider: 'GOOGLE_CALENDAR' });
        
      if (res.status !== 403) console.error(res.status, res.body); expect(res.status).toBe(403);
    });

    it('should connect an integration for BUSINESS_OWNER (200)', async () => {
      const res = await request(app)
        .post('/api/t1-slug/integrations/connect')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ provider: 'GOOGLE_CALENDAR', config: { token: 'abc' } });

      if (res.status !== 200) console.error(res.status, res.body); expect(res.status).toBe(200);
      expect(res.body.message).toBe('Integration connected');
      expect(integrationRepo.integrations).toHaveLength(1);
      expect(integrationRepo.integrations[0].provider).toBe('GOOGLE_CALENDAR');
      expect(integrationRepo.integrations[0].status).toBe('CONNECTED');
      expect(integrationRepo.integrations[0].config).toEqual({ token: 'abc' });
    });
  });

  describe('POST /api/:tenantSlug/integrations/disconnect', () => {
    it('should disconnect an integration for BUSINESS_OWNER (200)', async () => {
      const integration = new Integration({
        id: 'i1',
        tenantId,
        provider: 'GOOGLE_CALENDAR',
        status: 'CONNECTED',
        config: { token: 'abc' },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await integrationRepo.save(integration);

      const res = await request(app)
        .post('/api/t1-slug/integrations/disconnect')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ provider: 'GOOGLE_CALENDAR' });

      if (res.status !== 200) console.error(res.status, res.body); expect(res.status).toBe(200);
      expect(res.body.message).toBe('Integration disconnected');
      expect(integrationRepo.integrations[0].status).toBe('DISCONNECTED');
      expect(integrationRepo.integrations[0].config).toBeNull();
    });
  });
});
