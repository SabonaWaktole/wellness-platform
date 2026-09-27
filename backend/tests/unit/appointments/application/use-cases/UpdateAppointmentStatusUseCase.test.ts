import { UpdateAppointmentStatusUseCase } from '../../../../../src/appointments/application/use-cases/UpdateAppointmentStatusUseCase';
import { administrator, salesUser, scopeResolver } from '../../../../support/access';

describe('UpdateAppointmentStatusUseCase', () => {
  let useCase: UpdateAppointmentStatusUseCase;
  let mockAppointmentRepository: any;
  let mockAppointment: any;

  beforeEach(() => {
    mockAppointment = {
      confirm: jest.fn(),
      complete: jest.fn(),
    };

    mockAppointmentRepository = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    useCase = new UpdateAppointmentStatusUseCase(mockAppointmentRepository, scopeResolver());
  });

  it('should confirm an appointment when status is CONFIRMED', async () => {
    mockAppointmentRepository.findById.mockResolvedValue(mockAppointment);

    await useCase.execute({ access: administrator(), id: 'apt-123', tenantId: 'tenant-1', status: 'CONFIRMED' });

    expect(mockAppointmentRepository.findById).toHaveBeenCalledWith('apt-123', 'tenant-1');
    expect(mockAppointment.confirm).toHaveBeenCalled();
    expect(mockAppointmentRepository.update).toHaveBeenCalledWith(mockAppointment);
  });

  it('should complete an appointment when status is COMPLETED', async () => {
    mockAppointmentRepository.findById.mockResolvedValue(mockAppointment);

    await useCase.execute({ access: administrator(), id: 'apt-123', tenantId: 'tenant-1', status: 'COMPLETED' });

    expect(mockAppointment.complete).toHaveBeenCalled();
    expect(mockAppointmentRepository.update).toHaveBeenCalledWith(mockAppointment);
  });

  it('should throw an error for invalid status inputs', async () => {
    mockAppointmentRepository.findById.mockResolvedValue(mockAppointment);

    await expect(
      useCase.execute({ access: administrator(), id: 'apt-123', tenantId: 'tenant-1', status: 'INVALID_STATUS' })
    ).rejects.toThrow('Invalid status');

    expect(mockAppointment.confirm).not.toHaveBeenCalled();
    expect(mockAppointment.complete).not.toHaveBeenCalled();
    expect(mockAppointmentRepository.update).not.toHaveBeenCalled();
  });

  it('should throw an error if appointment is not found (enforces cross-tenant isolation)', async () => {
    mockAppointmentRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ access: administrator(), id: 'apt-not-found', tenantId: 'tenant-2', status: 'CONFIRMED' })
    ).rejects.toThrow('Appointment not found');
  });

  it('should propagate DomainError thrown by the entity for invalid state transitions', async () => {
    const { DomainError } = require('../../../../../src/shared/domain/errors/DomainError');
    mockAppointmentRepository.findById.mockResolvedValue(mockAppointment);
    
    // Simulate the entity throwing a DomainError because the transition is invalid
    mockAppointment.complete.mockImplementation(() => {
      throw new DomainError('Cannot transition from SCHEDULED to COMPLETED');
    });

    await expect(
      useCase.execute({ access: administrator(), id: 'apt-123', tenantId: 'tenant-1', status: 'COMPLETED' })
    ).rejects.toThrow(DomainError);
    
    await expect(
      useCase.execute({ access: administrator(), id: 'apt-123', tenantId: 'tenant-1', status: 'COMPLETED' })
    ).rejects.toThrow('Cannot transition from SCHEDULED to COMPLETED');
  });
});
