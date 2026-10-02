import { AccessContext } from '../../../access/domain/AccessContext';
import { SalesScriptStatus, ScriptAuthor } from '../../domain/SalesScript';
import { ISalesScriptStore } from '../ports/ISalesScriptStore';
import { EDIT_SCRIPT } from '../salesScriptAccess';

export interface ScriptVersionSummary {
  version: number;
  status: SalesScriptStatus;
  publishedAt: Date | null;
  publishedBy: ScriptAuthor | null;
}

/**
 * Every published version, newest first, with who published it and when
 * (FR-SCR-05), and the draft in progress, if any.
 */
export class ListScriptVersionsUseCase {
  constructor(private readonly store: ISalesScriptStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<{
    versions: ScriptVersionSummary[];
    draft: { version: number; updatedAt: Date; createdBy: ScriptAuthor | null } | null;
  }> {
    input.access.ensure(EDIT_SCRIPT);
    const [versions, draft] = await Promise.all([this.store.publishedVersions(input.tenantId), this.store.draft(input.tenantId)]);
    return {
      versions: versions.map(({ version, status, publishedAt, publishedBy }) => ({ version, status, publishedAt, publishedBy })),
      draft: draft && { version: draft.version, updatedAt: draft.updatedAt, createdBy: draft.createdBy },
    };
  }
}
