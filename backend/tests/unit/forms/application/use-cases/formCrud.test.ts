import { GetClientFormsUseCase } from '../../../../../src/forms/application/use-cases/GetClientFormsUseCase';
import { ListSubmissionsUseCase } from '../../../../../src/forms/application/use-cases/ListSubmissionsUseCase';
import { GetSubmissionUseCase } from '../../../../../src/forms/application/use-cases/GetSubmissionUseCase';
import { IFormSubmissionRepository } from '../../../../../src/forms/domain/repositories/IFormSubmissionRepository';
import { FormSubmission } from '../../../../../src/forms/domain/entities/FormSubmission';
import { ListFormVersionsUseCase } from '../../../../../src/forms/application/use-cases/ListFormVersionsUseCase';
import { GetFormVersionUseCase } from '../../../../../src/forms/application/use-cases/GetFormVersionUseCase';
import { IFormVersionRepository } from '../../../../../src/forms/domain/repositories/IFormVersionRepository';
import { FormVersion } from '../../../../../src/forms/domain/entities/FormVersion';
import { emptyDocument } from '../../../../../src/forms/domain/value-objects/FormDocument';
import { CreateClientFormUseCase } from '../../../../../src/forms/application/use-cases/CreateClientFormUseCase';
import { UpdateClientFormSettingsUseCase } from '../../../../../src/forms/application/use-cases/UpdateClientFormSettingsUseCase';
import { DuplicateClientFormUseCase } from '../../../../../src/forms/application/use-cases/DuplicateClientFormUseCase';
import { DeleteClientFormUseCase } from '../../../../../src/forms/application/use-cases/DeleteClientFormUseCase';
import { FormVersionConflictError } from '../../../../../src/forms/application/use-cases/UpdateClientFormLayoutUseCase';
import { IClientFormRepository } from '../../../../../src/forms/domain/repositories/IClientFormRepository';
import { ClientForm } from '../../../../../src/forms/domain/entities/ClientForm';
import { FormStatus } from '../../../../../src/forms/domain/enums/FormStatus';
import { UserRole } from '../../../../../src/auth/domain/enums/UserRole';
import { emptyPageGeometry } from '../../../../../src/forms/domain/value-objects/FormDocument';

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

describe('ListFormVersionsUseCase', () => {
  it('lists a form\'s versions newest first, straight from the repository', async () => {
    const versionRepo = mockVersionRepo();
    const versions = [
      FormVersion.create({ id: 'v2', tenantId: 't1', formId: 'f1', versionNumber: 2, document: emptyDocument() }),
      FormVersion.create({ id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1, document: emptyDocument() }),
    ];
    versionRepo.listByForm.mockResolvedValue(versions);

    const result = await new ListFormVersionsUseCase(versionRepo).execute('t1', 'f1');
    expect(result).toBe(versions);
    expect(versionRepo.listByForm).toHaveBeenCalledWith('t1', 'f1');
  });
});

describe('GetFormVersionUseCase', () => {
  it('reads one version by number', async () => {
    const versionRepo = mockVersionRepo();
    const version = FormVersion.create({ id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1, document: emptyDocument() });
    versionRepo.findByFormAndVersionNumber.mockResolvedValue(version);

    const result = await new GetFormVersionUseCase(versionRepo).execute('t1', 'f1', 1);
    expect(result).toBe(version);
    expect(versionRepo.findByFormAndVersionNumber).toHaveBeenCalledWith('t1', 'f1', 1);
  });

  it('returns null for a version that does not exist', async () => {
    const versionRepo = mockVersionRepo();
    versionRepo.findByFormAndVersionNumber.mockResolvedValue(null);
    const result = await new GetFormVersionUseCase(versionRepo).execute('t1', 'f1', 99);
    expect(result).toBeNull();
  });
});

const mockSubmissionRepo = (): jest.Mocked<IFormSubmissionRepository> => ({
  save: jest.fn(),
  findById: jest.fn(),
  listByForm: jest.fn(),
});

