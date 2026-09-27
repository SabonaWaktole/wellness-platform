import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { randomUUID } from 'crypto';
import { IProductImageRepository, IProductRepository } from '../../domain/repositories';
import { ProductImage } from '../../domain/ProductImage';
import { IProductImageStorage } from '../ports/IProductImageStorage';

/** How many images one product may carry. */
export const MAX_IMAGES_PER_PRODUCT = 8;

export interface UploadProductImagesDTO {
  tenantId: string;
  productId: string;
  files: Buffer[];
  access: AccessContext;
  authorWarehouseId?: string | null;
}

export interface DeleteProductImageDTO {
  tenantId: string;
  productId: string;
  imageId: string;
  access: AccessContext;
  authorWarehouseId?: string | null;
}

export interface ReorderProductImagesDTO {
  tenantId: string;
  productId: string;
  /** The gallery in its intended order. Must name every current image. */
  imageIds: string[];
  access: AccessContext;
  authorWarehouseId?: string | null;
}

/**
 * Everything that mutates a product's gallery.
 *
 * These three operations share the same guard and the same "does this product
 * exist in this tenant" lookup, so they live together rather than in three
 * near-identical files.
 */
export class ManageProductImagesUseCase {
  constructor(
    private productRepo: IProductRepository,
    private imageRepo: IProductImageRepository,
    private imageStorage: IProductImageStorage
  ) {}

  /** Same permission model as editing a product's other fields. */
  private async authorize(dto: {
    tenantId: string;
    productId: string;
    access: AccessContext;
    authorWarehouseId?: string | null;
  }): Promise<void> {
    dto.access.ensure('inventory.manage');
    if (dto.access.ownOnly('inventory.manage') && !dto.authorWarehouseId) {
      throw new PermissionDeniedError('inventory.manage', 'Unauthorized: You must be assigned to a warehouse to change product images.');
    }

    const product = await this.productRepo.findById(dto.tenantId, dto.productId);
    if (!product) {
      throw new Error(`Product ${dto.productId} not found`);
    }
  }

  async upload(dto: UploadProductImagesDTO): Promise<ProductImage[]> {
    await this.authorize(dto);

    if (dto.files.length === 0) {
      throw new Error('No image was included in the request.');
    }

    const existing = await this.imageRepo.countByProductId(dto.tenantId, dto.productId);
    if (existing + dto.files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new Error(
        `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images. This one already has ${existing}.`
      );
    }

    let position = await this.imageRepo.nextPosition(dto.tenantId, dto.productId);
    const saved: ProductImage[] = [];

    // Sequential so the uploaded order is the gallery order, and so a batch of
    // large images does not run several sharp pipelines at once.
    for (const buffer of dto.files) {
      const stored = await this.imageStorage.store(dto.tenantId, buffer);
      const image = ProductImage.create({
        id: randomUUID(),
        tenantId: dto.tenantId,
        productId: dto.productId,
        productTenantId: dto.tenantId,
        url: stored.url,
        url2x: stored.url2x,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        position: position++,
      });

      try {
        await this.imageRepo.save(image);
      } catch (error) {
        // The file is written but the row is not; without this the upload
        // leaves an unreachable file behind on every failure.
        await this.imageStorage.remove(stored.url);
        throw error;
      }

      saved.push(image);
    }

    return saved;
  }

  async remove(dto: DeleteProductImageDTO): Promise<ProductImage[]> {
    await this.authorize(dto);

    const image = await this.imageRepo.findById(dto.tenantId, dto.imageId);
    if (!image || image.productId !== dto.productId) {
      throw new Error(`Image ${dto.imageId} not found`);
    }

    await this.imageRepo.delete(dto.tenantId, dto.imageId);
    await this.imageStorage.remove(image.url);

    // Close the gap so positions stay contiguous and 0 is always the primary.
    const remaining = await this.imageRepo.findByProductId(dto.tenantId, dto.productId);
    await this.imageRepo.reorder(
      dto.tenantId,
      dto.productId,
      remaining.map((item) => item.id)
    );

    return this.imageRepo.findByProductId(dto.tenantId, dto.productId);
  }

  async reorder(dto: ReorderProductImagesDTO): Promise<ProductImage[]> {
    await this.authorize(dto);

    const current = await this.imageRepo.findByProductId(dto.tenantId, dto.productId);
    const currentIds = new Set(current.map((image) => image.id));

    // Demand a full permutation. A partial list would silently leave the
    // unmentioned images stacked at whatever position they already held.
    const requested = new Set(dto.imageIds);
    const isPermutation =
      requested.size === dto.imageIds.length &&
      requested.size === currentIds.size &&
      dto.imageIds.every((id) => currentIds.has(id));

    if (!isPermutation) {
      throw new Error('The image order must list each of this product\'s images exactly once.');
    }

    await this.imageRepo.reorder(dto.tenantId, dto.productId, dto.imageIds);
    return this.imageRepo.findByProductId(dto.tenantId, dto.productId);
  }
}
