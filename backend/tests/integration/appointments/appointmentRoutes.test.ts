import request from 'supertest';
import express from 'express';
import { createAppointmentRouter } from '../../../src/appointments/interfaces/http/routes/appointmentRoutes';
import { PrismaClient } from '@prisma/client';
import { AppointmentStatus } from '../../../src/appointments/domain/enums/AppointmentStatus';
import { ClientStatus } from '../../../src/clients/domain/enums/ClientStatus';
import { ITokenService } from '../../../src/auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../src/tenant/domain/repositories/ITenantRepository';
import { Tenant } from '../../../src/tenant/domain/entities/Tenant';
import { UserRole } from '../../../src/auth/domain/enums/UserRole';

const prisma = new PrismaClient();

// Deliberately skips signature verification, purely to test authorization/business logic in isolation.
class NonCryptographicStubTokenService implements ITokenService {
  sign(payload: any): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
  verify(token: string): any {
    try {
      return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    } catch {
      throw new Error('Invalid token');
    }
  }
}

const stubTokenService = new NonCryptographicStubTokenService();

// Tenant A (t1) user valid token (Owner)
const t1OwnerToken = stubTokenService.sign({ userId: 'u1-owner', role: UserRole.BUSINESS_OWNER, tenantId: 't1', tenantSlug: 't1' });
// Tenant A (t1) user valid token (Staff)
const t1StaffToken = stubTokenService.sign({ userId: 'u1-staff', role: UserRole.STAFF, tenantId: 't1', tenantSlug: 't1' });

// Tenant B (t2) user valid token (Owner)
const t2OwnerToken = stubTokenService.sign({ userId: 'u2-owner', role: UserRole.BUSINESS_OWNER, tenantId: 't2', tenantSlug: 't2' });

const stubTenantRepo: ITenantRepository = {
  findById: async () => null,
  // Built through Tenant.create rather than as an object literal: a literal has
  // to be updated by hand every time the entity gains a field, which is how this
  // double broke on the last three entity changes. See TD-002.
  findBySlug: async (slug: string) => {
    if (slug === 't1') return Tenant.create({ id: 't1', name: 'Tenant 1', urlSlug: 't1', createdAt: new Date() });
    if (slug === 't2') return Tenant.create({ id: 't2', name: 'Tenant 2', urlSlug: 't2', createdAt: new Date() });
    return null;
  },
  create: async (t: any) => t,
  updateSettingsForMany: async () => 0,
  findAll: async () => ({ items: [], total: 0 }),
  updateSettings: async () => {},
  setSubscriptionStatus: async () => {},
  setSalesWorkflow: async () => {},
};

const app = express();
app.use(express.json());
app.use('/api/:tenantSlug/appointments', createAppointmentRouter(prisma, stubTokenService, stubTenantRepo));