describe('ListSubmissionsUseCase', () => {
  it('lists a form\'s submissions straight from the repository', async () => {
    const submissionRepo = mockSubmissionRepo();
    const submissions = [
      FormSubmission.create({ id: 's1', tenantId: 't1', formId: 'f1', formVersionId: 'v1', data: {} }),
    ];
    submissionRepo.listByForm.mockResolvedValue(submissions);

    const result = await new ListSubmissionsUseCase(submissionRepo).execute('t1', UserRole.BUSINESS_OWNER, 'f1');
    expect(result).toBe(submissions);
    expect(submissionRepo.listByForm).toHaveBeenCalledWith('t1', 'f1');
  });

  it('refuses a staff member', async () => {
    const submissionRepo = mockSubmissionRepo();
    await expect(
      new ListSubmissionsUseCase(submissionRepo).execute('t1', UserRole.STAFF, 'f1')
    ).rejects.toThrow('Only Business Owners can view form submissions');
  });
});

describe('GetSubmissionUseCase', () => {
  it('reads a submission alongside the exact version it was filled against', async () => {
    const submissionRepo = mockSubmissionRepo();
    const versionRepo = mockVersionRepo();
    const submission = FormSubmission.create({ id: 's1', tenantId: 't1', formId: 'f1', formVersionId: 'v1', data: { a: 1 } });
    const version = FormVersion.create({ id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1, document: emptyDocument() });
    submissionRepo.findById.mockResolvedValue(submission);
    versionRepo.findById.mockResolvedValue(version);

    const result = await new GetSubmissionUseCase(submissionRepo, versionRepo).execute('t1', UserRole.BUSINESS_OWNER, 'f1', 's1');
    expect(result).toEqual({ submission, version });
  });

  it('returns null when the submission belongs to a different form', async () => {
    const submissionRepo = mockSubmissionRepo();
    const versionRepo = mockVersionRepo();
    const submission = FormSubmission.create({ id: 's1', tenantId: 't1', formId: 'other-form', formVersionId: 'v1', data: {} });
    submissionRepo.findById.mockResolvedValue(submission);

    const result = await new GetSubmissionUseCase(submissionRepo, versionRepo).execute('t1', UserRole.BUSINESS_OWNER, 'f1', 's1');
    expect(result).toBeNull();
  });

  it('returns null when the submission does not exist', async () => {
    const submissionRepo = mockSubmissionRepo();
    const versionRepo = mockVersionRepo();
    submissionRepo.findById.mockResolvedValue(null);

    const result = await new GetSubmissionUseCase(submissionRepo, versionRepo).execute('t1', UserRole.BUSINESS_OWNER, 'f1', 'gone');
    expect(result).toBeNull();
  });

  it('refuses a staff member', async () => {
    const submissionRepo = mockSubmissionRepo();
    const versionRepo = mockVersionRepo();
    await expect(
      new GetSubmissionUseCase(submissionRepo, versionRepo).execute('t1', UserRole.STAFF, 'f1', 's1')
    ).rejects.toThrow('Only Business Owners can view form submissions');
  });
});

describe('GetClientFormsUseCase', () => {
  it('lists the tenant forms', async () => {
    const formRepo = mockFormRepo();
    const forms = [ClientForm.create({ id: 'f1', tenantId: 't1', name: 'A' })];
    formRepo.findByTenantId.mockResolvedValue(forms);

    const result = await new GetClientFormsUseCase(formRepo).execute('t1');
    expect(result).toBe(forms);
    expect(formRepo.findByTenantId).toHaveBeenCalledWith('t1');
  });
});

