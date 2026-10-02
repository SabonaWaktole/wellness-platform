import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { SalesScriptNotFoundError } from '../../domain/errors';
import { ISalesScriptWriteTransaction } from '../ports/ISalesScriptWriteTransaction';
import { EDIT_SCRIPT } from '../salesScriptAccess';
import { ScriptVersionView, scriptVersionView } from '../scriptViews';

/**
 * Copies an earlier version into the draft (FR-SCR-06): the draft in
 * progress takes its text, or a new draft starts with it. Nothing changes
 * for salespeople until the draft is published.
 */
export class RestoreScriptVersionUseCase {
  constructor(private readonly writeTx: ISalesScriptWriteTransaction) {}

  async execute(input: { access: AccessContext; tenantId: string; version: number }): Promise<ScriptVersionView> {
    input.access.ensure(EDIT_SCRIPT);

    return this.writeTx.run(async ({ scripts }) => {
      const source = await scripts.version(input.tenantId, input.version);
      if (!source) throw new SalesScriptNotFoundError();
      const content = { contentSq: source.contentSq, contentEn: source.contentEn };

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
