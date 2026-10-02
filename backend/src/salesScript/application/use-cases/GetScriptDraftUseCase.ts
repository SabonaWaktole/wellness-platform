import { AccessContext } from '../../../access/domain/AccessContext';
import { ISalesScriptStore } from '../ports/ISalesScriptStore';
import { EDIT_SCRIPT } from '../salesScriptAccess';
import { ScriptVersionView, scriptVersionView } from '../scriptViews';

/**
 * What the Administrator's editor opens on (FR-SCR-04): the draft if there is
 * one, and the published version, which the editor starts from otherwise.
 */
export class GetScriptDraftUseCase {
  constructor(private readonly store: ISalesScriptStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<{ draft: ScriptVersionView | null; published: ScriptVersionView | null }> {
    input.access.ensure(EDIT_SCRIPT);
    const [draft, published] = await Promise.all([this.store.draft(input.tenantId), this.store.published(input.tenantId)]);
    return { draft: draft && scriptVersionView(draft), published: published && scriptVersionView(published) };
  }
}