describe('CreateClientFormUseCase', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let useCase: CreateClientFormUseCase;

  beforeEach(() => {
    formRepo = mockFormRepo();
    formRepo.save.mockResolvedValue();
    useCase = new CreateClientFormUseCase(formRepo);
  });

  it('creates a blank draft form', async () => {
    const form = await useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.BUSINESS_OWNER,
      name: 'Occupational Health Intake',
    });

    expect(form.name).toBe('Occupational Health Intake');
    expect(form.isDefault).toBe(false);
    expect(form.layout.pages).toHaveLength(1);
    expect(form.layout.pages[0].sections).toEqual([]);
    expect(formRepo.save).toHaveBeenCalledTimes(1);
  });

  it('refuses a staff member', async () => {
    await expect(
      useCase.execute({ tenantId: 't1', requestingUserRole: UserRole.STAFF, name: 'X' })
    ).rejects.toThrow('Only Business Owners can create client forms');
    expect(formRepo.save).not.toHaveBeenCalled();
  });

  it('turns a duplicate-name constraint violation into a readable error', async () => {
    formRepo.save.mockRejectedValue(new Error('Unique constraint failed on the fields: (`tenantId`,`name`)'));

    await expect(
      useCase.execute({ tenantId: 't1', requestingUserRole: UserRole.BUSINESS_OWNER, name: 'Taken' })
    ).rejects.toThrow('A form named "Taken" already exists.');
  });
});

describe('DuplicateClientFormUseCase', () => {
  it('copies the layout under a new name, never copying isDefault', async () => {
    const formRepo = mockFormRepo();
    const source = ClientForm.create({
      id: 'f1',
      tenantId: 't1',
      name: 'Original',
      isDefault: true,
      layout: {
        version: 3,
        page: emptyPageGeometry(),
        pages: [{ id: 'p1', sections: [{ id: 's1', title: 'S', x: 0, y: 0, width: 100, height: 100, elements: [] }] }],
      },
    });
    formRepo.findById.mockResolvedValue(source);
    formRepo.save.mockResolvedValue();

    const copy = await new DuplicateClientFormUseCase(formRepo).execute(
      't1',
      UserRole.BUSINESS_OWNER,
      'f1',
      'Copy of Original'
    );

    expect(copy.name).toBe('Copy of Original');
    expect(copy.isDefault).toBe(false);
    expect(copy.layout.pages).toEqual(source.layout.pages);
    expect(copy.id).not.toBe(source.id);
  });

  it('404s a form that does not exist', async () => {
    const formRepo = mockFormRepo();
    formRepo.findById.mockResolvedValue(null);
    await expect(
      new DuplicateClientFormUseCase(formRepo).execute('t1', UserRole.BUSINESS_OWNER, 'gone', 'X')
    ).rejects.toThrow('Form not found');
  });
});

describe('DeleteClientFormUseCase', () => {
  it('soft-deletes a non-default form', async () => {
    const formRepo = mockFormRepo();
    formRepo.findById.mockResolvedValue(
      ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Extra', isDefault: false })
    );

    await new DeleteClientFormUseCase(formRepo).execute('t1', UserRole.BUSINESS_OWNER, 'f1');
    expect(formRepo.softDelete).toHaveBeenCalledWith('t1', 'f1');
  });

  /*
   * Without a client-intake form, `clients/new` has nothing to render — adding
   * a client stops working entirely for the whole tenant.
   */
  it('refuses to delete the only client-intake form', async () => {
    const formRepo = mockFormRepo();
    formRepo.findById.mockResolvedValue(
      ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake', isDefault: true })
    );

    await expect(
      new DeleteClientFormUseCase(formRepo).execute('t1', UserRole.BUSINESS_OWNER, 'f1')
    ).rejects.toThrow('client-intake form');
    expect(formRepo.softDelete).not.toHaveBeenCalled();
  });

  it('refuses a staff member', async () => {
    const formRepo = mockFormRepo();
    await expect(
      new DeleteClientFormUseCase(formRepo).execute('t1', UserRole.STAFF, 'f1')
    ).rejects.toThrow('Only Business Owners can delete client forms');
  });
});

