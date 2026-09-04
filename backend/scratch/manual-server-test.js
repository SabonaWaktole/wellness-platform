const { createApp } = require('./src/main/app');
const { Tenant } = require('./src/tenant/domain/entities/Tenant');
const { UserRole } = require('./src/auth/domain/enums/UserRole');

class InMemoryIntegrationRepository {
  constructor() { this.integrations = []; }
  async findByTenantId(tenantId) { return this.integrations.filter(i => i.tenantId === tenantId); }
  async findByProvider(tenantId, provider) { return this.integrations.find(i => i.tenantId === tenantId && i.provider === provider) ?? null; }
  async save(integration) { this.integrations.push(integration); }
}
class InMemoryTenantRepository {
  constructor() { this.tenants = []; }
  async findById(id) { return this.tenants.find(t => t.id === id) ?? null; }
  async findBySlug(slug) { return this.tenants.find(t => t.urlSlug === slug) ?? null; }
  async create(tenant) { this.tenants.push(tenant); return tenant; }
}

const fakeTokenService = {
  sign: (payload) => Buffer.from(JSON.stringify(payload)).toString('base64'),
  verify: (token) => JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
};

async function run() {
  const tenantRepo = new InMemoryTenantRepository();
  const integrationRepo = new InMemoryIntegrationRepository();
  await tenantRepo.create(Tenant.create({ id: 't1', name: 'T1', urlSlug: 't1-slug', createdAt: new Date() }));
  
  const app = createApp({
    tenantRepository: tenantRepo,
    tokenService: fakeTokenService,
    integrationRepository: integrationRepo
  });
  
  app.listen(3333, () => {
    console.log('Server running on 3333');
  });
}
run();
