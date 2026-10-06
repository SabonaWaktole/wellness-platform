import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { UPLOADS_DIR } from '../../media/MediaService';

/**
 * On-disk storage for signed contract documents.
 *
 * Deliberately NOT MediaService. That pipeline exists to re-encode images
 * through sharp — stripping EXIF, neutralising anything that is not really an
 * image, emitting WebP. A signed contract is the opposite requirement: it must
 * come back out byte-for-byte identical to what was uploaded, because it is a
 * legal record. Running it through an image encoder would either destroy it or
 * refuse it.
 *
 * What this shares with MediaService is where files live (`UPLOADS_DIR`, under
 * the tenant's own folder, served by the same `express.static` mount) and the
 * random-basename convention, so a replaced document never collides with a
 * cached copy of the old one.
 */

/** Public URL prefix that `express.static` is mounted on. Mirrors MediaService. */
const PUBLIC_PREFIX = '/uploads';

/**
 * PDF only, and checked by MAGIC BYTES rather than by the declared MIME type.
 *
 * A browser will happily claim `application/pdf` for anything, and the file
 * lands on a disk that is served back to browsers. Restricting to one format
 * whose signature is trivially verifiable is what makes serving these files
 * safe without an encoder in the path. Everything served from `/uploads`
 * already carries `X-Content-Type-Options: nosniff`, so a file that is not
 * what it claims cannot be re-interpreted as script by a viewer.
 */
const PDF_MAGIC = Buffer.from('%PDF-');

export const CONTRACT_DOC_MIME = ['application/pdf'];
export const MAX_CONTRACT_DOC_BYTES = 15 * 1024 * 1024; // 15 MB

export interface StoredDocument {
  /** Public URL, persisted on Contract.documentUrl. */
  url: string;
  /** Original filename, persisted on Contract.documentName. */
  name: string;
  bytes: number;
}

export class ContractDocumentStore {
  async store(tenantId: string, originalName: string, buffer: Buffer): Promise<StoredDocument> {
    if (!buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new Error('That file is not a PDF.');
    }

    const dir = path.join(UPLOADS_DIR, tenantId);
    await fs.mkdir(dir, { recursive: true });

    const filename = `contract-${crypto.randomUUID()}.pdf`;
    await fs.writeFile(path.join(dir, filename), buffer);

    return {
      url: `${PUBLIC_PREFIX}/${tenantId}/${filename}`,
      // Sanitised: the stored name is only ever echoed back as a download
      // filename, and a name carrying path separators or quotes is how a
      // Content-Disposition header gets broken.
      name: originalName.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'contract.pdf',
      bytes: buffer.byteLength,
    };
  }

  /**
   * The stored bytes, for the download endpoint. The path is resolved under the
   * uploads root and refused if it escapes it, like `remove`.
   */
  async read(url: string): Promise<Buffer | null> {
    if (!url.startsWith(`${PUBLIC_PREFIX}/`)) return null;
    const resolved = path.resolve(UPLOADS_DIR, url.slice(PUBLIC_PREFIX.length + 1));
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) return null;
    return fs.readFile(resolved).catch(() => null);
  }

  /**
   * Best-effort removal, never throws — same contract as `MediaService.remove`
   * and for the same reason: a missing file must not fail the request that is
   * replacing it, and the database is the source of truth for what exists.
   */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url || !url.startsWith(`${PUBLIC_PREFIX}/`)) return;

    const relative = url.slice(PUBLIC_PREFIX.length + 1);
    const resolved = path.resolve(UPLOADS_DIR, relative);

    // Path-traversal guard: refuse anything that escapes the uploads root.
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) return;

    await fs.unlink(resolved).catch(() => undefined);
  }
}
