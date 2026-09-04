import { GetPublicFormUseCase } from '../../../../../src/forms/application/use-cases/GetPublicFormUseCase';
import { IClientFormRepository } from '../../../../../src/forms/domain/repositories/IClientFormRepository';
import { IFormVersionRepository } from '../../../../../src/forms/domain/repositories/IFormVersionRepository';
import { ClientForm } from '../../../../../src/forms/domain/entities/ClientForm';
import { FormVersion } from '../../../../../src/forms/domain/entities/FormVersion';
import { emptyDocument } from '../../../../../src/forms/domain/value-objects/FormDocument';

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

describe('GetPublicFormUseCase', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let versionRepo: jest.Mocked<IFormVersionRepository>;
  let useCase: GetPublicFormUseCase;
  let published: ClientForm;
  let version: FormVersion;

  beforeEach(() => {
    formRepo = mockFormRepo();
    versionRepo = mockVersionRepo();
    useCase = new GetPublicFormUseCase(formRepo, versionRepo);

    const draft = ClientForm.create({ id: 'f1', tenantId: 't1', name: 'Intake' });
    published = draft.publish({ versionId: 'v1', shareToken: 'tok123' });
    version = FormVersion.create({ id: 'v1', tenantId: 't1', formId: 'f1', versionNumber: 1, document: emptyDocument() });

    formRepo.findByShareToken.mockResolvedValue(published);
    versionRepo.findById.mockResolvedValue(version);
  });

  it('resolves a valid token to the published version', async () => {
    const result = await useCase.execute('tok123');
    expect(result).not.toBeNull();
    expect(result!.formId).toBe('f1');
    expect(result!.versionNumber).toBe(1);
    expect(result!.document).toBe(version.document);
  });

  it('returns null for an unknown token', async () => {
    formRepo.findByShareToken.mockResolvedValue(null);
    expect(await useCase.execute('nope')).toBeNull();
  });

  it('returns null for a form that is not published (still a draft)', async () => {
    const draft = ClientForm.create({ id: 'f2', tenantId: 't1', name: 'Draft form' });
    formRepo.findByShareToken.mockResolvedValue(draft);
    expect(await useCase.execute('tok123')).toBeNull();
  });

  it('returns null when the form has stopped accepting responses', async () => {
    const closed = ClientForm.reconstitute({
      ...published,
      settings: { acceptingResponses: false },
    });
    formRepo.findByShareToken.mockResolvedValue(closed);
    expect(await useCase.execute('tok123')).toBeNull();
  });

  it('returns null if the published version row is somehow missing', async () => {
    versionRepo.findById.mockResolvedValue(null);
    expect(await useCase.execute('tok123')).toBeNull();
  });
});
