import { AccessContext } from '../../access/domain/AccessContext';
import { AuditAction } from '../../audit/domain/AuditAction';
import { AuditChange } from '../../audit/domain/AuditChange';
import { AuditEntry } from '../../audit/domain/AuditEntry';
import { StatusDomain } from '../domain/StatusCatalogue';
import { StatusLabel } from '../domain/StatusLabel';

/** Every write to a status label needs this (FR-SET-07, 08), same permission the lookup lists use. */
export const MANAGE_STATUSES = 'settings.manage';

/**
 * The deal stages are also managed under the "Activity results, stage labels"
 * row of the role matrix (SRS §9.2, M2 Slice 6), so either key edits them.
 * Contract and payment labels stay `settings.manage` only.
 */
export const MANAGE_DEAL_STAGES = 'activityResults.manage';

/** Every key that can edit some status domain: what the write routes let through. */
export const STATUS_EDIT_KEYS = [MANAGE_STATUSES, MANAGE_DEAL_STAGES];

/** Throws `PermissionDeniedError` unless `access` may edit `domain`'s labels. */
export function ensureCanManage(access: AccessContext, domain: StatusDomain): void {
  if (domain === StatusDomain.Deal && access.can(MANAGE_DEAL_STAGES)) return;
  access.ensure(MANAGE_STATUSES);
}

export function statusLabelAuditEntry(
  access: AccessContext,
  tenantId: string,
  domain: StatusDomain,
  item: StatusLabel,
  action: AuditAction,
  changes: AuditChange[]
): AuditEntry {
  return {
    tenantId,
    userId: access.userId,
    userRole: access.auditRole,
    action,
    entityType: 'StatusLabel',
    entityId: `${domain}:${item.key}`,
    entityLabel: item.labelSq,
    changes,
  };
}
