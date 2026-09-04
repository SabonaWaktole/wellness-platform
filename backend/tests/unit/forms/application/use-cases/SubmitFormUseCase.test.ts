import { randomUUID } from 'crypto';
import { SubmitFormUseCase } from '../../../../../src/forms/application/use-cases/SubmitFormUseCase';
import { IClientFormRepository } from '../../../../../src/forms/domain/repositories/IClientFormRepository';
import { IFormVersionRepository } from '../../../../../src/forms/domain/repositories/IFormVersionRepository';
import { IFormSubmissionRepository } from '../../../../../src/forms/domain/repositories/IFormSubmissionRepository';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { IUserRepository } from '../../../../../src/auth/domain/repositories/IUserRepository';
import { CreateClientUseCase } from '../../../../../src/clients/application/use-cases/CreateClientUseCase';
import { ClientForm } from '../../../../../src/forms/domain/entities/ClientForm';
import { FormVersion } from '../../../../../src/forms/domain/entities/FormVersion';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { User } from '../../../../../src/auth/domain/entities/User';
import { UserRole } from '../../../../../src/auth/domain/enums/UserRole';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { ComponentType } from '../../../../../src/forms/domain/enums/ComponentType';
import { FormFieldType } from '../../../../../src/forms/domain/enums/FormFieldType';
import { emptyPageGeometry, type FormDocument } from '../../../../../src/forms/domain/value-objects/FormDocument';

jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomUUID: jest.fn() }));

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

const mockSubmissionRepo = (): jest.Mocked<IFormSubmissionRepository> => ({
  save: jest.fn(),
  findById: jest.fn(),
  listByForm: jest.fn(),
});

const mockCustomFieldRepo = (): jest.Mocked<ICustomFieldDefinitionRepository> => ({
  findByTenantId: jest.fn(),
  findById: jest.fn(),
  findByTenantIdAndRole: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  reorder: jest.fn(),
  hasSeededDefaults: jest.fn(),
  markDefaultsSeeded: jest.fn(),
} as unknown as jest.Mocked<ICustomFieldDefinitionRepository>);

const mockUserRepo = (): jest.Mocked<IUserRepository> => ({
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findAnyByEmail: jest.fn(),
  findSuperAdminByEmail: jest.fn(),
  countActivePlatformAdmins: jest.fn(),
  create: jest.fn(),
  updatePassword: jest.fn(),
  findByTenantId: jest.fn(),
  findActiveByTenantAndRole: jest.fn(),
  updateProfile: jest.fn(),
  updateRoleAndWarehouse: jest.fn(),
  setActive: jest.fn(),
  softDelete: jest.fn(),
  countAssignedWork: jest.fn(),
  findPlatformUsers: jest.fn(),
} as unknown as jest.Mocked<IUserRepository>);

const documentWith = (fields: { key: string; clientFieldId?: string; required?: boolean }[]): FormDocument => ({
  version: 3,
  page: emptyPageGeometry(),
  pages: [
    {
      id: 'p1',
      sections: [
        {
          id: 's1',
          x: 0,
          y: 0,
          width: 400,
          height: 400,
          elements: fields.map((f, i) => ({
            id: `el${i}`,
            type: ComponentType.INPUT,
            x: 0,
            y: i * 60,
            width: 200,
            height: 50,
            field: {
              key: f.key,
              label: f.key,
              dataType: FormFieldType.TEXT,
              required: f.required ?? false,
              clientFieldId: f.clientFieldId,
            },
          })),
        },
      ],
    },
  ],
});

