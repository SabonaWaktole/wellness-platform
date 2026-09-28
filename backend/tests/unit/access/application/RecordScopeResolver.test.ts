import { RecordScopeResolver } from '../../../../src/access/application/RecordScopeResolver';
import { ITeamRoster } from '../../../../src/access/application/ports/ITeamRoster';
import { administrator, salesManager, salesUser } from '../../../support/access';

describe('RecordScopeResolver', () => {
  const roster: jest.Mocked<ITeamRoster> = { salesUserIds: jest.fn().mockResolvedValue(['sales-a', 'sales-b']) };
  const resolver = new RecordScopeResolver(roster);

  it('FR-RBAC-12 reads the Sales User roster of the viewer\'s tenant for a TEAM grant', async () => {
    const scope = await resolver.resolve(salesManager({ userId: 'mgr', tenantId: 't9' }), 'companies.view');

    expect(roster.salesUserIds).toHaveBeenCalledWith('t9');
    expect(scope).toEqual({ kind: 'owners', userIds: ['sales-a', 'sales-b', 'mgr'], includeUnowned: true });
  });

  it('does not touch the roster for OWN or ALL', async () => {
    await resolver.resolve(salesUser({ userId: 'sales-a' }), 'companies.view');
    await resolver.resolve(administrator(), 'companies.view');

    expect(roster.salesUserIds).not.toHaveBeenCalled();
  });
});
