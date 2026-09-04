import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ICustomFieldDefinitionRepository } from '../../../clients/domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../../clients/domain/entities/CustomFieldDefinition';
import { ClientForm } from '../../domain/entities/ClientForm';
import { formFieldTypeFor, defaultComponentTypeFor } from '../../domain/services/ClientFieldTypeMapping';
import { ComponentType } from '../../domain/enums/ComponentType';
import { FormFieldType } from '../../domain/enums/FormFieldType';
import {
  FieldKeyGenerator,
  FormDocument,
  FormElement,
  FormSection,
  FormPage,
  DocumentPage,
  fieldSpecsOf,
  usablePageWidth,
  usablePageHeight,
} from '../../domain/value-objects/FormDocument';
import { EnsureDefaultClientFormUseCase } from './EnsureDefaultClientFormUseCase';

export const UNPLACED_SECTION_ID = 'unplaced';
export const UNPLACED_SECTION_TITLE = 'Not yet placed';
export const UNPLACED_PAGE_ID = 'unplaced-page';

const UNPLACED_PADDING = 16;
const UNPLACED_ROW_HEIGHT = 76;
const UNPLACED_COLUMNS = 2;

/**
 * A form plus everything needed to render it, so the frontend never has to
 * cross-reference two responses to draw one field.
 */
export interface ClientFormView {
  form: ClientForm;
  layout: FormDocument;
  definitions: CustomFieldDefinition[];
  /**
   * Definitions that exist but are bound by no field on the layout.
   * Non-empty only on the default form — see below. The builder shows these
   * as a banner.
   */
  unplacedFieldIds: string[];
}

/**
 * Reads one form and reconciles its stored document against the tenant's
 * live field definitions.
 *
 * Three reconciliations happen here, all of which exist because a
 * `field.clientFieldId` binding is not a foreign key — the document is a Json
 * blob with no referential integrity into CustomFieldDefinition:
 *
 * 1. A DANGLING BINDING IS CLEARED, NOT DROPPED. Per the "form-owned fields
 *    with an optional client binding" decision, a component whose
 *    `clientFieldId` no longer resolves stays on the form as a plain,
 *    unbound field — it keeps collecting a value into FormSubmission.data,
 *    it just stops writing to the Client record. This is a deliberate
 *    reversal of v2 behaviour (which dropped the element outright), forced
 *    by the fact that a v3 field has its own identity independent of the
 *    definition it happens to point at.
 *
 * 2. A LIVE BINDING IS HYDRATED. `dataType`, `required` and `options` are
 *    authoritative on the CustomFieldDefinition — Client.create is what
 *    actually enforces them — so every read refreshes those three from the
 *    live definition for any field whose `clientFieldId` still resolves.
 *    `label` and every visual property are NOT touched here: the form
 *    genuinely owns its own label once bound (§11 — a form can present a
 *    field differently from the tenant's dictionary), so a later rename in
 *    the Fields tab does not retroactively relabel every form using that
 *    field. This is intentional and differs from v2, which always fell back
 *    to `definition.fieldName` for an unlabelled element.
 *
 * 3. UNPLACED FIELDS ARE RESCUED — on the default form only. A definition
 *    created outside the builder (the Fields tab, or the Excel importer)
 *    belongs to no document. Without this, those fields would be invisible
 *    everywhere and bulk field import would silently stop working. They are
 *    appended as a synthetic TRAILING PAGE (id `unplaced-page`) rather than
 *    grown into an existing page — v3 pages are fixed A4 size, so unlike v2
 *    (which could grow the page to fit), rescued content gets a whole page
 *    of its own. Restricted to the default form for the same reason v2
 *    restricted it: a secondary form is a deliberately narrow view.
 *
 * `ClientForm.layout` (via PrismaClientFormRepository) is always already v3
 * by the time it reaches this use case — the migration boundary lives at the
 * repository, not here.
 */
export class GetClientFormUseCase {
  constructor(
    private formRepo: IClientFormRepository,
    private customFieldRepo: ICustomFieldDefinitionRepository,
    private ensureDefaultForm: EnsureDefaultClientFormUseCase
  ) {}

  async execute(tenantId: string, formId: string): Promise<ClientFormView | null> {
    const form = await this.formRepo.findById(tenantId, formId);
    if (!form) return null;
    return this.buildView(tenantId, form);
  }

  /** The form the internal client create/edit page renders. */
  async executeDefault(tenantId: string): Promise<ClientFormView | null> {
    const form = await this.ensureDefaultForm.execute(tenantId);
    if (!form) return null;
    return this.buildView(tenantId, form);
  }

