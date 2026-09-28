import { StatusDomain, STATUS_CATALOGUE } from '../../domain/StatusCatalogue';
import { StatusLabel } from '../../domain/StatusLabel';
import { IStatusLabelStore } from '../ports/IStatusLabelStore';

/**
 * A domain's statuses in display order, with the workspace's own label,
 * colour and order where the Administrator has set one, and the catalogue
 * default everywhere else (FR-SET-07, 08). Open to any authenticated tenant
 * user: every list and badge in the app needs these to render.
 */
export class ListStatusLabelsUseCase {
  constructor(private readonly store: IStatusLabelStore) {}

  async execute(input: { tenantId: string; domain: StatusDomain }): Promise<StatusLabel[]> {
    const overrides = new Map((await this.store.list(input.tenantId, input.domain)).map((item) => [item.key, item]));
    // `catalogueIndex` keeps ties (two rows never reordered, or overrides that
    // repeat an order) stable at the code-defined position rather than
    // reshuffling on every read.
    return STATUS_CATALOGUE[input.domain]
      .map((entry, catalogueIndex) => ({
        item: overrides.get(entry.key) ?? { domain: input.domain, key: entry.key, labelSq: entry.labelSq, labelEn: entry.labelEn, colour: entry.colour, order: entry.order },
        catalogueIndex,
      }))
      .sort((a, b) => a.item.order - b.item.order || a.catalogueIndex - b.catalogueIndex)
      .map(({ item }) => item);
  }
}
