import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { ISalesScriptWriteTransaction } from '../ports/ISalesScriptWriteTransaction';
import { EDIT_SCRIPT } from '../salesScriptAccess';
import { sanitizeScriptContent } from '../scriptContent';
import { ScriptVersionView, scriptVersionView } from '../scriptViews';

/**
 * Saves the Administrator's work without publishing it (FR-SCR-04): what
 * salespeople read does not change. Edits the draft, or starts one as the
 * next version. Both languages are sanitised first (NFR-SEC-05). A draft is
 * not audited; its publish is (FR-AUD-09).
 */
export class SaveScriptDraftUseCase {
  constructor(private readonly writeTx: ISalesScriptWriteTransaction) {}

  async execute(input: { access: AccessContext; tenantId: string; contentSq: unknown; contentEn: unknown }): Promise<ScriptVersionView> {
    input.access.ensure(EDIT_SCRIPT);
    const content = sanitizeScriptContent(input);

    return this.writeTx.run(async ({ scripts }) => {
      const draft = await scripts.draft(input.tenantId);
      if (draft) {
        await scripts.updateDraft(input.tenantId, draft.id, content);
      } else {
        await scripts.createDraft(input.tenantId, {
          id: randomUUID(),
          version: (await scripts.latestVersion(input.tenantId)) + 1,
          createdByUserId: input.access.userId,
          ...content,
        });
      }
      return scriptVersionView((await scripts.draft(input.tenantId))!);
    });
  }
}
