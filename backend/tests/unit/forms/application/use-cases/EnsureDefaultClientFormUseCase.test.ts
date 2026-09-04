import { EnsureDefaultClientFormUseCase, DEFAULT_FORM_NAME } from '../../../../../src/forms/application/use-cases/EnsureDefaultClientFormUseCase';
import { IClientFormRepository } from '../../../../../src/forms/domain/repositories/IClientFormRepository';
import { ICustomFieldDefinitionRepository } from '../../../../../src/clients/domain/repositories/ICustomFieldDefinitionRepository';
import { ClientForm } from '../../../../../src/forms/domain/entities/ClientForm';
import { FormStatus } from '../../../../../src/forms/domain/enums/FormStatus';
import { FormItemKind } from '../../../../../src/forms/domain/enums/FormItemKind';
import { CustomFieldDefinition } from '../../../../../src/clients/domain/entities/CustomFieldDefinition';
import { FormDocumentValidator } from '../../../../../src/forms/domain/services/FormDocumentValidator';
import { FieldType } from '../../../../../src/clients/domain/enums/FieldType';

const def = (id: string, fieldName: string, order: number) =>
  CustomFieldDefinition.create({
    id,
    tenantId: 't1',
    fieldName,
    fieldType: FieldType.TEXT,
    order,
  });

