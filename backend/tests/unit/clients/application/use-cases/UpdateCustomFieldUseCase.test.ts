import { UpdateCustomFieldUseCase } from '../../../../../src/clients/application/use-cases/UpdateCustomFieldUseCase';
import {
  ICustomFieldWriteTransaction,
  CustomFieldWriteRepos,
} from '../../../../../src/clients/application/ports/ICustomFieldWriteTransaction';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { administrator, salesUser } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

/**
 * Runs `work` against the SAME mock repos every time, with no real
 * transaction boundary — good enough to prove UpdateCustomFieldUseCase calls
 * the right repo methods in the right order. The real atomicity guarantee is
 * `PrismaCustomFieldWriteTransaction`'s job and is exercised in the
 * integration suite, not here.
 */
class FakeCustomFieldWriteTransaction implements ICustomFieldWriteTransaction {
  constructor(private repos: CustomFieldWriteRepos) {}
  run<T>(work: (repos: CustomFieldWriteRepos) => Promise<T>): Promise<T> {
    return work(this.repos);
  }
}

describe('UpdateCustomFieldUseCase', () => {
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let clientRepo: jest.Mocked<IClientRepository>;
  let useCase: UpdateCustomFieldUseCase;
  let existing: CustomFieldDefinition;

  beforeEach(() => {
    existing = CustomFieldDefinition.create({
      id: 'f1',
      tenantId: 't1',
      fieldName: 'Industry',
      fieldType: FieldType.TEXT,
    });

    customFieldRepo = {
      findByTenantId: jest.fn(),
      findById: jest.fn().mockResolvedValue(existing),
      findByTenantIdAndRole: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
      hasSeededDefaults: jest.fn(),
      markDefaultsSeeded: jest.fn(),
    };

    clientRepo = {
      findById: jest.fn(),
      search: jest.fn(),
      countByTenant: jest.fn(),
      findRecentByTenant: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      restore: jest.fn(),
      countRelatedRecords: jest.fn(),
      backfillLegacyBasicFields: jest.fn(),
      renameCustomFieldKey: jest.fn(),
    };

    useCase = new UpdateCustomFieldUseCase(
      new FakeCustomFieldWriteTransaction({ customFieldRepo, clientRepo })
    );
  });

  const run = (dto: Partial<Parameters<UpdateCustomFieldUseCase['execute']>[0]> = {}) =>
    useCase.execute({
      tenantId: 't1',
      access: administrator(),
      fieldId: 'f1',
      ...dto,
    });

  it('refuses a non-owner, non-admin caller', async () => {
    await expect(run({ access: salesUser() })).rejects.toThrow(PermissionDeniedError);
    expect(customFieldRepo.update).not.toHaveBeenCalled();
  });

  it('404s a field that does not exist', async () => {
    customFieldRepo.findById.mockResolvedValue(null);
    await expect(run()).rejects.toThrow('Custom field not found');
  });

  it('updates the definition and does not touch client data when the name is unchanged', async () => {
    await run({ required: true });

    expect(customFieldRepo.update).toHaveBeenCalledTimes(1);
    expect(clientRepo.renameCustomFieldKey).not.toHaveBeenCalled();
  });

  /*
   * THE FIX. Renaming a field used to leave every client's stored value under
   * the old JSON key — invisible from that point on. This is the call that
   * makes the rename actually move existing data.
   */
  it('renames the customFieldValues key on every client when fieldName changes', async () => {
    await run({ fieldName: 'Sector' });

    expect(customFieldRepo.update).toHaveBeenCalledTimes(1);
    expect(clientRepo.renameCustomFieldKey).toHaveBeenCalledWith('t1', 'Industry', 'Sector');
  });

  it('does not call rename when the new name equals the old one', async () => {
    await run({ fieldName: 'Industry' });
    expect(clientRepo.renameCustomFieldKey).not.toHaveBeenCalled();
  });

  it('renames the key AFTER the definition is persisted, not before', async () => {
    const order: string[] = [];
    customFieldRepo.update.mockImplementation(async () => {
      order.push('definition');
    });
    clientRepo.renameCustomFieldKey.mockImplementation(async () => {
      order.push('rename');
    });

    await run({ fieldName: 'Sector' });

    expect(order).toEqual(['definition', 'rename']);
  });

  it('rejects a role already held by another field', async () => {
    customFieldRepo.findByTenantIdAndRole.mockResolvedValue(
      CustomFieldDefinition.create({
        id: 'f2',
        tenantId: 't1',
        fieldName: 'Email',
        fieldType: FieldType.EMAIL,
        role: 'PRIMARY_EMAIL' as any,
      })
    );
    await expect(run({ role: 'PRIMARY_EMAIL' as any })).rejects.toThrow(
      '"Email" already has the "PRIMARY_EMAIL" role'
    );
    expect(customFieldRepo.update).not.toHaveBeenCalled();
    expect(clientRepo.renameCustomFieldKey).not.toHaveBeenCalled();
  });
});
