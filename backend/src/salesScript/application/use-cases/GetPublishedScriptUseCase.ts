import { AccessContext } from '../../../access/domain/AccessContext';
import type { RichTextDoc } from '../../../shared/domain/richText';
import { SalesScriptNotFoundError } from '../../domain/errors';
import { ScriptLanguage, scriptInLanguage } from '../../domain/SalesScript';
import { ScriptSection, scriptSections } from '../../domain/scriptSections';
import { ISalesScriptStore } from '../ports/ISalesScriptStore';
import { VIEW_SCRIPT } from '../salesScriptAccess';

export interface PublishedScriptView {
  version: number;
  publishedAt: Date | null;
  /** The language shown: Albanian when English was asked for but is empty. */
  language: ScriptLanguage;
  content: RichTextDoc;
  sections: ScriptSection[];
}

/**
 * The script salespeople read in the panel (FR-SCR-03, FR-SCR-04): the
 * published version only, the same for everyone, in the reader's language,
 * with its section headings for the clickable list.
 */
export class GetPublishedScriptUseCase {
  constructor(private readonly store: ISalesScriptStore) {}

  async execute(input: { access: AccessContext; tenantId: string; language: ScriptLanguage }): Promise<PublishedScriptView> {
    input.access.ensure(VIEW_SCRIPT);
    const script = await this.store.published(input.tenantId);
    if (!script) throw new SalesScriptNotFoundError();
    const { language, content } = scriptInLanguage(script, input.language);
    return { version: script.version, publishedAt: script.publishedAt, language, content, sections: scriptSections(content) };
  }
}