describe('UpdateClientFormSettingsUseCase', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let useCase: UpdateClientFormSettingsUseCase;
  let existing: ClientForm;

  beforeEach(() => {
    formRepo = mockFormRepo();
    existing = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Old Name', version: 2 });
    formRepo.findById.mockResolvedValue(existing);
    formRepo.updateWithVersionCheck.mockResolvedValue(true);
    useCase = new UpdateClientFormSettingsUseCase(formRepo);
  });

  it('renames a form and bumps its version', async () => {
    const result = await useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.BUSINESS_OWNER,
      formId: 'f1',
      expectedVersion: 2,
      name: 'New Name',
    });

    expect(result.name).toBe('New Name');
    expect(result.version).toBe(3);
  });

  it('reports a conflict rather than overwriting a concurrent edit', async () => {
    formRepo.updateWithVersionCheck.mockResolvedValue(false);
    await expect(
      useCase.execute({
        tenantId: 't1',
        requestingUserRole: UserRole.BUSINESS_OWNER,
        formId: 'f1',
        expectedVersion: 2,
        name: 'New Name',
      })
    ).rejects.toThrow(FormVersionConflictError);
  });

  it('refuses to set status to PUBLISHED directly — that has its own endpoint', async () => {
    await expect(
      useCase.execute({
        tenantId: 't1',
        requestingUserRole: UserRole.BUSINESS_OWNER,
        formId: 'f1',
        expectedVersion: 2,
        status: FormStatus.PUBLISHED,
      })
    ).rejects.toThrow('Use the publish action');
    expect(formRepo.updateWithVersionCheck).not.toHaveBeenCalled();
  });

  it('allows re-affirming PUBLISHED on a form that is already published', async () => {
    const published = existing.publish({ versionId: 'v1', shareToken: 'tok' });
    formRepo.findById.mockResolvedValue(published);

    await useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.BUSINESS_OWNER,
      formId: 'f1',
      expectedVersion: published.version,
      status: FormStatus.PUBLISHED,
      name: 'Renamed while published',
    });

    expect(formRepo.updateWithVersionCheck).toHaveBeenCalled();
  });

  it('refuses to unset isDefault with no replacement named', async () => {
    const defaultForm = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake', isDefault: true, version: 2 });
    formRepo.findById.mockResolvedValue(defaultForm);

    await expect(
      useCase.execute({
        tenantId: 't1',
        requestingUserRole: UserRole.BUSINESS_OWNER,
        formId: 'f1',
        expectedVersion: 2,
        isDefault: false,
      })
    ).rejects.toThrow('always needs one client-intake form');
  });

  /*
   * Promoting a new default form must demote whichever form held the role
   * before — otherwise the tenant would end up with two "the" intake forms.
   */
  it('demotes the previous default when promoting a new one', async () => {
    const oldDefault = ClientForm.create({ id: 'f-old', tenantId: 't1', name: 'Old Intake', isDefault: true, version: 5 });
    const candidate = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'New Intake', isDefault: false, version: 2 });
    formRepo.findById.mockResolvedValue(candidate);
    formRepo.findDefault.mockResolvedValue(oldDefault);

    await useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.BUSINESS_OWNER,
      formId: 'f1',
      expectedVersion: 2,
      isDefault: true,
    });

    // Two updateWithVersionCheck calls: demote the old default, promote the new one.
    expect(formRepo.updateWithVersionCheck).toHaveBeenCalledTimes(2);
    const demoteCall = formRepo.updateWithVersionCheck.mock.calls.find(
      (call) => (call[0] as ClientForm).id === 'f-old'
    );
    expect(demoteCall![0].isDefault).toBe(false);
  });

  it('does not touch another form when promoting the form that is already default', async () => {
    const alreadyDefault = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake', isDefault: true, version: 2 });
    formRepo.findById.mockResolvedValue(alreadyDefault);

    await useCase.execute({
      tenantId: 't1',
      requestingUserRole: UserRole.BUSINESS_OWNER,
      formId: 'f1',
      expectedVersion: 2,
      isDefault: true,
    });

    expect(formRepo.findDefault).not.toHaveBeenCalled();
    expect(formRepo.updateWithVersionCheck).toHaveBeenCalledTimes(1);
  });
});
