import { PrismaClient, Prisma } from '@prisma/client';
import {
  IProductRepository,
  ProductSearchFilters,
  ProductSearchResult,
  ProductSummary,
  ProductWithStock,
  AvailabilityStatus,
  ProductStatus,
} from '../../domain/repositories';
import { Product } from '../../domain/Product';
import { ProductImage } from '../../domain/ProductImage';
import { jsonToStringArray } from '../../../shared/infrastructure/prisma/jsonArray';
import { insensitiveContains, insensitiveEquals } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';

/** Shape of the rows the search/read queries load. */
const productInclude = {
  stockLevels: {
    select: {
      warehouseId: true,
      quantity: true,
      warehouse: { select: { name: true } },
    },
  },
  images: { orderBy: { position: 'asc' } },
  category: { select: { name: true } },
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export class PrismaProductRepository implements IProductRepository {
  constructor(private prisma: PrismaClient) {}

  // ======================
  // Mapping
  // ======================

  private toDomain(record: {
    id: string;
    tenantId: string;
    name: string;
    description: string;
    sku: string | null;
    brand: string | null;
    categoryId: string | null;
    price: number;
    cost: number | null;
    tags: Prisma.JsonValue;
    lowStockThreshold: number;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Product {
    return Product.create({
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      description: record.description,
      sku: record.sku,
      brand: record.brand,
      categoryId: record.categoryId,
      price: record.price,
      cost: record.cost,
      tags: jsonToStringArray(record.tags),
      lowStockThreshold: record.lowStockThreshold,
      isArchived: record.isArchived,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  /**
   * Folds a loaded row into the read model the UI consumes.
   *
   * When a warehouse filter is in play only that warehouse's stock counts —
   * otherwise a staff member scoped to one location would see (and be judged
   * against) the company-wide total.
   */
  private toReadModel(record: ProductRecord, warehouseId?: string): ProductWithStock {
    const product = this.toDomain(record);

    const relevantLevels = warehouseId
      ? record.stockLevels.filter((sl) => sl.warehouseId === warehouseId)
      : record.stockLevels;

    const totalStock = relevantLevels.reduce((sum, sl) => sum + sl.quantity, 0);

    let availability: AvailabilityStatus = 'IN_STOCK';
    if (totalStock === 0) {
      availability = 'OUT_OF_STOCK';
    } else if (totalStock <= product.lowStockThreshold) {
      availability = 'LOW_STOCK';
    }

    return {
      product,
      totalStock,
      availability,
      status: product.isArchived ? 'ARCHIVED' : availability,
      categoryName: record.category?.name ?? null,
      images: record.images.map((image) =>
        ProductImage.create({
          id: image.id,
          tenantId: image.tenantId,
          productId: image.productId,
          productTenantId: image.tenantId,
          url: image.url,
          url2x: image.url2x,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          position: image.position,
          createdAt: image.createdAt,
        })
      ),
      stockBreakdown: relevantLevels.map((sl) => ({
        warehouseId: sl.warehouseId,
        warehouseName: sl.warehouse.name,
        quantity: sl.quantity,
      })),
    };
  }

  // ======================
  // Reads
  // ======================

  async findById(tenantId: string, id: string): Promise<Product | null> {
    const record = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findBySku(tenantId: string, sku: string): Promise<Product | null> {
    const record = await this.prisma.product.findFirst({
      where: { tenantId, sku },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findManyByIds(tenantId: string, ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const records = await this.prisma.product.findMany({
      where: { tenantId, id: { in: ids } },
    });
    return records.map((record) => this.toDomain(record));
  }

  async findWithStock(tenantId: string, id: string): Promise<ProductWithStock | null> {
    const record = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: productInclude,
    });
    if (!record) return null;
    return this.toReadModel(record);
  }

  // ======================
  // Writes
  // ======================

  private toPersistence(product: Product) {
    return {
      name: product.name,
      description: product.description,
      sku: product.sku,
      brand: product.brand,
      categoryId: product.categoryId,
      price: product.price,
      cost: product.cost,
      tags: product.tags,
      lowStockThreshold: product.lowStockThreshold,
      isArchived: product.isArchived,
    };
  }

  async save(product: Product): Promise<void> {
    const data = this.toPersistence(product);
    await this.prisma.product.upsert({
      where: { id: product.id },
      update: data,
      create: { id: product.id, tenantId: product.tenantId, ...data },
    });
  }

  async saveMany(products: Product[]): Promise<void> {
    if (products.length === 0) return;
    // One transaction so a bulk archive either lands completely or not at all.
    await this.prisma.$transaction(
      products.map((product) =>
        this.prisma.product.update({
          where: { id: product.id },
          data: this.toPersistence(product),
        })
      )
    );
  }

  /**
   * Removes the product and everything that only exists to describe it. Image
   * rows cascade at the database level; the files behind them are unlinked by
   * the delete use case, which owns the filesystem.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.stockMovement.deleteMany({ where: { tenantId, productId: id } }),
      this.prisma.stockLevel.deleteMany({ where: { tenantId, productId: id } }),
      this.prisma.productImage.deleteMany({ where: { tenantId, productId: id } }),
      this.prisma.product.deleteMany({ where: { tenantId, id } }),
    ]);
  }

  // ======================
  // Search
  // ======================

  async countByCategoryId(tenantId: string, categoryId: string): Promise<number> {
    return this.prisma.product.count({
      where: { tenantId, categoryId },
    });
  }

  async countQuotationReferences(tenantId: string, productId: string): Promise<number> {
    return this.prisma.quotationLineItem.count({
      where: { tenantId, productId },
    });
  }

  async listBrands(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    });
    return rows.map((row) => row.brand!).filter((brand) => brand.trim() !== '');
  }

  async listTags(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId },
      select: { tags: true },
    });
    // Distinct across array columns has no Prisma equivalent, and the tag
    // vocabulary of one tenant is small enough to fold in memory.
    const seen = new Map<string, string>();
    for (const row of rows) {
      for (const tag of jsonToStringArray(row.tags)) {
        const key = tag.toLowerCase();
        if (!seen.has(key)) seen.set(key, tag);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }

  private buildWhere(tenantId: string, filters: ProductSearchFilters): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { tenantId };

    if (filters.name) {
      // One search box, three columns — users type a SKU as readily as a name.
      where.OR = [
        { name: insensitiveContains(filters.name) },
        { sku: insensitiveContains(filters.name) },
        { brand: insensitiveContains(filters.name) },
      ];
    }
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters.brand) {
      where.brand = insensitiveEquals(filters.brand);
    }
    if (filters.tags && filters.tags.length > 0) {
      // `tags` is Json (MySQL has no array column type), so "every requested
      // tag must be present" is one `array_contains` per tag, ANDed together —
      // there is no single `hasEvery`-equivalent operator for a Json column.
      where.AND = filters.tags.map((tag) => ({ tags: { array_contains: tag } }));
    }
    // A warehouse filter narrows which stock *counts*, not which products are
    // listed — see `toReadModel`. Requiring a stock row here would hide every
    // product with nothing in that warehouse, which is exactly the set someone
    // filtering for OUT_OF_STOCK is looking for.

    // ARCHIVED is a status the caller can ask for outright; otherwise archived
    // products stay out of the way unless includeArchived says otherwise.
    if (filters.status === 'ARCHIVED') {
      where.isArchived = true;
    } else if (!filters.includeArchived) {
      where.isArchived = false;
    }

    return where;
  }

  /**
   * Availability depends on summed stock, which Prisma cannot filter or sort on
   * inside findMany. So the row set is narrowed as far as SQL allows, then the
   * stock-derived work — availability filtering, sorting and the page slice —
   * happens in memory. Fine at a single tenant's catalogue size; a very large
   * catalogue would want a raw aggregate query here instead.
   */
  private async loadForSearch(
    tenantId: string,
    filters: ProductSearchFilters
  ): Promise<ProductWithStock[]> {
    const records = await this.prisma.product.findMany({
      where: this.buildWhere(tenantId, filters),
      include: productInclude,
      orderBy: { name: 'asc' },
    });

    let items = records.map((record) => this.toReadModel(record, filters.warehouseId));

    const availability =
      filters.availability ??
      (filters.status && filters.status !== 'ARCHIVED' ? filters.status : undefined);

    if (availability) {
      items = items.filter((item) => item.availability === availability);
    }

    return items;
  }

  private sort(items: ProductWithStock[], filters: ProductSearchFilters): ProductWithStock[] {
    const direction = filters.sortDirection === 'desc' ? -1 : 1;
    const field = filters.sortBy ?? 'name';

    const compare = (a: ProductWithStock, b: ProductWithStock): number => {
      switch (field) {
        case 'stock':
          return a.totalStock - b.totalStock;
        case 'price':
          return a.product.price - b.product.price;
        case 'cost':
          // Uncosted products sort last in either direction rather than
          // masquerading as free.
          if (a.product.cost === null && b.product.cost === null) return 0;
          if (a.product.cost === null) return 1 * direction;
          if (b.product.cost === null) return -1 * direction;
          return a.product.cost - b.product.cost;
        case 'sku':
          return (a.product.sku ?? '').localeCompare(b.product.sku ?? '');
        case 'createdAt':
          return a.product.createdAt.getTime() - b.product.createdAt.getTime();
        case 'updatedAt':
          return a.product.updatedAt.getTime() - b.product.updatedAt.getTime();
        case 'name':
        default:
          return a.product.name.localeCompare(b.product.name);
      }
    };

    return [...items].sort((a, b) => compare(a, b) * direction);
  }

  async search(tenantId: string, filters: ProductSearchFilters): Promise<ProductSearchResult> {
    const matched = this.sort(await this.loadForSearch(tenantId, filters), filters);

    const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : matched.length;
    const page = filters.page && filters.page > 0 ? filters.page : 1;

    // A filter change can leave the caller on a page that no longer exists;
    // clamp rather than hand back an empty list they cannot navigate out of.
    const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(matched.length / pageSize)) : 1;
    const safePage = Math.min(page, pageCount);
    const start = (safePage - 1) * pageSize;

    return {
      items: pageSize > 0 ? matched.slice(start, start + pageSize) : matched,
      total: matched.length,
      page: safePage,
      pageSize: pageSize > 0 ? pageSize : matched.length,
    };
  }

  /**
   * Totals for the KPI strip. Deliberately ignores pagination but honours every
   * other filter, so the headline numbers describe the list being looked at.
   */
  async summarise(tenantId: string, filters: ProductSearchFilters): Promise<ProductSummary> {
    const items = await this.loadForSearch(tenantId, {
      ...filters,
      // Archived stock is still stock the business owns, so value it too.
      includeArchived: true,
      page: undefined,
      pageSize: undefined,
    });

    const summary: ProductSummary = {
      totalProducts: 0,
      outOfStock: 0,
      lowStock: 0,
      archived: 0,
      inventoryValue: 0,
      inventoryCost: 0,
      totalUnits: 0,
    };

    for (const item of items) {
      const status: ProductStatus = item.status;
      if (status === 'ARCHIVED') {
        summary.archived += 1;
      } else {
        summary.totalProducts += 1;
        if (status === 'OUT_OF_STOCK') summary.outOfStock += 1;
        if (status === 'LOW_STOCK') summary.lowStock += 1;
      }

      summary.totalUnits += item.totalStock;
      summary.inventoryValue += item.product.price * item.totalStock;
      if (item.product.cost !== null) {
        summary.inventoryCost += item.product.cost * item.totalStock;
      }
    }

    // Float arithmetic over many rows drifts; money is presented to 2dp.
    summary.inventoryValue = Math.round(summary.inventoryValue * 100) / 100;
    summary.inventoryCost = Math.round(summary.inventoryCost * 100) / 100;

    return summary;
  }
}
