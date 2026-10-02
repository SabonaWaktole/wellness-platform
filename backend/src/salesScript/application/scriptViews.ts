import type { RichTextDoc } from '../../shared/domain/richText';
import { SalesScriptStatus, SalesScriptVersion, ScriptAuthor } from '../domain/SalesScript';

/** A version as the Administrator's editor sees it: both languages. */
export interface ScriptVersionView {
  version: number;
  status: SalesScriptStatus;
  contentSq: RichTextDoc;
  contentEn: RichTextDoc | null;
  createdBy: ScriptAuthor | null;
  updatedAt: Date;
  publishedAt: Date | null;
  publishedBy: ScriptAuthor | null;
}

export const scriptVersionView = (script: SalesScriptVersion): ScriptVersionView => ({
  version: script.version,
  status: script.status,
  contentSq: script.contentSq,
  contentEn: script.contentEn,
  createdBy: script.createdBy,
  updatedAt: script.updatedAt,
  publishedAt: script.publishedAt,
  publishedBy: script.publishedBy,
});
