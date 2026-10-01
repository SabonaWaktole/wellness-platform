import { AccessContext } from '../../../access/domain/AccessContext';
import { SalesScriptNotFoundError } from '../../domain/errors';
import { ISalesScriptStore } from '../ports/ISalesScriptStore';
import { EDIT_SCRIPT } from '../salesScriptAccess';
import { ScriptVersionView, scriptVersionView } from '../scriptViews';

/** One version, in both languages, for the Administrator to look back at (FR-SCR-05). */
export class GetScriptVersionUseCase {
  constructor(private readonly store: ISalesScriptStore) {}

  async execute(input: { access: AccessContext; tenantId: string; version: number }): Promise<ScriptVersionView> {
    input.access.ensure(EDIT_SCRIPT);
    const script = await this.store.version(input.tenantId, input.version);
    if (!script) throw new SalesScriptNotFoundError();
    return scriptVersionView(script);
  }
}
