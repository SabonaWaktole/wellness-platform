import { CancelAppointmentUseCase } from '../../../../../src/appointments/application/use-cases/CancelAppointmentUseCase';
import { administrator, salesUser, scopeResolver } from '../../../../support/access';

describe('CancelAppointmentUseCase', () => {
  let useCase: CancelAppointmentUseCase;
  let mockAppointmentRepository: any;
  let mockAppointment: any;

  beforeEach(() => {
    mockAppointment = {
      cancel: jest.fn(),
    };

    mockAppointmentRepository = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    useCase = new CancelAppointmentUseCase(mockAppointmentRepository, scopeResolver());
  });

  it('should cancel an existing appointment', async () => {
    mockAppointmentRepository.findById.mockResolvedValue(mockAppointment);

    const id = 'apt-123';
    const tenantId = 'tenant-1';
    const reason = 'Client no-show';
    const changedBy = 'user-1';

    await useCase.execute({ access: administrator(), id, tenantId, reason, changedByUserId: changedBy });

    expect(mockAppointmentRepository.findById).toHaveBeenCalledWith(id, tenantId);
    expect(mockAppointment.cancel).toHaveBeenCalledWith(reason, changedBy);
    expect(mockAppointmentRepository.update).toHaveBeenCalledWith(mockAppointment);
  });

  it('cross-tenant isolation: repo lookup scoped to tenantId — Tenant B cannot cancel Tenant A appointment', async () => {
    mockAppointmentRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ access: administrator(), id: 'apt-owned-by-tenant-A', tenantId: 'tenant-B', reason: 'reason', changedByUserId: 'malicious-user' })
    ).rejects.toThrow('Appointment not found');

    expect(mockAppointmentRepository.findById).toHaveBeenCalledWith('apt-owned-by-tenant-A', 'tenant-B');
    expect(mockAppointment.cancel).not.toHaveBeenCalled();
    expect(mockAppointmentRepository.update).not.toHaveBeenCalled();
  });
});