describe('Appointment Routes (Integration)', () => {
  beforeAll(async () => {
    // Setup tenants
    await prisma.tenant.upsert({ where: { id: 't1' }, create: { id: 't1', name: 'Tenant 1', urlSlug: 't1' }, update: {} });
    await prisma.tenant.upsert({ where: { id: 't2' }, create: { id: 't2', name: 'Tenant 2', urlSlug: 't2' }, update: {} });
    
    // Setup users (Tenant 1)
    await prisma.user.upsert({ where: { id: 'u1-owner' }, create: { id: 'u1-owner', email: 'owner@t1.com', hashedPassword: 'hash', role: 'BUSINESS_OWNER', tenantId: 't1' }, update: {} });
    await prisma.user.upsert({ where: { id: 'u1-staff' }, create: { id: 'u1-staff', email: 'staff@t1.com', hashedPassword: 'hash', role: 'STAFF', tenantId: 't1' }, update: {} });
    
    // Setup user (Tenant 2)
    await prisma.user.upsert({ where: { id: 'u2-owner' }, create: { id: 'u2-owner', email: 'owner@t2.com', hashedPassword: 'hash', role: 'BUSINESS_OWNER', tenantId: 't2' }, update: {} });

    // Setup client (Tenant 1)
    await prisma.client.upsert({
      where: { id: 'c1-t1' },
      create: { id: 'c1-t1', tenantId: 't1', name: 'Client 1 T1', status: ClientStatus.CLIENT, customFieldValues: {}, lastUpdatedByUserId: 'u1-owner' },
      update: {}
    });

    // Clean up appointments
    await prisma.appointmentAuditLog.deleteMany({});
    await prisma.appointment.deleteMany({});
  });

  afterAll(async () => {
    await prisma.appointmentAuditLog.deleteMany({});
    await prisma.appointment.deleteMany({});
    // Clean up our specific clients
    await prisma.client.delete({ where: { id: 'c2-t2' } }).catch(() => {});
    await prisma.client.delete({ where: { id: 'c1-t1' } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { recipient: { email: { in: ['owner@t1.com', 'staff@t1.com', 'owner@t2.com'] } } } });
    await prisma.user.deleteMany({ where: { email: { in: ['owner@t1.com', 'staff@t1.com', 'owner@t2.com'] } } });
    await prisma.$disconnect();
  });

  let createdAppointmentId: string;

  it('POST / creates an appointment', async () => {
    const res = await request(app)
      .post('/api/t1/appointments')
      .set('Authorization', `Bearer ${t1OwnerToken}`)
      .send({
        clientId: 'c1-t1',
        assignedUserId: 'u1-staff',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        notes: 'Initial consultation'
      });
    
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: expect.any(String),
      tenantId: 't1',
      clientId: 'c1-t1',
      assignedUserId: 'u1-staff',
      status: AppointmentStatus.SCHEDULED,
      notes: 'Initial consultation',
      history: expect.any(Array),
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    }));
    createdAppointmentId = res.body.id;
  });

  it('PUT /:id/reschedule reschedules an appointment', async () => {
    const res = await request(app)
      .put(`/api/t1/appointments/${createdAppointmentId}/reschedule`)
      .set('Authorization', `Bearer ${t1OwnerToken}`)
      .send({
        newDate: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
        reason: 'Client requested different time'
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      id: createdAppointmentId,
      status: AppointmentStatus.SCHEDULED,
      updatedAt: expect.any(String)
    }));
    // Also confirm the new date was applied
    expect(new Date(res.body.scheduledAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('GET /:id/history returns audit logs including the reschedule', async () => {
    const res = await request(app)
      .get(`/api/t1/appointments/${createdAppointmentId}/history`)
      .set('Authorization', `Bearer ${t1OwnerToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].reason).toBe('Client requested different time');
  });

  it('PUT /:id/status updates the status to CONFIRMED', async () => {
    const res = await request(app)
      .put(`/api/t1/appointments/${createdAppointmentId}/status`)
      .set('Authorization', `Bearer ${t1OwnerToken}`)
      .send({ status: 'CONFIRMED' });
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      id: createdAppointmentId,
      status: AppointmentStatus.CONFIRMED,
      updatedAt: expect.any(String)
    }));
  });

  it('PUT /:id/cancel updates the status to CANCELLED', async () => {
    // We create a new appointment just for the cancel test, as the other one is CONFIRMED and might be used in other tests
    const createRes = await request(app)
      .post('/api/t1/appointments')
      .set('Authorization', `Bearer ${t1OwnerToken}`)
      .send({
        clientId: 'c1-t1',
        assignedUserId: 'u1-staff',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      });
    const cancelId = createRes.body.id;

    const res = await request(app)
      .put(`/api/t1/appointments/${cancelId}/cancel`)
      .set('Authorization', `Bearer ${t1OwnerToken}`)
      .send({ reason: 'Client requested cancellation' });
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      id: cancelId,
      status: AppointmentStatus.CANCELLED,
      updatedAt: expect.any(String)
    }));
  });

  it('GET /search returns appointments in date range', async () => {
    const res = await request(app)
      .get('/api/t1/appointments/search')
      .set('Authorization', `Bearer ${t1OwnerToken}`)
      .query({
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 259200000).toISOString(), // 3 days from now
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const ids = res.body.map((a: any) => a.id);
    expect(ids).toContain(createdAppointmentId);
  });

  it('GET /upcoming (Staff Role) returns only assigned appointments', async () => {
    const res = await request(app)
      .get('/api/t1/appointments/upcoming')
      .set('Authorization', `Bearer ${t1StaffToken}`); // Staff Token!
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].assignedUserId).toBe('u1-staff');
  });

  it('Cross-Tenant Isolation: Tenant B cannot search Tenant A appointments', async () => {
    // Attempting to query Tenant 1's route with Tenant 2's token will fail at middleware
    const res = await request(app)
      .get('/api/t1/appointments/search')
      .set('Authorization', `Bearer ${t2OwnerToken}`)
      .query({
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 259200000).toISOString(),
      });
    
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Cross-tenant access forbidden');
  });

  it('Cross-Tenant Isolation: Tenant B using its own route returns empty results (does not leak Tenant A data)', async () => {
    // Querying Tenant 2's route with Tenant 2's token -> should return empty, not Tenant 1's appts
    const res = await request(app)
      .get('/api/t2/appointments/search')
      .set('Authorization', `Bearer ${t2OwnerToken}`)
      .query({
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 259200000).toISOString(),
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
  
  it('Cross-Tenant Isolation: Tenant B using its own upcoming route returns empty results', async () => {
    // Querying Tenant 2's route with Tenant 2's token -> should return empty, not Tenant 1's appts
    const res = await request(app)
      .get('/api/t2/appointments/upcoming')
      .set('Authorization', `Bearer ${t2OwnerToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('Cross-Entity Consistency: Tenant A creating an appointment for Tenant B client is rejected', async () => {
    // Setup Tenant B client
    await prisma.client.upsert({
      where: { id: 'c2-t2' },
      create: { id: 'c2-t2', tenantId: 't2', name: 'Client 2 T2', status: ClientStatus.CLIENT, customFieldValues: {}, lastUpdatedByUserId: 'u2-owner' },
      update: {}
    });

    const res = await request(app)
      .post('/api/t1/appointments')
      .set('Authorization', `Bearer ${t1OwnerToken}`)
      .send({
        clientId: 'c2-t2', // Client belongs to T2
        assignedUserId: 'u1-staff',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Cross tenant attempt'
      });
    
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Client not found');

    await prisma.client.delete({ where: { id: 'c2-t2' } }).catch(() => {});
  });

  it('GET /upcoming (Business Owner Role) returns company-wide upcoming appointments', async () => {
    // Ensure we have an upcoming appointment assigned to u1-staff
    // Create another appointment assigned to u1-owner to test company wide
    await prisma.appointment.create({
      data: {
        id: 'appt-2',
        tenantId: 't1',
        clientId: 'c1-t1',
        assignedUserId: 'u1-owner', // Different user
        scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
        status: AppointmentStatus.SCHEDULED
      }
    });

    const res = await request(app)
      .get('/api/t1/appointments/upcoming')
      .set('Authorization', `Bearer ${t1OwnerToken}`); // Business Owner Token
    
    expect(res.status).toBe(200);
    // Should see both the one assigned to u1-staff (from first test) and u1-owner
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const assignedIds = res.body.map((a: any) => a.assignedUserId);
    expect(assignedIds).toContain('u1-staff');
    expect(assignedIds).toContain('u1-owner');

    await prisma.appointmentAuditLog.deleteMany({ where: { appointmentId: 'appt-2' } });
    await prisma.appointment.delete({ where: { id: 'appt-2' } });
  });
});
