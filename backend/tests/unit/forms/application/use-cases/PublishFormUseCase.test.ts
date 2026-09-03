import { PublishFormUseCase } from '../../../../../src/forms/application/use-cases/PublishFormUseCase';
import { FormVersionConflictError } from '../../../../../src/forms/application/use-cases/UpdateClientFormLayoutUseCase';
import { IClientFormRepository } from '../../../../../src/forms/domain/repositories/IClientFormRepository';
import { IFormVersionRepository } from '../../../../../src/forms/domain/repositories/IFormVersionRepository';
import { ClientForm } from '../../../../../src/forms/domain/entities/ClientForm';
import { FormVersion } from '../../../../../src/forms/domain/entities/FormVersion';
import { FormStatus } from '../../../../../src/forms/domain/enums/FormStatus';
import { UserRole } from '../../../../../src/auth/domain/enums/UserRole';

const mockFormRepo = (): jest.Mocked<IClientFormRepository> => ({
  findByTenantId: jest.fn(),
  findById: jest.fn(),
  findByShareToken: jest.fn(),
  findDefault: jest.fn(),
  save: jest.fn(),
  updateWithVersionCheck: jest.fn(),
  hasSeededDefaultForm: jest.fn(),
  markDefaultFormSeeded: jest.fn(),
  softDelete: jest.fn(),
});

const mockVersionRepo = (): jest.Mocked<IFormVersionRepository> => ({
  save: jest.fn(),
  findByFormAndVersionNumber: jest.fn(),
  findById: jest.fn(),
  listByForm: jest.fn(),
  findLatestVersionNumber: jest.fn(),
});

describe('PublishFormUseCase', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let versionRepo: jest.Mocked<IFormVersionRepository>;
  let useCase: PublishFormUseCase;
  let draft: ClientForm;

  beforeEach(() => {
    formRepo = mockFormRepo();
    versionRepo = mockVersionRepo();
    draft = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake', version: 2 });
    formRepo.findById.mockResolvedValue(draft);
    formRepo.updateWithVersionCheck.mockResolvedValue(true);
    versionRepo.findLatestVersionNumber.mockResolvedValue(0);
    versionRepo.save.mockResolvedValue();
    useCase = new PublishFormUseCase(formRepo, versionRepo);
  });

  it('snapshots the draft as version 1 on first publish and mints a share token', async () => {
    const result = await useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.BUSINESS_OWNER,
      formId: 'f1',
      expectedVersion: 2,
    });

    expect(versionRepo.save).toHaveBeenCalledTimes(1);
    const savedVersion = versionRepo.save.mock.calls[0][0] as FormVersion;
    expect(savedVersion.versionNumber).toBe(1);
    expect(savedVersion.document).toBe(draft.layout);

    expect(result.form.status).toBe(FormStatus.PUBLISHED);
    expect(result.form.publishedVersionId).toBe(savedVersion.id);
    expect(result.form.shareToken).toEqual(expect.any(String));
    expect(result.form.shareToken!.length).toBeGreaterThan(20);
    expect(result.version).toBe(savedVersion);
  });

  it('publishes at latest+1 and keeps the existing share token on a second publish', async () => {
    const alreadyPublished = draft.publish({ versionId: 'v1', shareToken: 'existing-token' });
    formRepo.findById.mockResolvedValue(alreadyPublished);
    versionRepo.findLatestVersionNumber.mockResolvedValue(1);

    const result = await useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.BUSINESS_OWNER,
      formId: 'f1',
      expectedVersion: alreadyPublished.version,
    });

    const savedVersion = versionRepo.save.mock.calls[0][0] as FormVersion;
    expect(savedVersion.versionNumber).toBe(2);
    expect(result.form.shareToken).toBe('existing-token');
  });

  it('404s a form that does not exist', async () => {
    formRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ tenantId: 't1', requestingUserRole: UserRole.BUSINESS_OWNER, formId: 'gone', expectedVersion: 1 })
    ).rejects.toThrow('Form not found');
    expect(versionRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a staff member', async () => {
    await expect(
      useCase.execute({ tenantId: 't1', requestingUserRole: UserRole.STAFF, formId: 'f1', expectedVersion: 2 })
    ).rejects.toThrow('Only Business Owners can publish');
    expect(versionRepo.save).not.toHaveBeenCalled();
  });

  it('reports a conflict rather than publishing a stale draft', async () => {
    formRepo.updateWithVersionCheck.mockResolvedValue(false);
    await expect(
      useCase.execute({ tenantId: 't1', requestingUserRole: UserRole.BUSINESS_OWNER, formId: 'f1', expectedVersion: 2 })
    ).rejects.toThrow(FormVersionConflictError);
    // The version snapshot was already written by the time the compare-and-set
    // is discovered to have lost the race — this is an accepted, documented
    // trade-off (see the use case's own comment), not re-tested here as a bug.
  });
});
