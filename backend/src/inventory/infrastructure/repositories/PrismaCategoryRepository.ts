import { PrismaClient, Prisma } from '@prisma/client';
import { ICategoryRepository, CategoryWithItemCount } from '../../domain/repositories';
import { Category } from '../../domain/Category';
import { IS_MYSQL } from '../../../shared/infrastructure/prisma/provider';

export class PrismaCategoryRepository implements ICategoryRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(tenantId: string, id: string): Promise<Category | null> {
    const record = await this.prisma.category.findUnique({
      where: { id, tenantId },
    });
    if (!record) return null;
    return Category.create({
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      description: record.description,
      isArchived: record.isArchived,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findAllByTenantId(tenantId: string, includeArchived: boolean = false): Promise<Category[]> {
    const records = await this.prisma.category.findMany({
      where: { 
        tenantId,
        ...(includeArchived ? {} : { isArchived: false })
      },
      orderBy: { name: 'asc' },
    });
    return records.map((record) =>
      Category.create({
        id: record.id,
        tenantId: record.tenantId,
        name: record.name,
        description: record.description,
        isArchived: record.isArchived,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
  }

  async findAllWithItemCount(tenantId: string, includeArchived: boolean = false): Promise<CategoryWithItemCount[]> {
    const records = await this.prisma.category.findMany({
      where: { 
        tenantId,
        ...(includeArchived ? {} : { isArchived: false })
      },
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' },
    });

    return records.map(record => ({
      category: Category.create({
        id: record.id,
        tenantId: record.tenantId,
        name: record.name,
        description: record.description,
        isArchived: record.isArchived,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
      itemCount: record._count.products
    }));
  }

  /**
   * See ICategoryRepository.findUnusedCategories for the agreed definition.
   *
   * Two independent conditions, both expressed as NOT EXISTS:
   *
   *  1. No **active** product is assigned. Archived products deliberately do
   *     NOT keep a category in use — archiving a product is how a catalogue
   *     retires it, and a category holding only retired products is exactly
   *     what cleanup is for.
   *
   *  2. No QuotationLineItem references **any** product still carrying this
   *     category, archived or not. This is the historical guard: a category
   *     whose only product is archived but was quoted at some point stays out
   *     of the candidate list, because archiving the category would obscure
   *     the lineage of a real quotation.
   *
   * Known limitation, worth stating rather than discovering later: the link
   * from a line item to a category runs through `Product.categoryId`, which is
   * *current* state. If a product is reassigned to a different category, the
   * evidence that it was ever quoted under the old one is gone from the
   * database entirely. Closing that would mean snapshotting the category on
   * QuotationLineItem at write time. Until then, "historically" means "as far
   * back as the current product-to-category assignment can attest".
   *
   * Archived categories are excluded because archiving them again is a no-op.
   */
  async findUnusedCategories(tenantId: string): Promise<Category[]> {
    // Only the identifier quoting differs between the two dialects here —
    // MySQL has no double-quoted-identifier syntax by default (backticks
    // instead); the NOT EXISTS logic itself is portable SQL.
    const query = IS_MYSQL
      ? Prisma.sql`
          SELECT c.id, c.name, c.description, c.\`isArchived\`, c.\`createdAt\`, c.\`updatedAt\`
          FROM \`Category\` c
          WHERE c.\`tenantId\` = ${tenantId}
            AND c.\`isArchived\` = false
            AND NOT EXISTS (
              SELECT 1 FROM \`Product\` p
              WHERE p.\`categoryId\` = c.id
                AND p.\`isArchived\` = false
            )
            AND NOT EXISTS (
              SELECT 1 FROM \`QuotationLineItem\` qli
              JOIN \`Product\` p2 ON p2.id = qli.\`productId\`
              WHERE p2.\`categoryId\` = c.id
            )
          ORDER BY c.name ASC
        `
      : Prisma.sql`
          SELECT c.id, c.name, c.description, c."isArchived", c."createdAt", c."updatedAt"
          FROM "Category" c
          WHERE c."tenantId" = ${tenantId}
            AND c."isArchived" = false
            AND NOT EXISTS (
              SELECT 1 FROM "Product" p
              WHERE p."categoryId" = c.id
                AND p."isArchived" = false
            )
            AND NOT EXISTS (
              SELECT 1 FROM "QuotationLineItem" qli
              JOIN "Product" p2 ON p2.id = qli."productId"
              WHERE p2."categoryId" = c.id
            )
          ORDER BY c.name ASC
        `;

    const rows = await this.prisma.$queryRaw<Array<{
      id: string,
      name: string,
      description: string | null,
      isArchived: boolean,
      createdAt: Date,
      updatedAt: Date
    }>>(query);

    return rows.map((record) =>
      Category.create({
        id: record.id,
        tenantId,
        name: record.name,
        description: record.description,
        isArchived: record.isArchived,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
  }

  async save(category: Category): Promise<void> {
    await this.prisma.category.create({
      data: {
        id: category.id,
        tenantId: category.tenantId,
        name: category.name,
        description: category.description,
        isArchived: category.isArchived,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    });
  }

  async update(category: Category): Promise<void> {
    await this.prisma.category.update({
      where: { id: category.id, tenantId: category.tenantId },
      data: {
        name: category.name,
        description: category.description,
        isArchived: category.isArchived,
        updatedAt: category.updatedAt,
      },
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.prisma.category.delete({
      where: { id, tenantId },
    });
  }
}
