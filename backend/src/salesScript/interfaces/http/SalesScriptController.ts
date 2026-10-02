import { NextFunction, Request, Response } from 'express';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { InvalidScriptError, NoScriptDraftError, SalesScriptConflictError, SalesScriptNotFoundError } from '../../domain/errors';
import { ScriptLanguage } from '../../domain/SalesScript';
import { GetPublishedScriptUseCase } from '../../application/use-cases/GetPublishedScriptUseCase';
import { GetScriptDraftUseCase } from '../../application/use-cases/GetScriptDraftUseCase';
import { SaveScriptDraftUseCase } from '../../application/use-cases/SaveScriptDraftUseCase';
import { PublishScriptUseCase } from '../../application/use-cases/PublishScriptUseCase';
import { ListScriptVersionsUseCase } from '../../application/use-cases/ListScriptVersionsUseCase';
import { GetScriptVersionUseCase } from '../../application/use-cases/GetScriptVersionUseCase';
import { RestoreScriptVersionUseCase } from '../../application/use-cases/RestoreScriptVersionUseCase';

/** Maps the sales script's errors to a status; anything else goes to the app's error handler. */
function sendScriptError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof SalesScriptNotFoundError) {
    return res.status(404).json({ error: error.message, code: error.code });
  }
  if (error instanceof InvalidScriptError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof NoScriptDraftError || error instanceof SalesScriptConflictError) {
    return res.status(409).json({ error: error.message, code: error.code });
  }
  return next(error);
}

const languageOf = (req: Request): ScriptLanguage => (req.query.lang === 'en' ? 'en' : 'sq');

/** A version number from the URL; anything else is a version that does not exist. */
const versionOf = (req: Request): number => {
  const version = Number(req.params.version);
  if (!Number.isSafeInteger(version) || version < 1) throw new SalesScriptNotFoundError();
  return version;
};

/**
 * The sales script panel and Settings → Sales script (M2 Slice 5). Parses,
 * calls one use case, maps the result. The script holds no commercial field,
 * so there is nothing to redact.
 */
export class SalesScriptController {
  constructor(
    private readonly getPublished: GetPublishedScriptUseCase,
    private readonly getDraft: GetScriptDraftUseCase,
    private readonly saveDraft: SaveScriptDraftUseCase,
    private readonly publishDraft: PublishScriptUseCase,
    private readonly listVersions: ListScriptVersionsUseCase,
    private readonly getVersion: GetScriptVersionUseCase,
    private readonly restoreVersion: RestoreScriptVersionUseCase
  ) {}

  private handle = (work: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ data: await work(req) });
    } catch (error) {
      sendScriptError(res, next, error);
    }
  };

  published = this.handle((req) =>
    this.getPublished.execute({ access: req.access!, tenantId: requireTenantId(req), language: languageOf(req) })
  );

  draft = this.handle((req) => this.getDraft.execute({ access: req.access!, tenantId: requireTenantId(req) }));

  save = this.handle((req) =>
    this.saveDraft.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      contentSq: req.body.contentSq,
      contentEn: req.body.contentEn,
    })
  );

  publish = this.handle((req) => this.publishDraft.execute({ access: req.access!, tenantId: requireTenantId(req) }));

  versions = this.handle((req) => this.listVersions.execute({ access: req.access!, tenantId: requireTenantId(req) }));

  version = this.handle((req) =>
    this.getVersion.execute({ access: req.access!, tenantId: requireTenantId(req), version: versionOf(req) })
  );

  restore = this.handle((req) =>
    this.restoreVersion.execute({ access: req.access!, tenantId: requireTenantId(req), version: versionOf(req) })
  );
}
