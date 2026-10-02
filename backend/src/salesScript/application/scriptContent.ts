import { InvalidRichTextError, sanitizeRichText } from '../../shared/application/richText/sanitizeRichText';
import { InvalidScriptError } from '../domain/errors';
import { EMPTY_SCRIPT } from '../domain/SalesScript';
import { ScriptContent } from './ports/ISalesScriptWriteTransaction';

/**
 * Both languages of a script as they will be stored (NFR-SEC-05): each goes
 * through the shared sanitiser, so a `<script>` tag or a `javascript:` link
 * never reaches the database. An empty Albanian text is kept as an empty
 * document, which can be saved but not published.
 */
export function sanitizeScriptContent(input: { contentSq: unknown; contentEn: unknown }): ScriptContent {
  const sanitize = (field: 'contentSq' | 'contentEn', value: unknown) => {
    try {
      return sanitizeRichText(value);
    } catch (error) {
      if (error instanceof InvalidRichTextError) throw new InvalidScriptError('INVALID_RICH_TEXT', field, error.message);
      throw error;
    }
  };
  return {
    contentSq: sanitize('contentSq', input.contentSq) ?? EMPTY_SCRIPT,
    contentEn: sanitize('contentEn', input.contentEn),
  };
}
