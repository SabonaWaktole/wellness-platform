import { z } from 'zod';
import { AuditAction } from '../../domain/AuditAction';
import { AUDITED_ENTITY_TYPES } from '../../domain/AuditQuery';

/**
 * The viewer's search filter, parsed from the query string (FR-AUD-06). Dates
 * arrive as ISO instants — the frontend converts the tenant-local day picked
 * to an instant before it asks, same convention as `contractSchemas`'
 * `dateString`, just already-coerced here since there is no date-only case.
 */
export const auditQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  userId: z.string().min(1).optional(),
  entityType: z.enum(AUDITED_ENTITY_TYPES).optional(),
  action: z.nativeEnum(AuditAction).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** The export shares the same filter, without paging (FR-AUD-08). */
export const auditExportQuerySchema = auditQuerySchema.omit({ page: true, limit: true });
