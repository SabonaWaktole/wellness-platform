import { ownerWhere } from '../../../../src/access/infrastructure/prismaRecordScope';

describe('ownerWhere', () => {
  it('ALL adds no condition', () => {
    expect(ownerWhere({ kind: 'all' }, 'assignedUserId')).toEqual({});
  });

  it('none matches no row', () => {
    expect(ownerWhere({ kind: 'none' }, 'assignedUserId')).toEqual({ id: { in: [] } });
  });

  it('OWN-style owners match the listed owners only', () => {
    expect(ownerWhere({ kind: 'owners', userIds: ['u1'], includeUnowned: false }, 'assignedUserId')).toEqual({
      assignedUserId: { in: ['u1'] },
    });
  });

  it('TEAM-style owners also match unowned rows', () => {
    expect(ownerWhere({ kind: 'owners', userIds: ['u1', 'u2'], includeUnowned: true }, 'assignedUserId')).toEqual({
      OR: [{ assignedUserId: { in: ['u1', 'u2'] } }, { assignedUserId: null }],
    });
  });

  it('drops the unowned branch for a column that can never be null', () => {
    expect(
      ownerWhere({ kind: 'owners', userIds: ['u1'], includeUnowned: true }, 'assignedUserId', { nullable: false })
    ).toEqual({ assignedUserId: { in: ['u1'] } });
  });
});
