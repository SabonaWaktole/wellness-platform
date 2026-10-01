import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { AuditChange } from '../../../audit/domain/AuditChange';
import { richTextPlainText } from '../../../shared/application/richText/sanitizeRichText';
import { InvalidScriptError, NoScriptDraftError } from '../../domain/errors';
import { ISalesScriptWriteTransaction } from '../ports/ISalesScriptWriteTransaction';
import { EDIT_SCRIPT } from '../salesScriptAccess';
import { ScriptVersionView, scriptVersionView } from '../scriptViews';

/**
 * Publishes the draft (FR-SCR-04, FR-SCR-05): salespeople see it from now
 * on, and the version it replaces is kept as SUPERSEDED with its author and
 * date. One audit entry, in the same transaction, carries the version and
 * the text in each language that changed, as plain text (FR-AUD-09).
 */
export class PublishScriptUseCase {
  constructor(private readonly writeTx: ISalesScriptWriteTransaction) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<ScriptVersionView> {
    input.access.ensure(EDIT_SCRIPT);

    return this.writeTx.run(async ({ scripts, auditTrail }) => {
      const draft = await scripts.draft(input.tenantId);
      if (!draft) throw new NoScriptDraftError();
      if (!richTextPlainText(draft.contentSq)) {
        throw new InvalidScriptError('SCRIPT_EMPTY', 'contentSq', 'The Albanian text is empty. Write it before publishing.');
      }

      const previous = await scripts.published(input.tenantId);
      // In this order: (tenantId, liveSlot) is unique, so the old version
      // leaves the published slot before the draft takes it.
      if (previous) await scripts.supersede(input.tenantId, previous.id);
      await scripts.publish(input.tenantId, draft.id, { publishedByUserId: input.access.userId, publishedAt: new Date() });

      const changes: AuditChange[] = [{ field: 'version', old: previous?.version ?? null, new: draft.version }];
      for (const field of ['contentSq', 'contentEn'] as const) {
        const old = richTextPlainText(previous?.[field] ?? null);
        const next = richTextPlainText(draft[field]);
        if (old !== next) changes.push({ field, old, new: next });
      }
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.StatusChange,
        // One script per workspace: its history reads as one record.
        entityType: 'SalesScript',
        entityId: input.tenantId,
        entityLabel: `v${draft.version}`,
        changes,
      });

      return scriptVersionView((await scripts.published(input.tenantId))!);
    });
  }
}
