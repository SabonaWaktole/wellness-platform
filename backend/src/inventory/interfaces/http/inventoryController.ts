import { Request, Response } from 'express';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { requireTenantId } from "@main/interfaces/http/tenantContext";
import { CreateProductUseCase } from '../../application/use-cases/CreateProductUseCase';
import { UpdateProductUseCase } from '../../application/use-cases/UpdateProductUseCase';
import { GetProductUseCase } from '../../application/use-cases/GetProductUseCase';
import { DeleteProductUseCase } from '../../application/use-cases/DeleteProductUseCase';
import { BulkUpdateProductsUseCase } from '../../application/use-cases/BulkUpdateProductsUseCase';
import { GetProductFacetsUseCase } from '../../application/use-cases/GetProductFacetsUseCase';
import { ManageProductImagesUseCase } from '../../application/use-cases/ManageProductImagesUseCase';
import { AdjustStockUseCase } from '../../application/use-cases/AdjustStockUseCase';
import { TransferStockUseCase } from '../../application/use-cases/TransferStockUseCase';
import { SearchProductsUseCase } from '../../application/use-cases/SearchProductsUseCase';
import { GetProductStockBreakdownUseCase } from '../../application/use-cases/GetProductStockBreakdownUseCase';
import { CreateWarehouseUseCase } from '../../application/use-cases/CreateWarehouseUseCase';
import { UpdateWarehouseUseCase } from '../../application/use-cases/UpdateWarehouseUseCase';
import { DeleteWarehouseUseCase } from '../../application/use-cases/DeleteWarehouseUseCase';
import { CreateCategoryUseCase } from '../../application/use-cases/CreateCategoryUseCase';
import { UpdateCategoryUseCase } from '../../application/use-cases/UpdateCategoryUseCase';
import { DeleteCategoryUseCase } from '../../application/use-cases/DeleteCategoryUseCase';
import { GetWarehousesUseCase } from '../../application/use-cases/GetWarehousesUseCase';
import { GetCategoriesUseCase } from '../../application/use-cases/GetCategoriesUseCase';
import { ArchiveUnusedCategoriesUseCase } from '../../application/use-cases/ArchiveUnusedCategoriesUseCase';
import { NegativeStockError } from '../../domain/errors';
import {
  WarehouseInUseError,
  CategoryInUseError,
  ProductInUseError,
  DuplicateSkuError,
} from '../../domain/inUseErrors';
import { presentProduct, presentProductImage } from './productPresenter';
import {
  createProductSchema, updateProductSchema, adjustStockSchema, transferStockSchema,
  createWarehouseSchema, updateWarehouseSchema, createCategorySchema, updateCategorySchema,
  bulkProductActionSchema, reorderProductImagesSchema, searchProductsQuerySchema
} from './schemas';

/**
 * The controller's dependencies, named rather than positional. There are two
 * dozen of them; a positional list at that size is one reordered argument away
 * from a silent bug.
 */
export interface InventoryControllerDeps {
  createProductUseCase: CreateProductUseCase;
  updateProductUseCase: UpdateProductUseCase;
  getProductUseCase: GetProductUseCase;
  deleteProductUseCase: DeleteProductUseCase;
  bulkUpdateProductsUseCase: BulkUpdateProductsUseCase;
  getProductFacetsUseCase: GetProductFacetsUseCase;
  manageProductImagesUseCase: ManageProductImagesUseCase;
  adjustStockUseCase: AdjustStockUseCase;
  transferStockUseCase: TransferStockUseCase;
  searchProductsUseCase: SearchProductsUseCase;
  getProductStockBreakdownUseCase: GetProductStockBreakdownUseCase;
  createWarehouseUseCase: CreateWarehouseUseCase;
  updateWarehouseUseCase: UpdateWarehouseUseCase;
  deleteWarehouseUseCase: DeleteWarehouseUseCase;
  getWarehousesUseCase: GetWarehousesUseCase;
  createCategoryUseCase: CreateCategoryUseCase;
  updateCategoryUseCase: UpdateCategoryUseCase;
  deleteCategoryUseCase: DeleteCategoryUseCase;
  getCategoriesUseCase: GetCategoriesUseCase;
  archiveUnusedCategoriesUseCase: ArchiveUnusedCategoriesUseCase;
}

export class InventoryController {
  constructor(private deps: InventoryControllerDeps) {}

