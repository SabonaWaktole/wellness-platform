import { Request, Response, NextFunction, Router } from 'express';
import multer from 'multer';
import { InventoryController } from './inventoryController';
import { ITokenService } from '../../../auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { authenticate } from '../../../main/interfaces/http/middlewares/authenticate';
import { resolveTenant } from '../../../main/interfaces/http/middlewares/resolveTenant';
import { loadAccess } from '../../../main/interfaces/http/middlewares/loadAccess';
import { requirePermission, requireScope } from '../../../main/interfaces/http/middlewares/requirePermission';
import { ResolveAccessContextUseCase } from '../../../access/application/use-cases/ResolveAccessContextUseCase';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { ACCEPTED_MIME, MAX_UPLOAD_BYTES } from '../../../media/MediaService';
import { MAX_IMAGES_PER_PRODUCT } from '../../application/use-cases/ManageProductImagesUseCase';

/**
 * Product photos are buffered in memory and re-encoded by sharp before
 * anything touches disk, exactly as profile and branding uploads are. The
 * per-file cap keeps that safe even with a full batch in flight.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_IMAGES_PER_PRODUCT },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME.includes(file.mimetype)) {
      cb(new Error('UNSUPPORTED_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/**
 * Multer reports "too large" and "wrong type" as thrown errors. Translating
 * them here means the uploader can tell the user *why* a file was refused
 * instead of showing a generic failure.
 */
const receiveImages = (req: Request, res: Response, next: NextFunction) => {
  upload.array('files', MAX_IMAGES_PER_PRODUCT)(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `Each image must be smaller than ${Math.round(
          MAX_UPLOAD_BYTES / 1024 / 1024
        )} MB. Try a smaller file.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: `You can upload at most ${MAX_IMAGES_PER_PRODUCT} images at a time.`,
      });
    }
    if (err.message === 'UNSUPPORTED_TYPE') {
      return res.status(415).json({
        error: 'Unsupported format. Use a JPEG, PNG, WebP, GIF or AVIF image.',
      });
    }
    return res.status(400).json({ error: 'That upload could not be read.' });
  });
};

export const createInventoryRouter = (
  controller: InventoryController,
  tokenService: ITokenService,
  tenantRepository: ITenantRepository,
  resolveAccessContext: ResolveAccessContextUseCase
) => {
  const router = Router({ mergeParams: true });

  // Apply authentication and tenant scoping to all inventory routes
  router.use(authenticate(tokenService));
  router.use(resolveTenant(tenantRepository));
  router.use(loadAccess(resolveAccessContext));

  // inventory.manage: Sales User holds it at OWN (their own warehouse,
  // matching today's behaviour for these routes — see the doc comment on
  // DEFAULT_ROLE_MATRIX's Sales User entry), Administrator at ALL. Routes
  // that were BUSINESS_OWNER-only require ALL specifically via requireScope.
  router.get('/products', requirePermission('inventory.manage'), controller.searchProducts);
  // Registered before '/products/:id' so 'facets' and 'bulk' are never read
  // as product ids.
  router.get('/products/facets', requirePermission('inventory.manage'), controller.getProductFacets);
  router.post('/products', requirePermission('inventory.manage'), controller.createProduct);
  router.post(
    '/products/bulk',
    requireScope('inventory.manage', PermissionScope.All),
    controller.bulkUpdateProducts
  );
  router.get('/products/:id', requirePermission('inventory.manage'), controller.getProduct);
  router.put('/products/:id', requirePermission('inventory.manage'), controller.updateProduct);
  router.delete('/products/:id', requireScope('inventory.manage', PermissionScope.All), controller.deleteProduct);
  router.get(
    '/products/:id/stock-breakdown',
    requirePermission('inventory.manage'),
    controller.getProductBreakdown
  );
  router.post('/products/:id/adjust', requirePermission('inventory.manage'), controller.adjustStock);
  router.post('/products/:id/transfer', requirePermission('inventory.manage'), controller.transferStock);

  // Product images
  router.post(
    '/products/:id/images',
    requirePermission('inventory.manage'),
    receiveImages,
    controller.uploadProductImages
  );
  router.put(
    '/products/:id/images/order',
    requirePermission('inventory.manage'),
    controller.reorderProductImages
  );
  router.delete(
    '/products/:id/images/:imageId',
    requirePermission('inventory.manage'),
    controller.deleteProductImage
  );

  // Warehouses
  router.get('/warehouses', requirePermission('inventory.manage'), controller.getWarehouses);
  router.post('/warehouses', requireScope('inventory.manage', PermissionScope.All), controller.createWarehouse);
  router.put('/warehouses/:id', requireScope('inventory.manage', PermissionScope.All), controller.updateWarehouse);
  router.delete(
    '/warehouses/:id',
    requireScope('inventory.manage', PermissionScope.All),
    controller.deleteWarehouse
  );

  // Categories
  router.get('/categories', requirePermission('inventory.manage'), controller.getCategories);
  router.post('/categories', requireScope('inventory.manage', PermissionScope.All), controller.createCategory);
  router.get(
    '/categories/cleanup/preview',
    requireScope('inventory.manage', PermissionScope.All),
    controller.previewCategoryCleanup
  );
  router.post(
    '/categories/cleanup',
    requireScope('inventory.manage', PermissionScope.All),
    controller.cleanupCategories
  );
  router.put('/categories/:id', requireScope('inventory.manage', PermissionScope.All), controller.updateCategory);
  router.delete(
    '/categories/:id',
    requireScope('inventory.manage', PermissionScope.All),
    controller.deleteCategory
  );

  return router;
};
