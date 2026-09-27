/**
 * Who "the team" is for TEAM scope (FR-RBAC-12, D4: one sales team). Read
 * only when a viewer's grant is TEAM, so OWN and ALL requests cost nothing.
 */
export interface ITeamRoster {
  /**
   * Every user of the tenant who holds the Sales User role — including a
   * deactivated one, whose companies stay the team's until reassigned.
   */
  salesUserIds(tenantId: string): Promise<string[]>;
}
