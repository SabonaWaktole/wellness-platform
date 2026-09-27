import { Request, Response, Router } from 'express';
import multer from 'multer';
import { prisma } from '../../../shared/infrastructure/prisma/client';
import { requireTenantId } from '../../../main/interfaces/http/tenantContext';
import {
  ACCEPTED_MIME,
  MAX_UPLOAD_BYTES,
  MEDIA_SPECS,
  MediaKind,
  MediaService,
  isMediaKind,
  srcSetFor,
} from '../../MediaService';

/**
 * Upload endpoints for profile photos and workspace branding.
 *
 * Files are buffered in memory rather than written straight to disk: every
 * upload is re-encoded by sharp anyway, so nothing untrusted ever reaches the
 * filesystem. The 8 MB cap keeps that safe.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME.includes(file.mimetype)) {
      cb(new Error('UNSUPPORTED_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/** Which DB column each kind writes to. */
const COLUMN: Record<MediaKind, 'logoUrl' | 'coverImageUrl' | 'avatarUrl'> = {
  logo: 'logoUrl',
  'company-cover': 'coverImageUrl',
  avatar: 'avatarUrl',
  'user-cover': 'coverImageUrl',
};

export class MediaController {
  public router = Router({ mergeParams: true });

  constructor(private mediaService: MediaService = new MediaService()) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(
      '/:kind',
      // Multer errors (too large, wrong type) surface as thrown errors, so
      // they are translated here rather than falling through to the global
      // 500 handler — the user needs to know *why* their upload was refused.
      (req, res, next) => {
        upload.single('file')(req, res, (err: any) => {
          if (!err) return next();
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
              error: `That image is larger than ${Math.round(
                MAX_UPLOAD_BYTES / 1024 / 1024
              )} MB. Try a smaller file.`,
            });
          }
          if (err.message === 'UNSUPPORTED_TYPE') {
            return res.status(415).json({
              error: 'Unsupported format. Use a JPEG, PNG, WebP, GIF or AVIF image.',
            });
          }
          console.error('Multer error:', err);
          return res.status(400).json({ error: 'That upload could not be read.' });
        });
      },
      this.uploadMedia.bind(this)
    );

    this.router.delete('/:kind', this.deleteMedia.bind(this));
  }

  /** Shared guard: validates the kind and the caller's right to change it. */
  private authorize(req: Request, res: Response): MediaKind | null {
    // Express's param typing allows string[]; normalise before narrowing.
    const kind = String(req.params.kind ?? '');

    if (!isMediaKind(kind)) {
      res.status(404).json({ error: 'Unknown image type.' });
      return null;
    }

    const spec = MEDIA_SPECS[kind];
    const user = req.user!;

    // Workspace branding is workspace configuration (settings.manage,
    // FR-RBAC-05); personal images are always the caller's own, so there is
    // nothing extra to check for those.
    if (spec.owner === 'tenant' && !req.access!.can('settings.manage')) {
      res.status(403).json({ error: 'You do not have permission to change workspace branding.' });
      return null;
    }

    if (!user.tenantId) {
      res.status(403).json({ error: 'No workspace associated with this account.' });
      return null;
    }

    return kind;
  }

  private async uploadMedia(req: Request, res: Response) {
    try {
      const kind = this.authorize(req, res);
      if (!kind) return;

      if (!req.file) {
        return res.status(400).json({ error: 'No image was included in the request.' });
      }

      const user = req.user!;
      const tenantId = requireTenantId(req);
      const spec = MEDIA_SPECS[kind];
      const column = COLUMN[kind];

      const stored = await this.mediaService.store(kind, tenantId, req.file.buffer);

      // Read the outgoing URL first so the replaced file can be cleaned up
      // only after the new one is safely persisted.
      let previous: string | null = null;

      if (spec.owner === 'tenant') {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        previous = (tenant as any)?.[column] ?? null;
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { [column]: stored.url },
        });
      } else {
        const record = await prisma.user.findUnique({ where: { id: user.userId } });
        previous = (record as any)?.[column] ?? null;
        await prisma.user.update({
          where: { id: user.userId },
          data: { [column]: stored.url },
        });
      }

      await this.mediaService.remove(previous);

      res.status(201).json({
        url: stored.url,
        url2x: stored.url2x,
        srcSet: srcSetFor(stored.url),
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
      });
    } catch (error: any) {
      console.error('Media upload error:', error);
      res.status(400).json({ error: error.message ?? 'That image could not be processed.' });
    }
  }

  private async deleteMedia(req: Request, res: Response) {
    try {
      const kind = this.authorize(req, res);
      if (!kind) return;

      const user = req.user!;
      const tenantId = requireTenantId(req);
      const spec = MEDIA_SPECS[kind];
      const column = COLUMN[kind];

      let previous: string | null = null;

      if (spec.owner === 'tenant') {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        previous = (tenant as any)?.[column] ?? null;
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { [column]: null },
        });
      } else {
        const record = await prisma.user.findUnique({ where: { id: user.userId } });
        previous = (record as any)?.[column] ?? null;
        await prisma.user.update({
          where: { id: user.userId },
          data: { [column]: null },
        });
      }

      await this.mediaService.remove(previous);

      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message ?? 'That image could not be removed.' });
    }
  }
}
