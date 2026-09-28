import { GetAppointmentHistoryUseCase } from '../../../../../src/appointments/application/use-cases/GetAppointmentHistoryUseCase';
import { administrator, salesUser, scopeResolver } from '../../../../support/access';

describe('GetAppointmentHistoryUseCase', () => {
  let useCase: GetAppointmentHistoryUseCase;
  let mockAppointmentRepository: any;

  beforeEach(() => {
    mockAppointmentRepository = {
      findById: jest.fn(),
    };

    useCase = new GetAppointmentHistoryUseCase(mockAppointmentRepository, scopeResolver());
  });

  it('should return the mapped history DTOs for an appointment', async () => {
    const mockHistory = [
      {
        id: 'log-1',
        previousDate: new Date('2026-06-30T00:00:00Z'),
        newDate: new Date('2026-07-01T00:00:00Z'),
        reason: 'Initial schedule',
        changedBy: 'user-1',
        createdAt: new Date('2026-06-30T00:00:00Z'),
      },
      {
        id: 'log-2',
        previousDate: new Date('2026-07-01T00:00:00Z'),
        newDate: new Date('2026-07-02T00:00:00Z'),
        reason: 'Conflict',
        changedBy: 'user-2',
        createdAt: new Date('2026-07-01T05:00:00Z'),
      },
    ];

    const mockAppointment = {
      id: 'apt-123',
      history: mockHistory
    };

    mockAppointmentRepository.findById.mockResolvedValue(mockAppointment);

    const id = 'apt-123';
    const tenantId = 'tenant-1';

    const results = await useCase.execute({ access: administrator(), id, tenantId });

    expect(mockAppointmentRepository.findById).toHaveBeenCalledWith(id, tenantId);
    expect(results).toEqual(mockHistory);
  });

  it('cross-tenant isolation: repo lookup scoped to tenantId — Tenant B cannot view Tenant A appointment history', async () => {
    mockAppointmentRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ access: administrator(), id: 'apt-owned-by-tenant-A', tenantId: 'tenant-B' })
    ).rejects.toThrow('Appointment not found');

    expect(mockAppointmentRepository.findById).toHaveBeenCalledWith('apt-owned-by-tenant-A', 'tenant-B');
  });
});
