import { CreateAppointmentUseCase } from '../../../../../src/appointments/application/use-cases/CreateAppointmentUseCase';
import { AppointmentStatus } from '../../../../../src/appointments/domain/enums/AppointmentStatus';
import { DomainError } from '../../../../../src/shared/domain/errors/DomainError';
import { administrator, salesUser, scopeResolver } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

describe('CreateAppointmentUseCase', () => {
  let useCase: CreateAppointmentUseCase;
  let mockAppointmentRepo: any;
  let mockClientRepo: any;
  let mockUserRepo: any;
  const planningLinks = {
    dealBelongsToCompany: jest.fn().mockResolvedValue(true),
    contactBelongsToCompany: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    mockAppointmentRepo = {
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockClientRepo = {
      findById: jest.fn(),
    };
    mockUserRepo = {
      findById: jest.fn(),
    };

    useCase = new CreateAppointmentUseCase(
      mockAppointmentRepo,
      mockClientRepo,
      mockUserRepo,
      scopeResolver(),
      planningLinks
    );
  });

  const validDto = {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    assignedUserId: 'user-1',
    scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
    notes: 'Test notes',
    // Distinct from assignedUserId so a notification would actually be emitted
    // if one were wired here — self-assignment is dropped by design.
    actingUserId: 'acting-user-1',
    access: administrator({ userId: 'acting-user-1' }),
  };

  it('should successfully create an appointment when all cross-tenant checks pass', async () => {
    mockClientRepo.findById.mockResolvedValue({ tenantId: 'tenant-1' });
    mockUserRepo.findById.mockResolvedValue({ tenantId: 'tenant-1' });

    const result = await useCase.execute(validDto);

    expect(result.id).toBeDefined();
    expect(result.status).toBe(AppointmentStatus.SCHEDULED);
    expect(result.tenantId).toBe('tenant-1');
    expect(mockAppointmentRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if the client does not exist', async () => {
    mockClientRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(validDto)).rejects.toThrow('Client not found');
    expect(mockAppointmentRepo.save).not.toHaveBeenCalled();
  });

  it('should throw an error if the client belongs to a different tenant', async () => {
    mockClientRepo.findById.mockResolvedValue({ tenantId: 'tenant-2' }); // Mismatch

    await expect(useCase.execute(validDto)).rejects.toThrow(DomainError);
    await expect(useCase.execute(validDto)).rejects.toThrow('Client does not belong to this tenant');
    expect(mockAppointmentRepo.save).not.toHaveBeenCalled();
  });

  it('should throw an error if the assigned user does not exist', async () => {
    mockClientRepo.findById.mockResolvedValue({ tenantId: 'tenant-1' });
    mockUserRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(validDto)).rejects.toThrow('Assigned user not found');
    expect(mockAppointmentRepo.save).not.toHaveBeenCalled();
  });

  it('should throw an error if the assigned user belongs to a different tenant', async () => {
    mockClientRepo.findById.mockResolvedValue({ tenantId: 'tenant-1' });
    mockUserRepo.findById.mockResolvedValue({ tenantId: 'tenant-2' }); // Mismatch

    await expect(useCase.execute(validDto)).rejects.toThrow(DomainError);
    await expect(useCase.execute(validDto)).rejects.toThrow('Assigned user does not belong to this tenant');
    expect(mockAppointmentRepo.save).not.toHaveBeenCalled();
  });

  describe('FR-RBAC-11 data scope', () => {
    it('refuses a Sales User scheduling an appointment for someone else', async () => {
      await expect(
        useCase.execute({ ...validDto, assignedUserId: 'user-1', access: salesUser({ userId: 'acting-user-1' }) })
      ).rejects.toThrow(PermissionDeniedError);
      expect(mockAppointmentRepo.save).not.toHaveBeenCalled();
    });

    it('looks the company up within the viewer\'s activities.add scope', async () => {
      mockClientRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({ ...validDto, assignedUserId: 'acting-user-1', access: salesUser({ userId: 'acting-user-1' }) })
      ).rejects.toThrow('Client not found');
      expect(mockClientRepo.findById).toHaveBeenCalledWith('tenant-1', 'client-1', {
        scope: { kind: 'owners', userIds: ['acting-user-1'], includeUnowned: false },
      });
    });
  });
});
