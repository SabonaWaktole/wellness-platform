import { AccessContext } from '../../access/domain/AccessContext';
import { AuditAction } from '../../audit/domain/AuditAction';
import { AuditChange } from '../../audit/domain/AuditChange';
import { AuditEntry } from '../../audit/domain/AuditEntry';
import { StatusDomain } from '../domain/StatusCatalogue';
import { StatusLabel } from '../domain/StatusLabel';

/** Every write to a status label needs this (FR-SET-07, 08), same permission the lookup lists use. */
export const MANAGE_STATUSES = 'settings.manage';

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
