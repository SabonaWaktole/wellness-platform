import { GetTenantActivityFeedUseCase } from './GetTenantActivityFeedUseCase';
import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../../clients/domain/repositories/IInteractionRepository';
import { IAppointmentRepository } from '../../../appointments/domain/repositories/IAppointmentRepository';
import { Client } from '../../../clients/domain/entities/Client';
import { Interaction } from '../../../clients/domain/entities/Interaction';
import { Appointment } from '../../../appointments/domain/entities/Appointment';
import { AppointmentStatus } from '../../../appointments/domain/enums/AppointmentStatus';
import { InteractionChannel } from '../../../clients/domain/enums/InteractionChannel';
import { ClientStatus } from '../../../clients/domain/enums/ClientStatus';

describe('GetTenantActivityFeedUseCase', () => {
  let useCase: GetTenantActivityFeedUseCase;
  let mockClientRepo: jest.Mocked<IClientRepository>;
  let mockInteractionRepo: jest.Mocked<IInteractionRepository>;
  let mockAppointmentRepo: jest.Mocked<IAppointmentRepository>;

  beforeEach(() => {
    mockClientRepo = {
      findRecentByTenant: jest.fn(),
    } as any;
    mockInteractionRepo = {
      findRecentByTenant: jest.fn(),
    } as any;
    mockAppointmentRepo = {
      findRecentByTenant: jest.fn(),
    } as any;

    useCase = new GetTenantActivityFeedUseCase(
      mockClientRepo,
      mockInteractionRepo,
      mockAppointmentRepo
    );
  });

  it('should enforce tenant isolation across all repository calls', async () => {
    mockClientRepo.findRecentByTenant.mockResolvedValue([]);
    mockInteractionRepo.findRecentByTenant.mockResolvedValue([]);
    mockAppointmentRepo.findRecentByTenant.mockResolvedValue([]);

    await useCase.execute({ tenantId: 'tenant-a', limit: 10 });

    expect(mockClientRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, undefined);
    expect(mockInteractionRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, undefined);
    expect(mockAppointmentRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, undefined);
  });

  describe('scope-based scoping', () => {
    beforeEach(() => {
      mockClientRepo.findRecentByTenant.mockResolvedValue([]);
      mockInteractionRepo.findRecentByTenant.mockResolvedValue([]);
      mockAppointmentRepo.findRecentByTenant.mockResolvedValue([]);
    });

    it('scopes every repository call to the requesting user when scope is OWN', async () => {
      await useCase.execute({ tenantId: 'tenant-a', userId: 'staff-1', scope: 'OWN', limit: 10 });

      expect(mockClientRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, 'staff-1');
      expect(mockInteractionRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, 'staff-1');
      expect(mockAppointmentRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, 'staff-1');
    });

    it('does NOT scope for BUSINESS_OWNER, who sees the whole tenant', async () => {
      await useCase.execute({ tenantId: 'tenant-a', userId: 'owner-1', scope: 'ALL', limit: 10 });

      expect(mockClientRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, undefined);
      expect(mockInteractionRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, undefined);
      expect(mockAppointmentRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, undefined);
    });

    it('FR-RBAC-01: scopes every repository call when the companies.view scope is OWN', async () => {
      await useCase.execute({ tenantId: 'tenant-a', userId: 'su-1', scope: 'OWN', limit: 10 });

      expect(mockClientRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, 'su-1');
      expect(mockInteractionRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, 'su-1');
      expect(mockAppointmentRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, 'su-1');
    });

    it('does NOT scope for a TEAM/ALL companies.view scope', async () => {
      await useCase.execute({ tenantId: 'tenant-a', userId: 'sm-1', scope: 'TEAM', limit: 10 });

      expect(mockClientRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, undefined);
    });

    it('ignores a supplied userId when the scope is not OWN', async () => {
      // Guards against a caller accidentally narrowing an owner's view.
      await useCase.execute({ tenantId: 'tenant-a', userId: 'owner-1', scope: 'ALL', limit: 5 });

      expect(mockClientRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 5, undefined);
    });
  });

  it('should apply limit correctly even with skewed distributions', async () => {
    // Generate 15 recent interactions, 2 recent clients, 1 recent appointment
    const baseDate = new Date('2023-10-01T12:00:00Z');

    const interactions: Interaction[] = [];
    for (let i = 0; i < 15; i++) {
      interactions.push(Interaction.create({
        id: `i${i}`,
        tenantId: 'tenant-a',
        clientId: 'c1',
        authorUserId: 'u1',
        channel: InteractionChannel.NOTE,
        content: `Note ${i}`,
        createdAt: new Date(baseDate.getTime() + i * 1000) // incrementally newer
      }));
    }

    const clients = [
      Client.create({ id: 'c1', tenantId: 'tenant-a', name: 'Client 1', status: ClientStatus.ACTIVE, lastUpdatedByUserId: 'u1', customFieldValues: {}, contactInfo: { email: 'a@a.com', phone: '123' }, updatedAt: new Date(), createdAt: new Date(baseDate.getTime() + 16000) }, []),
      Client.create({ id: 'c2', tenantId: 'tenant-a', name: 'Client 2', status: ClientStatus.ACTIVE, lastUpdatedByUserId: 'u1', customFieldValues: {}, contactInfo: { email: 'b@b.com', phone: '456' }, updatedAt: new Date(), createdAt: new Date(baseDate.getTime() + 17000) }, []),
    ];

    const appointments = [
      Appointment.create({
        id: 'a1', tenantId: 'tenant-a', clientId: 'c1', assignedUserId: 'u1',
        scheduledAt: new Date(), status: AppointmentStatus.SCHEDULED,
        updatedAt: new Date(baseDate.getTime() + 18000)
      })
    ];

    mockInteractionRepo.findRecentByTenant.mockResolvedValue(interactions);
    mockClientRepo.findRecentByTenant.mockResolvedValue(clients);
    mockAppointmentRepo.findRecentByTenant.mockResolvedValue(appointments);

    const result = await useCase.execute({ tenantId: 'tenant-a', limit: 10 });

    expect(result.timeline).toHaveLength(10);
    // The newest should be the appointment, then the 2 clients, then the 7 newest interactions
    expect(result.timeline[0].type).toBe('APPOINTMENT_SCHEDULED');
    expect(result.timeline[1].type).toBe('CLIENT_CREATED');
    expect(result.timeline[2].type).toBe('CLIENT_CREATED');
    expect(result.timeline[3].type).toBe('INTERACTION_ADDED');
    expect(result.timeline[9].type).toBe('INTERACTION_ADDED');
  });
});
