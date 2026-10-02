import type { RichTextDoc } from '../../shared/domain/richText';

/**
 * A version of the workspace sales script (FR-SCR-03..06). At most one DRAFT,
 * which the Administrator edits, and one PUBLISHED, which salespeople read;
 * publishing supersedes the previous version, which is kept with its author
 * and date (FR-SCR-05).
 */
export enum SalesScriptStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED',
  Superseded = 'SUPERSEDED',
}

export const SCRIPT_LANGUAGES = ['sq', 'en'] as const;
export type ScriptLanguage = (typeof SCRIPT_LANGUAGES)[number];

/** A user named on a version: who created or published it. */
export interface ScriptAuthor {
  id: string;
  name: string;
}

export interface SalesScriptVersion {
  id: string;
  version: number;
  status: SalesScriptStatus;
  contentSq: RichTextDoc;
  contentEn: RichTextDoc | null;
  createdBy: ScriptAuthor | null;
  updatedAt: Date;
  publishedAt: Date | null;
  publishedBy: ScriptAuthor | null;
}

/** An empty document: a draft whose Albanian text was cleared. It cannot be published. */
export const EMPTY_SCRIPT: RichTextDoc = { type: 'doc', content: [] };

/**
 * The text a salesperson reads (FR-SCR-04): theirs in their language, or the
 * Albanian text when the English one is empty. `language` is the one shown.
 */
export function scriptInLanguage(
  script: Pick<SalesScriptVersion, 'contentSq' | 'contentEn'>,
  language: ScriptLanguage
): { language: ScriptLanguage; content: RichTextDoc } {
  if (language === 'en' && script.contentEn && script.contentEn.content.length > 0) {
    return { language: 'en', content: script.contentEn };
  }
  return { language: 'sq', content: script.contentSq };
}
