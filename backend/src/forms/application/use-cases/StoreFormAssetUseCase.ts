import { AccessContext } from '../../../access/domain/AccessContext';
import { MediaService } from '../../../media/MediaService';
import { FormPermissions } from '../../domain/services/FormPermissions';
import { DomainError } from '../../../shared/domain/errors/DomainError';

export interface StoredFormAsset {
  url: string;
  width: number;
  height: number;
}

/**
 * Owner-uploaded images for IMAGE elements — logos, letterheads, anything the
 * builder's Add → Image places on the canvas.
 *
 * Reuses `MediaService.storeImage`, the generic entry point already
 * documented for callers outside the four profile/branding kinds — no new
 * `MEDIA_SPECS` entry needed. `contain`, not `cover`: a logo is art-directed
 * by the uploader, and cropping it to fill a box would be actively wrong.
 */
const FORM_ASSET_SPEC = { width: 1600, height: 1600, fit: 'contain' as const };

export class StoreFormAssetUseCase {
  constructor(private mediaService: MediaService) {}

  async execute(
    tenantId: string,
    access: AccessContext,
    buffer: Buffer
  ): Promise<StoredFormAsset> {
    FormPermissions.ensure(access, 'forms:edit');

    const stored = await this.mediaService.storeImage(FORM_ASSET_SPEC, 'form-asset', tenantId, buffer);
    return { url: stored.url, width: stored.width, height: stored.height };
  }
}
