import { ImportCustomFieldsUseCase } from '../../../../../src/clients/application/use-cases/ImportCustomFieldsUseCase';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';
import { UserRole } from '../../../../../src/auth/domain/enums/UserRole';
import { ParsedSheet } from '../../../../../src/clients/infrastructure/excel/sheet';

describe('ImportCustomFieldsUseCase', () => {
  const tenantId = 'tenant-1';
  let repo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let useCase: ImportCustomFieldsUseCase;

  const sheetOf = (rows: Record<string, string>[]): ParsedSheet => ({
    headers: ['fieldName', 'fieldType', 'options'],
    rows,
  });

  beforeEach(() => {
    repo = {
      findByTenantId: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new ImportCustomFieldsUseCase(repo);
  });

  it('rejects non-owners', async () => {
    await expect(
      useCase.execute({ tenantId, requestingUserRole: UserRole.STAFF, sheet: sheetOf([]) })
    ).rejects.toThrow('Only Business Owners can define custom fields');
  });

  it('creates valid rows and reports the invalid one without aborting', async () => {
    const result = await useCase.execute({
      tenantId,
      requestingUserRole: UserRole.BUSINESS_OWNER,
      sheet: sheetOf([
        { fieldName: 'Company Size', fieldType: 'ALPHANUMERIC', options: '' },
        { fieldName: 'Industry', fieldType: 'SINGLE_SELECT', options: 'Retail; Services' },
        { fieldName: 'Bad!Name', fieldType: 'TEXT', options: '' },
      ]),
    });

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(4); // header row + 1-based indexing
    expect(repo.save).toHaveBeenCalledTimes(2);

    const industry = repo.save.mock.calls[1]![1] as CustomFieldDefinition;
    expect(industry.fieldType).toBe(FieldType.SINGLE_SELECT);
    expect(industry.options).toEqual(['Retail', 'Services']);
  });

  it('accepts lower-case and spaced type names', async () => {
    const result = await useCase.execute({
      tenantId,
      requestingUserRole: UserRole.BUSINESS_OWNER,
      sheet: sheetOf([{ fieldName: 'Industry', fieldType: 'single select', options: 'Retail' }]),
    });

    expect(result.created).toBe(1);
    expect((repo.save.mock.calls[0]![1] as CustomFieldDefinition).fieldType)
      .toBe(FieldType.SINGLE_SELECT);
  });

  // save() writes with create(), so re-importing a name would raise P2002.
  it('skips names that already exist for the tenant', async () => {
    repo.findByTenantId.mockResolvedValue([
      CustomFieldDefinition.create({
        id: 'f1', tenantId, fieldName: 'Company Size', fieldType: FieldType.TEXT,
      }),
    ]);

    const result = await useCase.execute({
      tenantId,
      requestingUserRole: UserRole.BUSINESS_OWNER,
      sheet: sheetOf([{ fieldName: 'company size', fieldType: 'TEXT', options: '' }]),
    });

    expect(result).toEqual({ created: 0, skipped: 1, errors: [] });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('skips a name duplicated within the same file', async () => {
    const result = await useCase.execute({
      tenantId,
      requestingUserRole: UserRole.BUSINESS_OWNER,
      sheet: sheetOf([
        { fieldName: 'Region', fieldType: 'TEXT', options: '' },
        { fieldName: 'Region', fieldType: 'TEXT', options: '' },
      ]),
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('reports SINGLE_SELECT rows that carry no options', async () => {
    const result = await useCase.execute({
      tenantId,
      requestingUserRole: UserRole.BUSINESS_OWNER,
      sheet: sheetOf([{ fieldName: 'Industry', fieldType: 'SINGLE_SELECT', options: '' }]),
    });

    expect(result.created).toBe(0);
    expect(result.errors[0]!.message).toContain('Options are required');
  });
});
