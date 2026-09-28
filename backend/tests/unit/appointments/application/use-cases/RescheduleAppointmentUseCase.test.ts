import { RescheduleAppointmentUseCase } from '../../../../../src/appointments/application/use-cases/RescheduleAppointmentUseCase';
import { administrator, salesUser, scopeResolver } from '../../../../support/access';

describe('RescheduleAppointmentUseCase', () => {
  let useCase: RescheduleAppointmentUseCase;
  let mockAppointmentRepository: any;
  let mockAppointment: any;

  beforeEach(() => {
    mockAppointment = {
      reschedule: jest.fn(),
    };

    mockAppointmentRepository = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    useCase = new RescheduleAppointmentUseCase(mockAppointmentRepository, scopeResolver());
  });

  it('should reschedule an existing appointment', async () => {
    mockAppointmentRepository.findById.mockResolvedValue(mockAppointment);
    
    const id = 'apt-123';
    const tenantId = 'tenant-1';
    const newDate = new Date('2026-08-01T10:00:00Z');
    const reason = 'Client request';
    const changedByUserId = 'user-1';

    await useCase.execute({ access: administrator(),
      id,
      tenantId,
      newDate,
      reason,
      changedByUserId,
    });

    expect(mockAppointmentRepository.findById).toHaveBeenCalledWith(id, tenantId);
    expect(mockAppointment.reschedule).toHaveBeenCalledWith(newDate, reason, changedByUserId);
    expect(mockAppointmentRepository.update).toHaveBeenCalledWith(mockAppointment);
  });

  it('cross-tenant isolation: repo lookup scoped to tenantId — Tenant B cannot reschedule Tenant A appointment', async () => {
    // When findById is called with tenant-B's tenantId, the repo returns null
    // because the appointment belongs to tenant-A (infrastructure enforces this)
    mockAppointmentRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ access: administrator(),
        id: 'apt-owned-by-tenant-A',
        tenantId: 'tenant-B',
        newDate: new Date(),
        reason: 'Attempting cross-tenant access',
        changedByUserId: 'malicious-user',
      })
    ).rejects.toThrow('Appointment not found');

    expect(mockAppointmentRepository.findById).toHaveBeenCalledWith('apt-owned-by-tenant-A', 'tenant-B');
    expect(mockAppointment.reschedule).not.toHaveBeenCalled();
    expect(mockAppointmentRepository.update).not.toHaveBeenCalled();
  });
});
