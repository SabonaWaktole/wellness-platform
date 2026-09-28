import { GetUpcomingAppointmentsUseCase } from '../../../../../src/appointments/application/use-cases/GetUpcomingAppointmentsUseCase';
import { AppointmentStatus } from '../../../../../src/appointments/domain/enums/AppointmentStatus';
import { administrator, salesManager, salesUser, scopeResolver } from '../../../../support/access';

describe('GetUpcomingAppointmentsUseCase', () => {
  let useCase: GetUpcomingAppointmentsUseCase;
  let mockAppointmentRepository: any;

  beforeEach(() => {
    mockAppointmentRepository = {
      findUpcoming: jest.fn(),
    };

    useCase = new GetUpcomingAppointmentsUseCase(mockAppointmentRepository, scopeResolver());
  });

  it('STAFF: should pass userId to repo, filtering to only their own appointments', async () => {
    const staffOnlyAppointments = [
      {
        id: 'apt-1',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        assignedUserId: 'staff-1',  // Only this staff member's appointments
        scheduledAt: new Date('2026-07-20T10:00:00Z'),
        status: AppointmentStatus.SCHEDULED,
        notes: 'Check-in',
      },
    ];
    mockAppointmentRepository.findUpcoming.mockResolvedValue(staffOnlyAppointments);

    const results = await useCase.execute({ access: salesUser({ userId: 'staff-1' }),
      tenantId: 'tenant-1',
      limit: 10,
    });

    // Critical assertion: the repo receives the staff member's own scope, so it can filter
    expect(mockAppointmentRepository.findUpcoming).toHaveBeenCalledWith(
      'tenant-1',
      { kind: 'owners', userIds: ['staff-1'], includeUnowned: false },
      10
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'apt-1',
      tenantId: 'tenant-1',
      clientId: 'client-1',
      assignedUserId: 'staff-1',
      scheduledAt: staffOnlyAppointments[0].scheduledAt,
      status: AppointmentStatus.SCHEDULED,
      notes: 'Check-in',
    });
  });

  it('BUSINESS_OWNER: should pass undefined for userId, getting ALL staff appointments company-wide', async () => {
    const companyWideAppointments = [
      {
        id: 'apt-1',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        assignedUserId: 'staff-1',  // Staff member A
        scheduledAt: new Date('2026-07-20T10:00:00Z'),
        status: AppointmentStatus.SCHEDULED,
        notes: 'Meeting',
      },
      {
        id: 'apt-2',
        tenantId: 'tenant-1',
        clientId: 'client-2',
        assignedUserId: 'staff-2',  // Staff member B — different staff
        scheduledAt: new Date('2026-07-21T14:00:00Z'),
        status: AppointmentStatus.CONFIRMED,
        notes: 'Follow-up',
      },
    ];
    mockAppointmentRepository.findUpcoming.mockResolvedValue(companyWideAppointments);

    const results = await useCase.execute({ access: administrator(),
      tenantId: 'tenant-1',
      limit: 5,
    });

    // Critical assertion: an ALL scope means "all staff" — no assignee filter
    expect(mockAppointmentRepository.findUpcoming).toHaveBeenCalledWith('tenant-1', { kind: 'all' }, 5);
    expect(results).toHaveLength(2);
    // Verify appointments from DIFFERENT staff members are both returned
    expect(results[0].assignedUserId).toBe('staff-1');
    expect(results[1].assignedUserId).toBe('staff-2');
    expect(results).toEqual([
      {
        id: 'apt-1',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        assignedUserId: 'staff-1',
        scheduledAt: companyWideAppointments[0].scheduledAt,
        status: AppointmentStatus.SCHEDULED,
        notes: 'Meeting',
      },
      {
        id: 'apt-2',
        tenantId: 'tenant-1',
        clientId: 'client-2',
        assignedUserId: 'staff-2',
        scheduledAt: companyWideAppointments[1].scheduledAt,
        status: AppointmentStatus.CONFIRMED,
        notes: 'Follow-up',
      },
    ]);
  });

  it('FR-RBAC-11: scopes to the caller when the calendar.view scope is OWN', async () => {
    mockAppointmentRepository.findUpcoming.mockResolvedValue([]);

    await useCase.execute({ access: salesUser({ userId: 'su-1' }), tenantId: 'tenant-1', limit: 10 });

    expect(mockAppointmentRepository.findUpcoming).toHaveBeenCalledWith('tenant-1', { kind: 'owners', userIds: ['su-1'], includeUnowned: false }, 10);
  });

  it('FR-RBAC-12: a TEAM scope reaches the Sales Users and the caller', async () => {
    mockAppointmentRepository.findUpcoming.mockResolvedValue([]);
    const withTeam = new GetUpcomingAppointmentsUseCase(mockAppointmentRepository, scopeResolver(['su-1', 'su-2']));

    await withTeam.execute({ access: salesManager({ userId: 'sm-1' }), tenantId: 'tenant-1', limit: 10 });

    expect(mockAppointmentRepository.findUpcoming).toHaveBeenCalledWith(
      'tenant-1',
      { kind: 'owners', userIds: ['su-1', 'su-2', 'sm-1'], includeUnowned: true },
      10
    );
  });

  it('ALL reaches every appointment', async () => {
    mockAppointmentRepository.findUpcoming.mockResolvedValue([]);

    await useCase.execute({ access: administrator(), tenantId: 'tenant-1', limit: 10 });

    expect(mockAppointmentRepository.findUpcoming).toHaveBeenCalledWith('tenant-1', { kind: 'all' }, 10);
  });

  it('should default limit to 5 when not provided', async () => {
    mockAppointmentRepository.findUpcoming.mockResolvedValue([]);

    await useCase.execute({ access: salesUser({ userId: 'staff-1' }),
      tenantId: 'tenant-1',
    });

    expect(mockAppointmentRepository.findUpcoming).toHaveBeenCalledWith('tenant-1', { kind: 'owners', userIds: ['staff-1'], includeUnowned: false }, 5);
  });

  it('cross-tenant isolation: tenantId is always forwarded to the repository', async () => {
    mockAppointmentRepository.findUpcoming.mockResolvedValue([]);

    await useCase.execute({ access: salesUser({ userId: 'staff-1' }),
      tenantId: 'tenant-A',
      limit: 3,
    });

    // The repo is called with tenant-A, so the infrastructure layer
    // enforces that only tenant-A's data is returned
    expect(mockAppointmentRepository.findUpcoming).toHaveBeenCalledWith('tenant-A', { kind: 'owners', userIds: ['staff-1'], includeUnowned: false }, 3);
  });
});
