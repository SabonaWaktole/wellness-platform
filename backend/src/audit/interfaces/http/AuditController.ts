import { NextFunction, Request, Response } from 'express';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { SearchAuditEntriesUseCase } from '../../application/use-cases/SearchAuditEntriesUseCase';
import { GetAuditEntryUseCase } from '../../application/use-cases/GetAuditEntryUseCase';
import { ExportAuditEntriesUseCase } from '../../application/use-cases/ExportAuditEntriesUseCase';
import { AuditEntryNotFoundError } from '../../domain/errors';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { auditExportQuerySchema, auditQuerySchema } from './auditSchemas';
import { csvRow, UTF8_BOM } from '../../../shared/infrastructure/csv/csvWriter';
import { AuditEntryView } from '../../application/ports/IAuditEntryReader';

const CSV_HEADER = ['at', 'user', 'role', 'action', 'entityType', 'entityId', 'entityLabel', 'field', 'old', 'new'];

/** Maps the audit module's errors to a status; anything else goes to the app's error handler. */
function sendAuditError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof AuditEntryNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  if ((error as { name?: string })?.name === 'ZodError') {
    return res.status(400).json({ error: (error as { errors?: unknown }).errors ?? (error as Error).message });
  }
  return next(error);
}

/** A cell value from an AuditChange, stringified for CSV: objects/arrays as compact JSON. */
function csvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** One or more CSV rows for an entry: one per changed field, or one bare row when it has none. */
function csvRowsFor(entry: AuditEntryView): string {
  const actor = entry.userId === null ? 'System' : (entry.userName ?? entry.userId);
  const common = [entry.at.toISOString(), actor, entry.roleNameEn ?? entry.userRole, entry.action, entry.entityType, entry.entityId, entry.entityLabel ?? ''];
  if (entry.changes.length === 0) {
    return csvRow([...common, '', '', '']);
  }
  return entry.changes.map((change) => csvRow([...common, change.field, csvValue(change.old), csvValue(change.new)])).join('');
}

/** The audit log viewer (Slice 7): search, one entry's detail, and the CSV export. */
export class AuditController {
  constructor(
    private readonly searchEntries: SearchAuditEntriesUseCase,
    private readonly getEntry: GetAuditEntryUseCase,
    private readonly exportEntries: ExportAuditEntriesUseCase
  ) {}

  search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = auditQuerySchema.parse(req.query);
      const result = await this.searchEntries.execute({ access: req.access!, tenantId: requireTenantId(req), query });
      res.status(200).json(result);
    } catch (error) {
      sendAuditError(res, next, error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await this.getEntry.execute({ access: req.access!, tenantId: requireTenantId(req), id: req.params.id as string });
      res.status(200).json({ entry });
    } catch (error) {
      sendAuditError(res, next, error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = auditExportQuerySchema.parse(req.query);
      const batches = this.exportEntries.execute({ access: req.access!, tenantId: requireTenantId(req), filter });

      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.write(UTF8_BOM + csvRow(CSV_HEADER));
      for await (const batch of batches) {
        for (const entry of batch) {
          res.write(csvRowsFor(entry));
        }
      }
      res.end();
    } catch (error) {
      sendAuditError(res, next, error);
    }
  };
}
