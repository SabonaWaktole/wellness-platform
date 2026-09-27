import { AccessContext } from '../domain/AccessContext';
import { PermissionScope } from '../domain/PermissionScope';
import { RecordScope, recordScopeFor } from '../domain/RecordScope';
import { ITeamRoster } from './ports/ITeamRoster';

/**
 * Resolves the `RecordScope` a use case hands its repository (FR-RBAC-11..13).
 * The domain rule is `recordScopeFor`; this only fetches the Sales User
 * roster it needs for a TEAM grant.
 */
export class RecordScopeResolver {
  constructor(private readonly roster: ITeamRoster) {}

  async resolve(access: AccessContext, key: string): Promise<RecordScope> {
    const team =
      access.scopeOf(key) === PermissionScope.Team ? await this.roster.salesUserIds(access.tenantId) : [];
    return recordScopeFor(access, key, team);
  }
}
