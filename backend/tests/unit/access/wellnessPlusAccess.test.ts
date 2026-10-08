import express from 'express';
import request from 'supertest';
import { AccessContext } from '../../../src/access/domain/AccessContext';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { requirePermission } from '../../../src/main/interfaces/http/middlewares/requirePermission';
import { redactFields } from '../../../src/access/domain/redactFields';
import { accessAs, accessWith } from '../../support/access';

/**
 * A stub members router, registered only here: the first real member route
 * arrives in Slice 4, and it joins the generated permission matrix then. Until
 * then this proves the nine keys gate a route on the server, for each role.
 */
function appFor(access: AccessContext): express.Express {
  const app = express();
  app.use((req, _res, next) => {
    req.access = access;
    next();
  });
  const ok = (_req: express.Request, res: express.Response) => res.json({ ok: true });
  app.get('/members', requirePermission('members.view'), ok);
  app.get('/members/verify', requirePermission('members.verify'), ok);
  app.post('/members', requirePermission('members.manage'), ok);
  app.get('/members/payments', requirePermission('members.payments.view'), ok);
  app.post('/members/payments', requirePermission('members.payments.record'), ok);
  app.post('/members/import', requirePermission('members.import'), ok);
  app.post('/members/vip', requirePermission('members.vip.approve'), ok);
  app.get('/members/reports', requirePermission('members.reports.view'), ok);
  app.put('/membership/settings', requirePermission('wellnessplus.settings.manage'), ok);
  return app;
}

const ROUTES: Array<[string, string, string]> = [
  ['get', '/members', 'members.view'],
  ['get', '/members/verify', 'members.verify'],
  ['post', '/members', 'members.manage'],
  ['get', '/members/payments', 'members.payments.view'],
  ['post', '/members/payments', 'members.payments.record'],
  ['post', '/members/import', 'members.import'],
  ['post', '/members/vip', 'members.vip.approve'],
  ['get', '/members/reports', 'members.reports.view'],
  ['put', '/membership/settings', 'wellnessplus.settings.manage'],
];

describe('Wellness+ access on the server', () => {
  it('FR-RBAC-28 a Sales User and a Sales Manager get 403 on every member route', async () => {
    for (const roleKey of [RoleKey.SalesUser, RoleKey.SalesManager]) {
      const app = appFor(accessAs(roleKey));
      for (const [method, url] of ROUTES) {
        expect([roleKey, method, url, (await (request(app) as any)[method](url)).status]).toEqual([roleKey, method, url, 403]);
      }
    }
  });

  it('FR-RBAC-29 the CEO reads members, payments and reports and gets 403 on every member, payment, import, VIP and settings write', async () => {
    const app = appFor(accessAs(RoleKey.Ceo));
    for (const [method, url, key] of ROUTES) {
      const readKeys = ['members.view', 'members.payments.view', 'members.reports.view'];
      const expected = readKeys.includes(key) ? 200 : 403;
      expect([method, url, (await (request(app) as any)[method](url)).status]).toEqual([method, url, expected]);
    }
  });

  it('FR-RBAC-25 NFR-SEC-07 the Administrator reaches every route and Reception only the verify route', async () => {
    const admin = appFor(accessAs(RoleKey.Administrator));
    const reception = appFor(accessAs(RoleKey.Reception));
    for (const [method, url, key] of ROUTES) {
      expect((await (request(admin) as any)[method](url)).status).toBe(200);
      expect([url, (await (request(reception) as any)[method](url)).status]).toEqual([url, key === 'members.verify' ? 200 : 403]);
    }
  });

  it('NFR-SEC-07 a key is checked on every request: removing it from the caller turns 200 into 403', async () => {
    const holder = accessWith({ 'members.view': true });
    expect((await request(appFor(holder)).get('/members')).status).toBe(200);
    expect((await request(appFor(accessWith({}))).get('/members')).status).toBe(403);
  });

  it('FR-DPR-02 a role copied from Reception with the Membership Agent keys reaches members and payments, and no contract or company payment permission', () => {
    const agent = accessAs(RoleKey.Reception, {
      grant: {
        'members.view': true,
        'members.manage': true,
        'members.payments.view': true,
        'members.payments.record': true,
        'members.import': true,
        'members.reports.view': true,
      },
    });
    expect(agent.can('members.payments.view')).toBe(true);
    for (const key of ['commercial.view', 'payments.view', 'payments.update', 'contracts.manage', 'contracts.terminate', 'members.vip.approve', 'wellnessplus.settings.manage']) {
      expect([key, agent.can(key)]).toEqual([key, false]);
    }
    const contract = {
      id: 'c1',
      number: 'CTR-2027-000001',
      status: 'ACTIVE',
      agreedMonthlyPrice: '49.40',
      termsText: 'Terms',
      documents: [{ id: 'd1' }],
      payments: [{ id: 'p1', paidAmount: '49.40', invoiceNumber: 'F-1' }],
    };
    expect(redactFields(contract, agent)).toEqual({ id: 'c1', number: 'CTR-2027-000001', status: 'ACTIVE' });
  });
});
