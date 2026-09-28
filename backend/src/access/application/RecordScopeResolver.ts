import { AccessContext } from '../domain/AccessContext';
import { PermissionScope } from '../domain/PermissionScope';
import { effectiveScope, RecordScope, recordScopeFor } from '../domain/RecordScope';
import { ITeamRoster } from './ports/ITeamRoster';

/**
 * Resolves the `RecordScope` a use case hands its repository (FR-RBAC-11..13).
 * The domain rule is `recordScopeFor`; this only fetches the Sales User
 * roster it needs for a TEAM grant.
 */
export class RecordScopeResolver {
  constructor(private readonly roster: ITeamRoster) {}

  async resolve(access: AccessContext, key: string, narrowTo?: PermissionScope): Promise<RecordScope> {
    const team =
      access.can(key) && effectiveScope(access.scopeOf(key), narrowTo) === PermissionScope.Team
        ? await this.roster.salesUserIds(access.tenantId)
        : [];
    return recordScopeFor(access, key, team, narrowTo);
  }
}
