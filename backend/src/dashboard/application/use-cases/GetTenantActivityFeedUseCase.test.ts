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
import { administrator, reception, salesUser, scopeResolver } from '../../../../tests/support/access';

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
      mockAppointmentRepo,
      scopeResolver()
    );
  });

  const ALL = { kind: 'all' };
  const own = (userId: string) => ({ kind: 'owners', userIds: [userId], includeUnowned: false });
  const EVERY_CHANNEL = Object.values(InteractionChannel);

  it('should enforce tenant isolation across all repository calls', async () => {
    mockClientRepo.findRecentByTenant.mockResolvedValue([]);
    mockInteractionRepo.findRecentByTenant.mockResolvedValue([]);
    mockAppointmentRepo.findRecentByTenant.mockResolvedValue([]);

    await useCase.execute({ tenantId: 'tenant-a', access: administrator(), limit: 10 });

    expect(mockClientRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, ALL);
    expect(mockInteractionRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, {
      scope: ALL,
      channels: expect.arrayContaining(EVERY_CHANNEL),
    });
    expect(mockAppointmentRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, ALL);
  });

  describe('scope-based scoping (FR-RBAC-11..13)', () => {
    beforeEach(() => {
      mockClientRepo.findRecentByTenant.mockResolvedValue([]);
      mockInteractionRepo.findRecentByTenant.mockResolvedValue([]);
      mockAppointmentRepo.findRecentByTenant.mockResolvedValue([]);
    });

    it('a Sales User sees their own companies, their activity and their appointments', async () => {
      await useCase.execute({ tenantId: 'tenant-a', access: salesUser({ userId: 'su-1' }), limit: 10 });

      expect(mockClientRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, own('su-1'));
      expect(mockInteractionRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, {
        scope: own('su-1'),
        channels: expect.arrayContaining(EVERY_CHANNEL),
      });
      expect(mockAppointmentRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, own('su-1'));
    });

    it('D3 Reception sees notes only, and no appointments', async () => {
      await useCase.execute({ tenantId: 'tenant-a', access: reception(), limit: 10 });

      expect(mockInteractionRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, {
        scope: ALL,
        channels: [InteractionChannel.NOTE],
      });
      expect(mockAppointmentRepo.findRecentByTenant).toHaveBeenCalledWith('tenant-a', 10, { kind: 'none' });
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
      Client.create({ id: 'c1', tenantId: 'tenant-a', name: 'Client 1', status: ClientStatus.CLIENT, lastUpdatedByUserId: 'u1', customFieldValues: {}, contactInfo: { email: 'a@a.com', phone: '123' }, updatedAt: new Date(), createdAt: new Date(baseDate.getTime() + 16000) }, []),
      Client.create({ id: 'c2', tenantId: 'tenant-a', name: 'Client 2', status: ClientStatus.CLIENT, lastUpdatedByUserId: 'u1', customFieldValues: {}, contactInfo: { email: 'b@b.com', phone: '456' }, updatedAt: new Date(), createdAt: new Date(baseDate.getTime() + 17000) }, []),
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

    const result = await useCase.execute({ tenantId: 'tenant-a', access: administrator(), limit: 10 });

    expect(result.timeline).toHaveLength(10);
    // The newest should be the appointment, then the 2 clients, then the 7 newest interactions
    expect(result.timeline[0].type).toBe('APPOINTMENT_SCHEDULED');
    expect(result.timeline[1].type).toBe('CLIENT_CREATED');
    expect(result.timeline[2].type).toBe('CLIENT_CREATED');
    expect(result.timeline[3].type).toBe('INTERACTION_ADDED');
    expect(result.timeline[9].type).toBe('INTERACTION_ADDED');
  });
});
