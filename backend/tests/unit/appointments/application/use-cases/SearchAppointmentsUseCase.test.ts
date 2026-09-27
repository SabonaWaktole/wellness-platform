import { SearchAppointmentsUseCase } from '../../../../../src/appointments/application/use-cases/SearchAppointmentsUseCase';
import { AppointmentStatus } from '../../../../../src/appointments/domain/enums/AppointmentStatus';
import { administrator, salesUser, scopeResolver } from '../../../../support/access';

describe('SearchAppointmentsUseCase', () => {
  let useCase: SearchAppointmentsUseCase;
  let mockAppointmentRepository: any;

  beforeEach(() => {
    mockAppointmentRepository = {
      findByDateRange: jest.fn(),
    };

    useCase = new SearchAppointmentsUseCase(mockAppointmentRepository, scopeResolver());
  });

  it('should return mapped appointment DTOs for a given date range', async () => {
    const mockAppointments = [
      {
        id: 'apt-1',
        clientId: 'client-1',
        assignedUserId: 'user-1',
        scheduledAt: new Date('2026-07-20T10:00:00Z'),
        status: AppointmentStatus.SCHEDULED,
      },
      {
        id: 'apt-2',
        clientId: 'client-2',
        assignedUserId: 'user-1',
        scheduledAt: new Date('2026-07-21T11:00:00Z'),
        status: AppointmentStatus.CONFIRMED,
      },
    ];

    mockAppointmentRepository.findByDateRange.mockResolvedValue(mockAppointments);

    const tenantId = 'tenant-1';
    const startDate = new Date('2026-07-01T00:00:00Z');
    const endDate = new Date('2026-07-31T23:59:59Z');
    const filters = { clientId: 'client-1', assignedUserId: 'user-1', status: AppointmentStatus.SCHEDULED };

    const results = await useCase.execute({ access: administrator(), tenantId, startDate, endDate, filters });

    expect(mockAppointmentRepository.findByDateRange).toHaveBeenCalledWith(tenantId, startDate, endDate, { ...filters, scope: { kind: 'all' } });
    expect(results).toEqual([
      {
        id: 'apt-1',
        clientId: 'client-1',
        assignedUserId: 'user-1',
        scheduledAt: mockAppointments[0].scheduledAt,
        status: AppointmentStatus.SCHEDULED,
      },
      {
        id: 'apt-2',
        clientId: 'client-2',
        assignedUserId: 'user-1',
        scheduledAt: mockAppointments[1].scheduledAt,
        status: AppointmentStatus.CONFIRMED,
      },
    ]);
  });

  it('cross-tenant isolation: tenantId is always forwarded to the repository', async () => {
    mockAppointmentRepository.findByDateRange.mockResolvedValue([]);

    const tenantId = 'tenant-X';
    const startDate = new Date('2026-07-01T00:00:00Z');
    const endDate = new Date('2026-07-31T23:59:59Z');

    await useCase.execute({ access: administrator(), tenantId, startDate, endDate });

    // The repo is called with the exact tenantId — infrastructure enforces scoping
    expect(mockAppointmentRepository.findByDateRange).toHaveBeenCalledWith(
      'tenant-X', startDate, endDate, { scope: { kind: 'all' } }
    );
  });

  it('FR-RBAC-13 narrows the calendar to a Sales User\'s own appointments in the query', async () => {
    mockAppointmentRepository.findByDateRange.mockResolvedValue([]);
    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-01-31');

    await useCase.execute({ access: salesUser({ userId: 'su-1' }), tenantId: 'tenant-X', startDate, endDate });

    expect(mockAppointmentRepository.findByDateRange).toHaveBeenCalledWith('tenant-X', startDate, endDate, {
      scope: { kind: 'owners', userIds: ['su-1'], includeUnowned: false },
    });
  });
});