  private async buildView(tenantId: string, form: ClientForm): Promise<ClientFormView> {
    const definitions = await this.customFieldRepo.findByTenantId(tenantId);
    const byId = new Map(definitions.map((d) => [d.id, d]));

    const pages: DocumentPage[] = form.layout.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        elements: section.elements.map((el) => this.reconcileElement(el, byId)),
      })),
    }));

    const boundIds = new Set(
      pages
        .flatMap((p) => p.sections)
        .flatMap((s) => s.elements)
        .map((el) => el.field?.clientFieldId)
        .filter((id): id is string => Boolean(id))
    );
    const unplaced = definitions.filter((d) => !boundIds.has(d.id));

    if (form.isDefault && unplaced.length > 0) {
      pages.push(
        this.unplacedRescuePage(
          unplaced,
          form.layout.page,
          fieldSpecsOf({ ...form.layout, pages }).map((f) => f.key)
        )
      );
    }

    return {
      form,
      layout: { ...form.layout, pages },
      definitions,
      unplacedFieldIds: form.isDefault ? unplaced.map((d) => d.id) : [],
    };
  }

  private reconcileElement(element: FormElement, byId: Map<string, CustomFieldDefinition>): FormElement {
    if (!element.field?.clientFieldId) return element;

    const definition = byId.get(element.field.clientFieldId);
    if (!definition) {
      // Dangling binding: clear it, keep the field (decision #1 above).
      const unbound = { ...element.field, clientFieldId: undefined };

      /*
       * One exception, and it exists to stop an existing form becoming
       * unsaveable through no fault of the owner.
       *
       * A choice field's options are hydrated on read from its bound
       * definition — a migrated v2 checkbox carries dataType MULTI_SELECT and
       * no options of its own, because migration is pure and cannot read
       * definitions. Once the binding dangles there is nothing left to
       * hydrate from, and FormDocumentValidator rightly refuses to save a
       * choice field with no options. Rather than hand the owner a form they
       * cannot save and cannot diagnose, demote it to a plain text field:
       * the KEY survives, so submissions already stored under it stay
       * meaningful, and the owner can convert it back and re-enter the
       * options if they want to.
       */
      const isChoice =
        unbound.dataType === FormFieldType.SINGLE_SELECT ||
        unbound.dataType === FormFieldType.MULTI_SELECT;

      if (isChoice && (unbound.options?.length ?? 0) === 0) {
        return {
          ...element,
          type: ComponentType.INPUT,
          field: { ...unbound, dataType: FormFieldType.TEXT, options: undefined },
        };
      }

      return { ...element, field: unbound };
    }

    // Live binding: hydrate dataType/required/options only (decision #2 above).
    return {
      ...element,
      field: {
        ...element.field,
        dataType: formFieldTypeFor(definition.fieldType),
        required: definition.required,
        options: definition.options?.map((value) => ({ value, label: value })),
      },
    };
  }

  private unplacedRescuePage(
    unplaced: CustomFieldDefinition[],
    page: FormPage,
    usedKeys: Iterable<string>
  ): DocumentPage {
    // Seeded with the keys already in the document so a rescued field can
    // never collide with one the owner has already placed.
    const keyGen = new FieldKeyGenerator(usedKeys);

    /*
     * Sized against the page's own usable area, not fixed pixels. The first
     * cut hard-coded 400px columns, giving an 848px-wide section on a page
     * whose usable width is 698 — it rendered clipped, and would have been
     * refused outright had it ever been saved. A read-model artefact still
     * has to obey the same geometry as everything else on the page.
     */
    const sectionWidth = Math.min(usablePageWidth(page), page.width - page.margin.left * 2);
    const columnWidth = Math.floor(
      (sectionWidth - UNPLACED_PADDING * (UNPLACED_COLUMNS + 1)) / UNPLACED_COLUMNS
    );
    const rows = Math.ceil(unplaced.length / UNPLACED_COLUMNS);
    const sectionHeight = Math.min(
      usablePageHeight(page),
      UNPLACED_PADDING * 2 + rows * UNPLACED_ROW_HEIGHT
    );

    const elements: FormElement[] = unplaced.map((definition, index) => ({
      id: `${UNPLACED_SECTION_ID}-${definition.id}`,
      type: defaultComponentTypeFor(definition.fieldType),
      x: UNPLACED_PADDING + (index % UNPLACED_COLUMNS) * (columnWidth + UNPLACED_PADDING),
      y: UNPLACED_PADDING + Math.floor(index / UNPLACED_COLUMNS) * UNPLACED_ROW_HEIGHT,
      width: columnWidth,
      height: UNPLACED_ROW_HEIGHT - 16,
      field: {
        key: keyGen.generate(definition.fieldName, definition.id),
        label: definition.fieldName,
        dataType: formFieldTypeFor(definition.fieldType),
        required: definition.required,
        options: definition.options?.map((value) => ({ value, label: value })),
        clientFieldId: definition.id,
      },
    }));

    const section: FormSection = {
      id: UNPLACED_SECTION_ID,
      title: UNPLACED_SECTION_TITLE,
      x: page.margin.left,
      y: page.margin.top,
      width: sectionWidth,
      height: sectionHeight,
      elements,
    };

    return { id: UNPLACED_PAGE_ID, sections: [section] };
  }
}
