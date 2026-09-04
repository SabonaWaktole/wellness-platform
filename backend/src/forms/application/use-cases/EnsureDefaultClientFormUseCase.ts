import { randomUUID } from 'crypto';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ICustomFieldDefinitionRepository } from '../../../clients/domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../../clients/domain/entities/CustomFieldDefinition';
import { ClientForm } from '../../domain/entities/ClientForm';
import { FormStatus } from '../../domain/enums/FormStatus';
import { formFieldTypeFor, defaultComponentTypeFor } from '../../domain/services/ClientFieldTypeMapping';
import {
  FieldKeyGenerator,
  FormDocument,
  FormElement,
  clampSectionToUsableArea,
  emptyPageGeometry,
  usablePageWidth,
} from '../../domain/value-objects/FormDocument';

export const DEFAULT_FORM_NAME = 'Client Intake';
export const DEFAULT_SECTION_TITLE = 'Client Information';

/**
 * Builds a tenant's starter intake form from the fields they already have.
 *
 * Seeds exactly ONCE per tenant, stamped by Tenant.clientFormSeededAt — the
 * same one-shot design as EnsureDefaultClientFieldsUseCase and for the same
 * reason: "create the default form if the tenant has none" would resurrect a
 * form the owner deliberately deleted on the very next page load.
 *
 * The seeded form is a single section holding every existing definition in
 * `order`, one per row, each bound via `field.clientFieldId` — day one, the
 * builder renders exactly the form the tenant already had, so upgrading
 * changes nothing until the owner starts dragging.
 */
export class EnsureDefaultClientFormUseCase {
  constructor(
    private formRepo: IClientFormRepository,
    private customFieldRepo: ICustomFieldDefinitionRepository
  ) {}

  async execute(tenantId: string): Promise<ClientForm | null> {
    if (await this.formRepo.hasSeededDefaultForm(tenantId)) {
      return this.formRepo.findDefault(tenantId);
    }

    const existingDefault = await this.formRepo.findDefault(tenantId);
    if (existingDefault) {
      await this.formRepo.markDefaultFormSeeded(tenantId);
      return existingDefault;
    }

    const definitions = await this.customFieldRepo.findByTenantId(tenantId);
    const form = ClientForm.create({
      id: randomUUID(),
      tenantId,
      name: DEFAULT_FORM_NAME,
      isDefault: true,
      // PUBLISHED, not DRAFT: this form IS the client create/edit page from the
      // moment it exists. A draft starter form would leave every tenant unable
      // to add a client until an owner happened to open the builder.
      status: FormStatus.PUBLISHED,
      layout: this.documentFor(definitions),
    });

    try {
      await this.formRepo.save(form);
    } catch {
      // Lost a race with a concurrent request seeding the same tenant (the
      // @@unique([tenantId, name]) is what catches it). Whoever won wrote an
      // equivalent form, so fall through to the read below rather than failing
      // the caller's request.
    }

    await this.formRepo.markDefaultFormSeeded(tenantId);
    return this.formRepo.findDefault(tenantId);
  }

  /**
   * A single page, single canvas section holding every existing definition,
   * laid out top-to-bottom two-per-row — the closest a free-positioning
   * canvas has to v1's "one section, 2-column grid" starter.
   *
   * Column width is DERIVED from the page's own usable width, not a fixed
   * 400px. A fixed width produced an 848px section against A4's 698px usable
   * area — caught by running a brand-new tenant through the real app: the
   * seeded form was unsaveable the moment autosave tried to persist it, on
   * the very first form that tenant ever saw. `clampSectionToUsableArea`
   * (the same function migration uses) is still applied afterward as a
   * second line of defense.
   */
  private documentFor(definitions: CustomFieldDefinition[]): FormDocument {
    const page = emptyPageGeometry();
    const sectionPadding = 16;
    const columns = 2;
    const columnWidth = Math.floor((usablePageWidth(page) - sectionPadding * (columns + 1)) / columns);
    const rowHeight = 76;
    const sorted = [...definitions].sort((a, b) => a.order - b.order);
    const keyGen = new FieldKeyGenerator();

    const elements: FormElement[] = sorted.map((definition, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        id: randomUUID(),
        type: defaultComponentTypeFor(definition.fieldType),
        x: sectionPadding + column * (columnWidth + sectionPadding),
        y: sectionPadding + row * rowHeight,
        width: columnWidth,
        height: rowHeight - 16,
        field: {
          // Readable and stable, not the definition's UUID — see
          // FieldKeyGenerator/fieldKeyFromName. Deduped so two definitions
          // that slugify the same cannot collide on one submission key.
          key: keyGen.generate(definition.fieldName, definition.id),
          label: definition.fieldName,
          dataType: formFieldTypeFor(definition.fieldType),
          required: definition.required,
          options: definition.options?.map((value) => ({ value, label: value })),
          clientFieldId: definition.id,
        },
      };
    });

    const rows = Math.ceil(sorted.length / columns);
    const sectionHeight = Math.max(rowHeight, sectionPadding * 2 + rows * rowHeight);
    const sectionWidth = columnWidth * columns + sectionPadding * (columns + 1);

    const section = clampSectionToUsableArea(
      {
        id: randomUUID(),
        title: DEFAULT_SECTION_TITLE,
        x: page.margin.left,
        y: page.margin.top,
        width: sectionWidth,
        height: sectionHeight,
        elements,
      },
      page
    );

    return {
      version: 3,
      page,
      pages: [{ id: randomUUID(), sections: [section] }],
    };
  }
}
