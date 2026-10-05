import { runDailyJob } from './dailyJob';

const queriesFor = (...tenants: { id: string; timeZone: string }[]) => ({ listTenants: async () => tenants });

describe('NFR-REL-01 daily job helper', () => {
  it('isolates a failing workspace: the others still run and the failure is counted', async () => {
    const seen: string[] = [];
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await runDailyJob(
      queriesFor({ id: 'a', timeZone: 'UTC' }, { id: 'b', timeZone: 'UTC' }, { id: 'c', timeZone: 'UTC' }),
      new Date('2026-06-15T10:00:00Z'),
      async ({ tenant }) => {
        seen.push(tenant.id);
        if (tenant.id === 'b') throw new Error('boom');
        return 2;
      }
    );

    errors.mockRestore();
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ processed: 4, failedTenants: 1 });
  });

  it('works out each workspace\'s own day: Europe/Tirane at 23:30 and 00:30 around a date change', async () => {
    const days = async (now: string) => {
      const out: Record<string, string> = {};
      await runDailyJob(
        queriesFor({ id: 'tirane', timeZone: 'Europe/Tirane' }, { id: 'utc', timeZone: 'UTC' }),
        new Date(now),
        async ({ tenant, today, todayKey }) => {
          out[tenant.id] = todayKey;
          expect(today.toISOString()).toBe(`${todayKey}T00:00:00.000Z`);
          return 0;
        }
      );
      return out;
    };

    // Winter: Tirane is UTC+1. 22:30Z is 23:30 on the 14th there; 23:30Z is 00:30 on the 15th.
    expect(await days('2026-01-14T22:30:00Z')).toEqual({ tirane: '2026-01-14', utc: '2026-01-14' });
    expect(await days('2026-01-14T23:30:00Z')).toEqual({ tirane: '2026-01-15', utc: '2026-01-14' });
    // Summer: Tirane is UTC+2.
    expect(await days('2026-07-14T21:30:00Z')).toEqual({ tirane: '2026-07-14', utc: '2026-07-14' });
    expect(await days('2026-07-14T22:30:00Z')).toEqual({ tirane: '2026-07-15', utc: '2026-07-14' });
  });
});
