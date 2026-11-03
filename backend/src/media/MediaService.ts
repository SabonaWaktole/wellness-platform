import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp, { type Metadata } from 'sharp';

// libvips otherwise starts a worker thread per CPU core, and shared hosts
// report dozens of cores while capping the account at 120 threads in total.
// Uploads are a few small images at a time, so one thread costs nothing
// noticeable. The operation cache only holds memory for repeated work on the
// same input, which this pipeline never does.
sharp.concurrency(1);
sharp.cache(false);

/**
 * Media pipeline for profile photos and workspace branding.
 *
 * Everything is re-encoded to WebP through sharp, which does three jobs at
 * once: it strips EXIF (including GPS coordinates from phone photos), it
 * neutralises anything that is not actually an image no matter what the
 * client claimed the MIME type was, and it cuts the file size substantially.
 *
 * Two variants are written per upload — @1x and @2x — so the frontend can
 * serve a sharp image on retina displays without shipping a huge file to
 * everyone else. Only the @1x URL is stored; @2x is derived by convention
 * (see `srcSetFor`), which keeps the database column a single plain string.
 */

export type MediaKind = 'logo' | 'company-cover' | 'avatar' | 'user-cover';

/** Output geometry for a rendition pair. */
export interface RenditionSpec {
  /** Longest edge of the @1x variant, in CSS pixels. */
  width: number;
  height: number;
  /** `cover` crops to fill; `contain` letterboxes onto transparency. */
  fit: 'cover' | 'contain';
}

interface MediaSpec extends RenditionSpec {
  /** Which entity the resulting URL is written to. */
  owner: 'tenant' | 'user';
}

export const MEDIA_SPECS: Record<MediaKind, MediaSpec> = {
  // Logos are art-directed by the uploader, so never crop them — fit inside
  // the box and keep the transparent surround.
  logo: { width: 256, height: 256, fit: 'contain', owner: 'tenant' },
  'company-cover': { width: 1600, height: 400, fit: 'cover', owner: 'tenant' },
  avatar: { width: 256, height: 256, fit: 'cover', owner: 'user' },
  'user-cover': { width: 1600, height: 400, fit: 'cover', owner: 'user' },
};

export const isMediaKind = (value: string): value is MediaKind =>
  Object.prototype.hasOwnProperty.call(MEDIA_SPECS, value);

/** Accepted input types. The output is always WebP regardless. */
export const ACCEPTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/** Absolute path to the on-disk store. Overridable for tests/deployments. */
export const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), 'uploads');

/** Public URL prefix that `express.static` is mounted on. */
const PUBLIC_PREFIX = '/uploads';

export interface StoredMedia {
  /** Public URL of the @1x asset — this is what gets persisted. */
  url: string;
  /** Public URL of the @2x asset, for srcset. */
  url2x: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Given a stored @1x URL, produce a `srcset` value. Kept next to the writer so
 * the naming convention has exactly one definition.
 */
export const srcSetFor = (url: string): string =>
  `${url} 1x, ${url.replace(/@1x\.webp$/, '@2x.webp')} 2x`;

export class MediaService {
  /**
   * Re-encodes `buffer` and writes both variants under the tenant's folder.
   * Throws if the buffer is not a decodable image.
   */
  async store(kind: MediaKind, tenantId: string, buffer: Buffer): Promise<StoredMedia> {
    return this.storeImage(MEDIA_SPECS[kind], kind, tenantId, buffer);
  }

  /**
   * The rendition pipeline itself, independent of the four profile/branding
   * kinds. Callers outside this module — product galleries, for instance —
   * bring their own geometry and filename prefix and get the same EXIF
   * stripping, format neutralisation and WebP compression.
   */
  async storeImage(
    spec: RenditionSpec,
    prefix: string,
    tenantId: string,
    buffer: Buffer
  ): Promise<StoredMedia> {
    const dir = path.join(UPLOADS_DIR, tenantId);
    await fs.mkdir(dir, { recursive: true });

    // A random basename means a replaced image never collides with a cached
    // copy of the old one, so no cache-busting query string is needed.
    const base = `${prefix}-${crypto.randomUUID()}`;

    // Validate by decoding rather than by trusting the declared MIME type.
    let meta: Metadata;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      throw new Error('That file could not be read as an image.');
    }
    if (!meta.width || !meta.height) {
      throw new Error('That file could not be read as an image.');
    }

    const render = async (scale: 1 | 2) => {
      const filename = `${base}@${scale}x.webp`;
      const outPath = path.join(dir, filename);
      const info = await sharp(buffer)
        .rotate() // honour EXIF orientation before it is stripped
        .resize({
          width: spec.width * scale,
          height: spec.height * scale,
          fit: spec.fit,
          // Never upscale a small source into a blurry large file.
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: scale === 1 ? 82 : 74 })
        .toFile(outPath);
      return { filename, info };
    };

    const [one, two] = await Promise.all([render(1), render(2)]);

    return {
      url: `${PUBLIC_PREFIX}/${tenantId}/${one.filename}`,
      url2x: `${PUBLIC_PREFIX}/${tenantId}/${two.filename}`,
      width: one.info.width,
      height: one.info.height,
      bytes: one.info.size,
    };
  }

  /**
   * Best-effort removal of a previously stored asset and its @2x sibling.
   *
   * Deliberately never throws: a missing file must not fail the request that
   * is replacing or clearing the image, and the database is the source of
   * truth for whether an image "exists".
   */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url || !url.startsWith(`${PUBLIC_PREFIX}/`)) return;

    const relative = url.slice(PUBLIC_PREFIX.length + 1);
    const resolved = path.resolve(UPLOADS_DIR, relative);

    // Path-traversal guard: refuse anything that escapes the uploads root.
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) return;

    const siblings = [resolved, resolved.replace(/@1x\.webp$/, '@2x.webp')];
    await Promise.all(
      siblings.map((file) => fs.unlink(file).catch(() => undefined))
    );
  }
}