describe('SubmitFormUseCase', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let versionRepo: jest.Mocked<IFormVersionRepository>;
  let submissionRepo: jest.Mocked<IFormSubmissionRepository>;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let createClientUseCase: jest.Mocked<CreateClientUseCase>;
  let useCase: SubmitFormUseCase;
  let published: ClientForm;

  beforeEach(() => {
    jest.mocked(randomUUID).mockReturnValue('sub-1' as any);
    formRepo = mockFormRepo();
    versionRepo = mockVersionRepo();
    submissionRepo = mockSubmissionRepo();
    customFieldRepo = mockCustomFieldRepo();
    userRepo = mockUserRepo();
    createClientUseCase = { execute: jest.fn() } as unknown as jest.Mocked<CreateClientUseCase>;

    const draft = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake' });
    published = draft.publish({ versionId: 'v1', shareToken: 'tok123' });
    formRepo.findByShareToken.mockResolvedValue(published);
    submissionRepo.save.mockResolvedValue();

    useCase = new SubmitFormUseCase(
      formRepo,
      versionRepo,
      submissionRepo,
      customFieldRepo,
      userRepo,
      createClientUseCase
    );
  });

  it('returns not_found for an unknown or unpublished token', async () => {
    formRepo.findByShareToken.mockResolvedValue(null);
    const result = await useCase.execute({ token: 'nope', data: {} });
    expect(result.outcome).toBe('not_found');
  });

  it('rejects a submission that fails field validation, without saving anything', async () => {
    const version = FormVersion.create({
      id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1,
      document: documentWith([{ key: 'email', required: true }]),
    });
    versionRepo.findById.mockResolvedValue(version);

    const result = await useCase.execute({ token: 'tok123', data: {} });
    expect(result.outcome).toBe('invalid');
    if (result.outcome === 'invalid') {
      expect(result.errors).toHaveProperty('email');
    }
    expect(submissionRepo.save).not.toHaveBeenCalled();
  });

  it('saves a valid submission with only the document-defined keys, dropping anything extra', async () => {
    const version = FormVersion.create({
      id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1,
      document: documentWith([{ key: 'comment' }]),
    });
    versionRepo.findById.mockResolvedValue(version);

    const result = await useCase.execute({
      token: 'tok123',
      data: { comment: 'Hello', __proto__: 'ignored', unknownKey: 'x' },
    });

    expect(result.outcome).toBe('submitted');
    expect(submissionRepo.save).toHaveBeenCalledTimes(1);
    const saved = submissionRepo.save.mock.calls[0][0];
    expect(saved.data).toEqual({ comment: 'Hello' });
    expect(saved.formId).toBe('f1');
    expect(saved.formVersionId).toBe('v1');
    expect(saved.source).toBe('PUBLIC_LINK');
    expect(saved.submittedByUserId).toBeNull();
  });

  it('routes bound fields through CreateClientUseCase, keyed by the LIVE definition fieldName', async () => {
    const version = FormVersion.create({
      id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1,
      document: documentWith([{ key: 'full_name', clientFieldId: 'def1' }]),
    });
    versionRepo.findById.mockResolvedValue(version);
    customFieldRepo.findByTenantId.mockResolvedValue([
      CustomFieldDefinition.create({
        id: 'def1', tenantId: 't1', fieldName: 'Name', fieldType: FieldType.TEXT, order: 0,
      }),
    ]);
    userRepo.findActiveByTenantAndRole.mockResolvedValue([
      User.create({ id: 'owner1', tenantId: 't1', email: 'o@x.com', hashedPassword: 'h', role: UserRole.BUSINESS_OWNER, createdAt: new Date() }),
    ]);
    createClientUseCase.execute.mockResolvedValue({ id: 'client1' } as any);

    const result = await useCase.execute({ token: 'tok123', data: { full_name: 'Ada Lovelace' } });

    expect(result.outcome).toBe('submitted');
    expect(createClientUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        authorUserId: 'owner1',
        customFieldValues: { Name: 'Ada Lovelace' },
      })
    );
    const saved = submissionRepo.save.mock.calls[0][0];
    expect(saved.clientId).toBe('client1');
  });

  it('still saves the submission even when client creation throws — the submission is the record of truth', async () => {
    const version = FormVersion.create({
      id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1,
      document: documentWith([{ key: 'full_name', clientFieldId: 'def1' }]),
    });
    versionRepo.findById.mockResolvedValue(version);
    customFieldRepo.findByTenantId.mockResolvedValue([
      CustomFieldDefinition.create({
        id: 'def1', tenantId: 't1', fieldName: 'Name', fieldType: FieldType.TEXT, order: 0,
      }),
    ]);
    userRepo.findActiveByTenantAndRole.mockResolvedValue([
      User.create({ id: 'owner1', tenantId: 't1', email: 'o@x.com', hashedPassword: 'h', role: UserRole.BUSINESS_OWNER, createdAt: new Date() }),
    ]);
    createClientUseCase.execute.mockRejectedValue(new Error('boom'));

    const result = await useCase.execute({ token: 'tok123', data: { full_name: 'Ada' } });

    expect(result.outcome).toBe('submitted');
    expect(submissionRepo.save).toHaveBeenCalledTimes(1);
    expect(submissionRepo.save.mock.calls[0][0].clientId).toBeNull();
  });

  it('skips client creation when no bound field has a value, and when there is no active owner to attribute to', async () => {
    const version = FormVersion.create({
      id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1,
      document: documentWith([{ key: 'full_name', clientFieldId: 'def1' }]),
    });
    versionRepo.findById.mockResolvedValue(version);
    userRepo.findActiveByTenantAndRole.mockResolvedValue([]);

    await useCase.execute({ token: 'tok123', data: { full_name: 'Ada' } });
    expect(createClientUseCase.execute).not.toHaveBeenCalled();
  });
});