describe('EnsureDefaultClientFormUseCase', () => {
  let formRepo: jest.Mocked<IClientFormRepository>;
  let customFieldRepo: jest.Mocked<ICustomFieldDefinitionRepository>;
  let useCase: EnsureDefaultClientFormUseCase;

  beforeEach(() => {
    formRepo = {
      findByTenantId: jest.fn(),
      findById: jest.fn(),
      findByShareToken: jest.fn(),
      findDefault: jest.fn(),
      save: jest.fn(),
      updateWithVersionCheck: jest.fn(),
      hasSeededDefaultForm: jest.fn(),
      markDefaultFormSeeded: jest.fn(),
      softDelete: jest.fn(),
    };
    customFieldRepo = {
      findByTenantId: jest.fn(),
      findById: jest.fn(),
      findByTenantIdAndRole: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
      hasSeededDefaults: jest.fn(),
      markDefaultsSeeded: jest.fn(),
    };
    useCase = new EnsureDefaultClientFormUseCase(formRepo, customFieldRepo);
  });

  it('builds a published default form from the tenant fields, in order', async () => {
    formRepo.hasSeededDefaultForm.mockResolvedValue(false);
    formRepo.findDefault.mockResolvedValueOnce(null);
    customFieldRepo.findByTenantId.mockResolvedValue([
      def('f2', 'Email', 1),
      def('f1', 'Name', 0),
    ]);
    formRepo.save.mockResolvedValue();
    formRepo.findDefault.mockResolvedValueOnce(null);

    await useCase.execute('t1');

    const saved: ClientForm = formRepo.save.mock.calls[0][0];
    expect(saved.name).toBe(DEFAULT_FORM_NAME);
    expect(saved.isDefault).toBe(true);
    // PUBLISHED, not DRAFT — this form IS the client create page from the
    // moment it exists, so a draft would block adding clients entirely.
    expect(saved.status).toBe(FormStatus.PUBLISHED);
    expect(saved.layout.pages).toHaveLength(1);
    expect(saved.layout.pages[0].sections).toHaveLength(1);
    // Every seeded field carries a clientFieldId binding back to the
    // definition it was seeded from — that binding is what keeps the default
    // intake form writing to the Client record.
    expect(
      saved.layout.pages[0].sections[0].elements.map((i: any) => i.field?.clientFieldId)
    ).toEqual(['f1', 'f2']);
    expect(
      saved.layout.pages[0].sections[0].elements.every((i) => i.field !== undefined)
    ).toBe(true);
    // Every element gets real, distinct on-canvas geometry — not the v1
    // grid's implicit ordering.
    for (const el of saved.layout.pages[0].sections[0].elements as any[]) {
      expect(Number.isFinite(el.x)).toBe(true);
      expect(Number.isFinite(el.y)).toBe(true);
      expect(el.width).toBeGreaterThan(0);
      expect(el.height).toBeGreaterThan(0);
    }
    expect(saved.layout.page.width).toBeGreaterThan(0);
    expect(saved.layout.page.height).toBeGreaterThan(0);
    expect(formRepo.markDefaultFormSeeded).toHaveBeenCalledWith('t1');
  });

  /*
   * The whole point of the stamp: without it, a form the owner deleted would
   * reappear on the next page load, exactly as deleted default FIELDS used to.
   */
  it('does not rebuild the form once the tenant has been stamped', async () => {
    formRepo.hasSeededDefaultForm.mockResolvedValue(true);
    formRepo.findDefault.mockResolvedValue(null);

    const result = await useCase.execute('t1');

    expect(result).toBeNull();
    expect(formRepo.save).not.toHaveBeenCalled();
    expect(formRepo.markDefaultFormSeeded).not.toHaveBeenCalled();
  });

  it('stamps without rebuilding when a default form already exists unstamped', async () => {
    const existing = ClientForm.create({ id: 'cf1', tenantId: 't1', name: 'Mine', isDefault: true });
    formRepo.hasSeededDefaultForm.mockResolvedValue(false);
    formRepo.findDefault.mockResolvedValue(existing);

    const result = await useCase.execute('t1');

    expect(result).toBe(existing);
    expect(formRepo.save).not.toHaveBeenCalled();
    expect(formRepo.markDefaultFormSeeded).toHaveBeenCalledWith('t1');
  });

  it('still stamps and re-reads when a concurrent request won the race', async () => {
    const winner = ClientForm.create({ id: 'cf1', tenantId: 't1', name: DEFAULT_FORM_NAME, isDefault: true });
    formRepo.hasSeededDefaultForm.mockResolvedValue(false);
    formRepo.findDefault.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    customFieldRepo.findByTenantId.mockResolvedValue([def('f1', 'Name', 0)]);
    formRepo.save.mockRejectedValue(new Error('Unique constraint failed'));

    await expect(useCase.execute('t1')).resolves.toBe(winner);
    expect(formRepo.markDefaultFormSeeded).toHaveBeenCalledWith('t1');
  });

  it('seeds an empty section for a tenant with no fields yet', async () => {
    formRepo.hasSeededDefaultForm.mockResolvedValue(false);
    formRepo.findDefault.mockResolvedValue(null);
    customFieldRepo.findByTenantId.mockResolvedValue([]);

    await useCase.execute('t1');

    const saved: ClientForm = formRepo.save.mock.calls[0][0];
    expect(saved.layout.pages[0].sections[0].elements).toEqual([]);
  });


  it('never seeds a section wider than the page usable width', async () => {
    formRepo.hasSeededDefaultForm.mockResolvedValue(false);
    formRepo.findDefault.mockResolvedValue(null);
    customFieldRepo.findByTenantId.mockResolvedValue([
      def('f1', 'Field 1', 1), def('f2', 'Field 2', 2), def('f3', 'Field 3', 3),
      def('f4', 'Field 4', 4), def('f5', 'Field 5', 5),
    ]);

    await useCase.execute('t1');

    const saved: ClientForm = formRepo.save.mock.calls[0][0];
    const section = saved.layout.pages[0].sections[0];
    const usableWidth = saved.layout.page.width - saved.layout.page.margin.left - saved.layout.page.margin.right;

    expect(section.width).toBeLessThanOrEqual(usableWidth);
    expect(section.x + section.width).toBeLessThanOrEqual(saved.layout.page.width - saved.layout.page.margin.right);
    for (const el of section.elements as any[]) {
      expect(el.x + el.width).toBeLessThanOrEqual(section.width);
    }
  });

  it('produces a document the save-time validator accepts', async () => {
    formRepo.hasSeededDefaultForm.mockResolvedValue(false);
    formRepo.findDefault.mockResolvedValue(null);
    customFieldRepo.findByTenantId.mockResolvedValue([
      def('f1', 'Field 1', 1), def('f2', 'Field 2', 2), def('f3', 'Field 3', 3),
      def('f4', 'Field 4', 4), def('f5', 'Field 5', 5), def('f6', 'Field 6', 6), def('f7', 'Field 7', 7),
    ]);

    await useCase.execute('t1');

    const saved: ClientForm = formRepo.save.mock.calls[0][0];
    expect(() => FormDocumentValidator.validate(saved.layout, [])).not.toThrow();
  });
});

/*
 * Found by running a fresh tenant through the real app (browser + live API):
 * the seeded section was 848px wide against an A4 usable width of 698px —
 * unsaveable the moment autosave tried to persist it, on the very first form
 * a brand new tenant ever sees. clampSectionToUsableArea already fixes this
 * for MIGRATED (v1/v2) documents; the seeder needs the same discipline for a
 * freshly-built v3 one.
 */
