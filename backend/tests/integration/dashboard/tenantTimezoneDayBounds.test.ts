import request from 'supertest';
import { createApp } from '../../../src/main/app';
import { PrismaClient } from '@prisma/client';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { ClientStatus } from '../../../src/clients/domain/enums/ClientStatus';
import { dayKeyInZone, dayBoundsInZone } from '../../../src/shared/domain/time/tenantDay';
import { v4 as uuidv4 } from 'uuid';

/**
 * The dashboard KPI and the calendar must agree about what day it is.
 *
 * Before this, they could not: the KPI bucketed by `new Date(); setHours(0,0,0,0)`
 * — the SERVER HOST's timezone — while the calendar bucketed by the BROWSER's.
 * With the host on UTC+3 and a user on UTC+2, a 21:30Z appointment was counted
 * "today" by the KPI and drawn on the following day by the calendar.
 *
 * Expectations here are DERIVED from `dayBoundsInZone` rather than hard-coded
 * to wall-clock times. A first attempt at this file used fixed UTC hours and
 * passed or failed depending on what time of day the suite ran — the test was
 * wrong, not the fix. Deriving from the zone's own bounds makes each case true
 * at every hour, and makes the assertion the real property: the count must
 * follow the tenant's configured zone and nothing else.
 *
 * The frontend half of the same guarantee is in `frontend/src/utils/tenantDay.test.ts`.
 */
describe('Dashboard metrics use the tenant timezone for day bounds', () => {
  let app: any;
  let prisma: PrismaClient;
  let tokenService: JwtTokenService;

  const runId = uuidv4().slice(0, 8);
  const slug = `tzday-${runId}`;

  let tenantId: string;
  let ownerId: string;
  let clientId: string;
  let ownerToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    app = createApp();
    tokenService = new JwtTokenService();
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const setup = async (timezone: string) => {
    tenantId = uuidv4();
    ownerId = uuidv4();
    clientId = uuidv4();

    await prisma.tenant.create({
      data: { id: tenantId, name: 'TZ Day', urlSlug: slug, timezone },
    });
    await prisma.user.create({
      data: { id: ownerId, email: `owner-${runId}@t.com`, hashedPassword: 'x', role: 'BUSINESS_OWNER', tenantId },
    });
    await prisma.client.create({
      data: {
        id: clientId, tenantId, name: 'TZ Client', status: ClientStatus.CLIENT,
        lastUpdatedByUserId: ownerId, customFieldValues: {},
      },
    });

    ownerToken = tokenService.sign({
      userId: ownerId, role: 'BUSINESS_OWNER', tenantId, tenantSlug: slug, warehouseId: null,
    });
  };

  const cleanup = async () => {
    await prisma.appointment.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  };

  const metrics = () =>
    request(app).get(`/api/${slug}/dashboard/metrics`).set('Cookie', [`jwt=${ownerToken}`]);

  const seedAppointment = (at: Date) =>
    prisma.appointment.create({
      data: {
        id: uuidv4(), tenantId, clientId, assignedUserId: ownerId,
        scheduledAt: at, status: 'SCHEDULED',
      },
    });

  afterEach(cleanup);

  /** Zones spanning a wide offset range, so at least one differs from any host. */
  const ZONES = ['UTC', 'Europe/Tirane', 'America/New_York', 'Asia/Tokyo'];

  describe('an appointment inside the tenant day is counted', () => {
    it.each(ZONES)('%s', async (zone) => {
      const { start } = dayBoundsInZone(zone, 0);
      // Noon in the tenant's zone: unambiguously inside its day, whatever the
      // host zone or the hour the suite runs at.
      const at = new Date(start.getTime() + 12 * 3_600_000);

      await setup(zone);
      await seedAppointment(at);

      const res = await metrics();

      expect(res.status).toBe(200);
      expect(dayKeyInZone(at, zone)).toBe(dayKeyInZone(new Date(), zone));
      expect(res.body.appointmentsToday).toBe(1);
    });
  });

  describe('an appointment outside the tenant day is not counted', () => {
    it.each(ZONES)('%s', async (zone) => {
      const { end } = dayBoundsInZone(zone, 0);
      // One hour into the tenant's *next* day.
      const at = new Date(end.getTime() + 3_600_000);

      await setup(zone);
      await seedAppointment(at);

      const res = await metrics();

      expect(res.status).toBe(200);
      expect(dayKeyInZone(at, zone)).not.toBe(dayKeyInZone(new Date(), zone));
      expect(res.body.appointmentsToday).toBe(0);
    });
  });

  /**
   * An instant inside `zoneA`'s current day that falls on a DIFFERENT calendar
   * day in `zoneB`.
   *
   * Searched rather than hard-coded. A fixed instant cannot work: whether
   * 23:59Z is "tomorrow" in Tokyo depends on whether Tokyo has itself rolled
   * over yet, which depends on the hour the suite runs. Two earlier attempts
   * at this test failed for exactly that reason. Since the zones' day
   * boundaries differ, some hour of A's day always lies on the other side of
   * B's boundary — this finds it.
   */
  const instantSplittingZones = (zoneA: string, zoneB: string): Date => {
    const { start } = dayBoundsInZone(zoneA, 0);
    const todayInB = dayKeyInZone(new Date(), zoneB);

    for (let hour = 0; hour < 24; hour += 1) {
      const candidate = new Date(start.getTime() + hour * 3_600_000 + 30 * 60_000);
      if (dayKeyInZone(candidate, zoneB) !== todayInB) return candidate;
    }
    throw new Error(`No splitting instant between ${zoneA} and ${zoneB}`);
  };

  it('gives two tenants different counts for the SAME instant when their zones disagree', async () => {
    // The decisive case, and the one the original defect made impossible: the
    // count must be a function of the tenant's configured zone, not of the
    // instant alone and not of the host.
    const at = instantSplittingZones('UTC', 'Asia/Tokyo');

    await setup('UTC');
    await seedAppointment(at);
    const inUtc = await metrics();
    await cleanup();

    await setup('Asia/Tokyo');
    await seedAppointment(at);
    const inTokyo = await metrics();

    // Preconditions, asserted so a failure says which assumption broke.
    expect(dayKeyInZone(at, 'UTC')).toBe(dayKeyInZone(new Date(), 'UTC'));
    expect(dayKeyInZone(at, 'Asia/Tokyo')).not.toBe(dayKeyInZone(new Date(), 'Asia/Tokyo'));

    expect(inUtc.body.appointmentsToday).toBe(1);
    expect(inTokyo.body.appointmentsToday).toBe(0);
  });

  it('agrees with the day key the calendar computes for the same instant', async () => {
    // The cross-surface guarantee. `dayKeyInZone` is the function the calendar
    // groups by; whatever the KPI counts as today must match it.
    const zone = 'Europe/Tirane';
    const { start } = dayBoundsInZone(zone, 0);
    const insideToday = new Date(start.getTime() + 9 * 3_600_000);
    const insideTomorrow = new Date(start.getTime() + 33 * 3_600_000);

    await setup(zone);
    await seedAppointment(insideToday);
    await seedAppointment(insideTomorrow);

    const res = await metrics();

    // Exactly one of the two is "today" by the calendar's own definition...
    const todayKey = dayKeyInZone(new Date(), zone);
    expect(dayKeyInZone(insideToday, zone)).toBe(todayKey);
    expect(dayKeyInZone(insideTomorrow, zone)).not.toBe(todayKey);
    // ...and the KPI counts exactly that one.
    expect(res.body.appointmentsToday).toBe(1);
  });
});