  /**
   * Single translation from thrown error to status code.
   *
   * The module signals failure by message and by error class in roughly equal
   * measure, so both are checked here rather than in twenty catch blocks.
   */
  private fail(res: Response, error: any, fallbackStatus = 400) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: error.errors?.[0]?.message ?? 'That request could not be read.',
        details: error.errors,
      });
    }
    if (error instanceof DuplicateSkuError) return res.status(409).json({ error: error.message });
    if (error instanceof ProductInUseError) return res.status(409).json({ error: error.message });
    if (error instanceof WarehouseInUseError) return res.status(409).json({ error: error.message });
    if (error instanceof CategoryInUseError) return res.status(409).json({ error: error.message });
    if (error instanceof NegativeStockError) return res.status(400).json({ error: error.message });

    const message: string = error?.message ?? 'Something went wrong.';
    if (error instanceof PermissionDeniedError) return res.status(403).json({ error: message });
    if (message.includes('not found')) return res.status(404).json({ error: message });

    return res.status(fallbackStatus).json({ error: message });
  }

  // ======================
  // PRODUCTS
  // ======================
  searchProducts = async (req: Request, res: Response) => {
    try {
      const query = searchProductsQuerySchema.parse(req.query);
      const results = await this.deps.searchProductsUseCase.execute({
        tenantId: requireTenantId(req),
        ...query,
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
      });
      res.json({
        items: results.items.map(presentProduct),
        total: results.total,
        page: results.page,
        pageSize: results.pageSize,
        summary: results.summary,
      });
    } catch (error: any) {
      this.fail(res, error, 500);
    }
  };

  getProductFacets = async (req: Request, res: Response) => {
    try {
      const facets = await this.deps.getProductFacetsUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
      });
      res.json(facets);
    } catch (error: any) {
      this.fail(res, error, 500);
    }
  };

  getProduct = async (req: Request, res: Response) => {
    try {
      const result = await this.deps.getProductUseCase.execute({
        tenantId: requireTenantId(req),
        id: req.params.id as string,
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
      });
      res.json(presentProduct(result));
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  createProduct = async (req: Request, res: Response) => {
    try {
      const parsed = createProductSchema.parse(req.body);
      const { product } = await this.deps.createProductUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
        ...parsed,
        categoryId: parsed.categoryId ?? null,
      });

      // Re-read so the response carries derived stock and status, matching
      // exactly what a subsequent GET would return.
      res.status(201).json(presentProduct(await this.readBack(req, product.id)));
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  updateProduct = async (req: Request, res: Response) => {
    try {
      const parsed = updateProductSchema.parse(req.body);
      const product = await this.deps.updateProductUseCase.execute({
        tenantId: requireTenantId(req),
        id: req.params.id as string,
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
        ...parsed,
        categoryId: parsed.categoryId !== undefined ? (parsed.categoryId ?? null) : undefined,
      });
      res.json(presentProduct(await this.readBack(req, product.id)));
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  deleteProduct = async (req: Request, res: Response) => {
    try {
      await this.deps.deleteProductUseCase.execute({
        tenantId: requireTenantId(req),
        id: req.params.id as string,
        access: req.access!,
      });
      res.status(204).send();
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  bulkUpdateProducts = async (req: Request, res: Response) => {
    try {
      const parsed = bulkProductActionSchema.parse(req.body);
      const result = await this.deps.bulkUpdateProductsUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        ...parsed,
      });
      // 200 even with failures — the body reports both halves, and a partial
      // success is not an error the client should discard.
      res.json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  /** Loads the canonical read model for a product the caller just wrote. */
  private readBack(req: Request, id: string) {
    return this.deps.getProductUseCase.execute({
      tenantId: requireTenantId(req),
      id,
      access: req.access!,
      authorWarehouseId: req.user!.warehouseId,
    });
  }

  // ======================
  // PRODUCT IMAGES
  // ======================
  uploadProductImages = async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const images = await this.deps.manageProductImagesUseCase.upload({
        tenantId: requireTenantId(req),
        productId: req.params.id as string,
        files: files.map((file) => file.buffer),
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
      });
      res.status(201).json(images.map(presentProductImage));
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  deleteProductImage = async (req: Request, res: Response) => {
    try {
      const images = await this.deps.manageProductImagesUseCase.remove({
        tenantId: requireTenantId(req),
        productId: req.params.id as string,
        imageId: req.params.imageId as string,
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
      });
      // Return the surviving gallery so the client does not have to guess how
      // the remaining positions were renumbered.
      res.json(images.map(presentProductImage));
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  reorderProductImages = async (req: Request, res: Response) => {
    try {
      const parsed = reorderProductImagesSchema.parse(req.body);
      const images = await this.deps.manageProductImagesUseCase.reorder({
        tenantId: requireTenantId(req),
        productId: req.params.id as string,
        imageIds: parsed.imageIds,
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
      });
      res.json(images.map(presentProductImage));
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  // ======================
  // STOCK
  // ======================
  getProductBreakdown = async (req: Request, res: Response) => {
    try {
      const result = await this.deps.getProductStockBreakdownUseCase.execute({
        tenantId: requireTenantId(req),
        productId: req.params.id as string,
        access: req.access!,
      });
      res.json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  adjustStock = async (req: Request, res: Response) => {
    try {
      const parsed = adjustStockSchema.parse(req.body);
      const result = await this.deps.adjustStockUseCase.execute({
        tenantId: requireTenantId(req),
        productId: req.params.id as string,
        authorUserId: req.user!.userId,
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
        warehouseId: parsed.warehouseId,
        quantityChange: parsed.quantityChange,
        reason: parsed.reason || 'Manual adjustment',
      });
      res.json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  transferStock = async (req: Request, res: Response) => {
    try {
      const parsed = transferStockSchema.parse(req.body);
      const result = await this.deps.transferStockUseCase.execute({
        tenantId: requireTenantId(req),
        productId: req.params.id as string,
        authorUserId: req.user!.userId,
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
        ...parsed,
      });
      res.json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  // ======================
  // WAREHOUSES
  // ======================
  getWarehouses = async (req: Request, res: Response) => {
    try {
      const results = await this.deps.getWarehousesUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        authorWarehouseId: req.user!.warehouseId,
      });
      res.json(results);
    } catch (error: any) {
      this.fail(res, error, 500);
    }
  };

  createWarehouse = async (req: Request, res: Response) => {
    try {
      const parsed = createWarehouseSchema.parse(req.body);
      const result = await this.deps.createWarehouseUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        ...parsed,
      });
      res.status(201).json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  updateWarehouse = async (req: Request, res: Response) => {
    try {
      const parsed = updateWarehouseSchema.parse(req.body);
      const result = await this.deps.updateWarehouseUseCase.execute({
        tenantId: requireTenantId(req),
        id: req.params.id as string,
        access: req.access!,
        ...parsed,
      });
      res.json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  deleteWarehouse = async (req: Request, res: Response) => {
    try {
      await this.deps.deleteWarehouseUseCase.execute({
        tenantId: requireTenantId(req),
        id: req.params.id as string,
        access: req.access!,
      });
      res.status(204).send();
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  // ======================
  // CATEGORIES
  // ======================
  getCategories = async (req: Request, res: Response) => {
    try {
      const results = await this.deps.getCategoriesUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        includeArchived: req.query.includeArchived === 'true',
      });
      res.json(results);
    } catch (error: any) {
      this.fail(res, error, 500);
    }
  };

  createCategory = async (req: Request, res: Response) => {
    try {
      const parsed = createCategorySchema.parse(req.body);
      const result = await this.deps.createCategoryUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        ...parsed,
      });
      res.status(201).json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  updateCategory = async (req: Request, res: Response) => {
    try {
      const parsed = updateCategorySchema.parse(req.body);
      const result = await this.deps.updateCategoryUseCase.execute({
        tenantId: requireTenantId(req),
        id: req.params.id as string,
        access: req.access!,
        ...parsed,
      });
      res.json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  deleteCategory = async (req: Request, res: Response) => {
    try {
      await this.deps.deleteCategoryUseCase.execute({
        tenantId: requireTenantId(req),
        id: req.params.id as string,
        access: req.access!,
      });
      res.status(204).send();
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  /**
   * What cleanup would archive, without archiving anything. The UI reads this
   * so the number it shows and the button's effect come from one query — they
   * used to be computed independently, which is how a fabricated "3" ended up
   * above a real destructive action. TD-027.
   */
  previewCategoryCleanup = async (req: Request, res: Response) => {
    try {
      const result = await this.deps.archiveUnusedCategoriesUseCase.preview({
        tenantId: requireTenantId(req),
        access: req.access!,
      });
      res.json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  cleanupCategories = async (req: Request, res: Response) => {
    try {
      // No `limit`. The previous call passed a hard-coded 3 "matching UI mock".
      const result = await this.deps.archiveUnusedCategoriesUseCase.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
      });
      res.json(result);
    } catch (error: any) {
      this.fail(res, error);
    }
  };
}
