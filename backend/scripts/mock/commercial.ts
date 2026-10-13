import { ACTIVITY_NOTES, CompanySpec, FOLLOW_UP_NOTES, LOSS_NOTES, OwnerKey } from './dataset';
import { Api, Ctx, at, contractPdf, day } from './support';

/** What happens to a company's deal. Offers are priced by the app's own calculator. */
type Outcome =
  | { kind: 'LEAD' }
  | { kind: 'CONTACTED' }
  | { kind: 'INTERESTED' }
  | { kind: 'DRAFT_OFFER'; discount?: number }
  | { kind: 'SENT_OFFER'; discount?: number; approve?: boolean }
  | { kind: 'FOLLOW_UP'; discount?: number }
  | { kind: 'NEGOTIATION'; discount?: number; approve?: boolean }
  | { kind: 'MANUAL_PRICE_SENT'; price: string }
  | { kind: 'LOST'; reason: number }
  | { kind: 'WON'; contract: ContractPlan };

type ContractPlan = 'ACTIVE_PAID' | 'ACTIVE_OVERDUE' | 'ACTIVE_ENDING' | 'ACTIVE_NOT_RENEWING' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED' | 'DRAFT' | 'PENDING_SIGNATURE';

/** One outcome per company, in the order of COMPANIES. */
const PLAN: Outcome[] = [
  { kind: 'WON', contract: 'ACTIVE_PAID' }, // Hotel Dajti Park
  { kind: 'SENT_OFFER', discount: 5 }, // Oda Garden
  { kind: 'LEAD' }, // Kafe Blloku
  { kind: 'NEGOTIATION', discount: 14, approve: true }, // Albtex
  { kind: 'WON', contract: 'ACTIVE_OVERDUE' }, // Alb-Konstruksion
  { kind: 'DRAFT_OFFER' }, // CallAlb
  { kind: 'LOST', reason: 0 }, // Hoxha & Partnerët
  { kind: 'CONTACTED' }, // Techmax
  { kind: 'INTERESTED' }, // Frigo Fier
  { kind: 'MANUAL_PRICE_SENT', price: '420.00' }, // Butrinti View (no zone, so the price is set by hand)
  { kind: 'FOLLOW_UP' }, // Te Kalaja
  { kind: 'WON', contract: 'ACTIVE_ENDING' }, // Shkodra Shoes
  { kind: 'LOST', reason: 1 }, // Kafe Rinia
  { kind: 'WON', contract: 'SUSPENDED' }, // Elbasani Projekt
  { kind: 'WON', contract: 'ACTIVE_NOT_RENEWING' }, // Fiscon
  { kind: 'INTERESTED' }, // Mini Market Vlora
  { kind: 'WON', contract: 'ACTIVE_PAID' }, // Porti Logjistik
  { kind: 'CONTACTED' }, // Lura Resort
  { kind: 'SENT_OFFER' }, // Pizzeria Napoli
  { kind: 'WON', contract: 'CANCELLED' }, // Bio-Lezha
  { kind: 'WON', contract: 'ACTIVE_PAID' }, // Contact Plus
  { kind: 'LEAD' }, // Kafe Pogradec
  { kind: 'WON', contract: 'EXPIRED' }, // Kukësi Infra
  { kind: 'NEGOTIATION' }, // Alb-Garant (Wellness+ interest)
  { kind: 'LOST', reason: 2 }, // Moda Plus
  { kind: 'WON', contract: 'DRAFT' }, // Myzeqe
  { kind: 'FOLLOW_UP', discount: 8 }, // Rozafa
  { kind: 'LOST', reason: 3 }, // Balkoni
  { kind: 'WON', contract: 'PENDING_SIGNATURE' }, // Papirus
  { kind: 'SENT_OFFER', discount: 3 }, // Studio Arch
];

interface Made {
  spec: CompanySpec;
  index: number;
  clientId: string;
  owner: OwnerKey;
  api: Api;
  contactIds: string[];
  dealId: string;
  outcome: Outcome;
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export async function seedCommercial(ctx: Ctx, companies: CompanySpec[]): Promise<void> {
  const { prisma, tenantId, users, rng, log } = ctx;
  if (companies.length !== PLAN.length) throw new Error('The company list and the plan must be the same length.');

  // --- Employee bands: the workspace starts with 1-10 employees; the larger bands are added here ---
  const bands = [
    { minEmployees: 11, maxEmployees: 25, baseFee: '60.00', perEmployeeFee: '7.00' },
    { minEmployees: 26, maxEmployees: 50, baseFee: '110.00', perEmployeeFee: '6.00' },
    { minEmployees: 51, maxEmployees: 100, baseFee: '200.00', perEmployeeFee: '5.00' },
    { minEmployees: 101, maxEmployees: 250, baseFee: '420.00', perEmployeeFee: '4.00' },
    { minEmployees: 251, maxEmployees: 1000, baseFee: '900.00', perEmployeeFee: '3.20' },
  ];
  for (const band of bands) await users.admin.api.call('POST', '/pricing/bands', band);
  log(`pricing   + ${bands.length} employee bands`);

  // --- Price zones: the workspace starts with Tirana, Durrës and Elbasan; the other regions are added here, as an Administrator would in Settings ---
  const areaNames = (await prisma.area.findMany({ where: { tenantId }, include: { cities: true } })) as Array<{ nameSq: string; cities: Array<{ id: string; nameSq: string }> }>;
  const citiesOf = (...names: string[]) => areaNames.filter((a) => names.includes(a.nameSq)).flatMap((a) => a.cities.map((c) => c.id));
  const skipCityIds = (await prisma.city.findMany({ where: { tenantId, nameSq: { in: ['Sarandë', 'Himarë'] } } })).map((c) => c.id);
  const newZones: Array<{ nameSq: string; nameEn: string; surchargePercent: string; cityIds: string[] }> = [
    { nameSq: 'Veri', nameEn: 'North', surchargePercent: '120', cityIds: citiesOf('Shkodër', 'Lezhë', 'Kukës', 'Dibër') },
    // Sarandë and Himarë are left out on purpose: a seaside city with no zone is how "Price on request" appears.
    { nameSq: 'Jug', nameEn: 'South', surchargePercent: '150', cityIds: citiesOf('Vlorë', 'Gjirokastër').filter((id) => !skipCityIds.includes(id)) },
    { nameSq: 'Qendër dhe Juglindje', nameEn: 'Centre and South-East', surchargePercent: '110', cityIds: citiesOf('Fier', 'Berat', 'Korçë') },
  ];
  for (const zone of newZones) {
    const created = await users.admin.api.call('POST', '/pricing/zones', { nameSq: zone.nameSq, nameEn: zone.nameEn, surchargePercent: zone.surchargePercent });
    const zoneId = created.item?.id ?? created.data?.item?.id ?? created.data?.id ?? created.id;
    await users.admin.api.call('PUT', `/pricing/zones/${zoneId}/cities`, { cityIds: zone.cityIds });
  }
  // Every other city joins the nearest existing zone, except Sarandë and Himarë.
  const zoned = new Set((await prisma.priceZoneCity.findMany({ where: { zone: { tenantId } } })).map((z) => z.cityId));
  const leftover = await prisma.city.findMany({ where: { tenantId, id: { notIn: [...zoned, ...skipCityIds] } }, include: { area: true } });
  for (const [zoneName, areaList] of [['Elbasan dhe Durrës', ['Elbasan', 'Durrës']], ['Kamëz dhe Vorë', ['Tiranë']]] as const) {
    const zone = await prisma.priceZone.findFirstOrThrow({ where: { tenantId, nameSq: zoneName } });
    const current = (await prisma.priceZoneCity.findMany({ where: { zoneId: zone.id } })).map((z) => z.cityId);
    const extra = leftover.filter((c) => (areaList as readonly string[]).includes(c.area.nameSq)).map((c) => c.id);
    if (extra.length) await users.admin.api.call('PUT', `/pricing/zones/${zone.id}/cities`, { cityIds: [...current, ...extra] });
  }
  log(`pricing   + ${newZones.length} price zones added so every city has a price`);

  // --- Lookups the app already holds --------------------------------------
  const [businessTypes, areas, cities, results, lostReasons, frequencies, zones, zoneCities, pkg, fields] = await Promise.all([
    prisma.businessType.findMany({ where: { tenantId, active: true } }),
    prisma.area.findMany({ where: { tenantId, active: true } }),
    prisma.city.findMany({ where: { tenantId, active: true } }),
    prisma.activityResult.findMany({ where: { tenantId, active: true }, orderBy: { order: 'asc' } }),
    prisma.lostReason.findMany({ where: { tenantId, active: true }, orderBy: { order: 'asc' } }),
    prisma.visitFrequency.findMany({ where: { tenantId, active: true }, orderBy: { order: 'asc' } }),
    prisma.priceZone.findMany({ where: { tenantId, active: true } }),
    prisma.priceZoneCity.findMany({ where: { zone: { tenantId } } }),
    prisma.servicePackage.findFirstOrThrow({ where: { tenantId, isDefault: true } }),
    prisma.customFieldDefinition.findMany({ where: { tenantId } }),
  ]);
  const byName = <T extends { nameSq: string }>(items: T[], name: string, what: string): T => {
    const found = items.find((item) => item.nameSq === name);
    if (!found) throw new Error(`No ${what} named "${name}".`);
    return found;
  };
  const fieldName = (role: string) => fields.find((f) => f.role === role)?.fieldName;
  const nameField = fieldName('PRIMARY_NAME') ?? 'Name';
  const emailField = fieldName('PRIMARY_EMAIL') ?? 'Email';
  const phoneField = fieldName('PRIMARY_PHONE') ?? 'Phone';
  const statusField = fieldName('STATUS') ?? 'Status';
  const assigneeField = fieldName('ASSIGNEE') ?? 'Assigned To';
  const frequencyFor = (employees: number) => frequencies.find((f) => f.visitsPerYear === (employees > 100 ? 4 : employees > 30 ? 2 : 1)) ?? frequencies[0];
  const zoneFor = (cityId: string, employees: number) => {
    const candidates = zoneCities.filter((zc) => zc.cityId === cityId).map((zc) => zones.find((z) => z.id === zc.zoneId)!).filter(Boolean);
    if (candidates.length === 0) return null;
    return candidates.length === 1 ? candidates[0] : candidates[employees > 50 ? 0 : 1];
  };

  // --- Companies and their contacts, created by the salesperson who owns them ---
  const made: Made[] = [];
  for (const [index, spec] of companies.entries()) {
    const owner = users[spec.owner];
    const area = byName(areas, spec.area, 'area');
    const city = byName(cities.filter((c) => c.areaId === area.id), spec.city, `city in ${spec.area}`);
    const outcome = PLAN[index];
    const status = outcome.kind === 'WON' ? 'CLIENT' : outcome.kind === 'LOST' || outcome.kind === 'LEAD' || outcome.kind === 'CONTACTED' ? 'LEAD' : 'PROSPECT';
    const slug = slugify(spec.name.replace(/^(Hotel|Restorant|Kafe|Fabrika e|Fabrika|Qendra e Thirrjeve|Zyra|Dyqan|Magazina|Ndërtimi|Ndërtim)\s+/i, ''));
    const phoneBase = 690000000 + index * 137;
    const created = await owner.api.call('POST', '/clients', {
      customFieldValues: {
        [nameField]: spec.name,
        [emailField]: `info@${slug}.al`,
        [phoneField]: `+355${phoneBase}`,
        [statusField]: status,
        [assigneeField]: owner.id,
      },
      notes: spec.note,
      profile: {
        businessTypeId: byName(businessTypes, spec.businessType, 'business type').id,
        employeeCount: spec.employees,
        areaId: area.id,
        cityId: city.id,
        streetAddress: spec.street,
        taxId: `${'KLJ'[index % 3]}${String(41000000 + index * 7919).padStart(8, '0')}${'ABCDEFGH'[index % 8]}`,
        website: `https://www.${slug}.al`,
      },
      contacts: spec.contacts.map((contact, n) => ({
        name: contact.name,
        position: contact.position,
        phone: `+355${phoneBase + n + 1}`,
        email: `${slugify(contact.name.split(' ')[0])}.${slugify(contact.name.split(' ').slice(-1)[0])}@${slug}.al`,
        isPrimary: n === 0,
      })),
    });
    const contacts = await prisma.contactPerson.findMany({ where: { tenantId, clientId: created.id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    made.push({ spec, index, clientId: created.id, owner: spec.owner, api: owner.api, contactIds: contacts.map((c) => c.id), dealId: '', outcome });
  }
  log(`company   + ${made.length} companies with ${made.reduce((n, m) => n + m.contactIds.length, 0)} contacts`);

  // --- A deal for every company ---------------------------------------------
  for (const m of made) {
    const deal = await m.api.call('POST', '/deals', {
      clientId: m.clientId,
      type: 'NEW_CONTRACT',
      title: `Kontratë vjetore wellness — ${m.spec.name}`,
      ownerUserId: users[m.owner].id,
      expectedCloseDate: day(rng.int(10, 75)),
      notes: `Mundësi e hapur për ${m.spec.employees} punonjës. ${m.spec.note}`,
    });
    m.dealId = deal.data.id;
  }
  log(`deal      + ${made.length} deals`);

  // --- Activities: calls, meetings, emails, visits and notes, spread over the last months ---
  let activities = 0;
  for (const m of made) {
    const count = m.outcome.kind === 'LEAD' ? 1 : rng.int(2, 4);
    for (let n = 0; n < count; n += 1) {
      const note = ACTIVITY_NOTES[(m.index + n) % ACTIVITY_NOTES.length];
      const body: Record<string, unknown> = {
        channel: note.channel,
        content: `${note.content} (${m.spec.name})`,
        occurredAt: at(-(count - n) * rng.int(6, 16) - 2, rng.int(8, 16), rng.pick([0, 15, 30, 45])).toISOString(),
        contactPersonId: m.contactIds[n % m.contactIds.length],
        dealId: m.dealId,
      };
      if (note.channel !== 'NOTE') {
        body.resultId = results[(m.index + n) % results.length].id;
        body.clientFeedback = note.feedback;
        body.nextAction = note.next;
      }
      const created = await m.api.call('POST', `/clients/${m.clientId}/interactions`, body);
      activities += 1;
      // A correction within the day it was written (FR-ACT-06), so the edit trail has an entry.
      if (n === 0 && m.index % 3 === 0) {
        await m.api.call('PATCH', `/clients/${m.clientId}/interactions/${created.id ?? created.data?.id}`, {
          ...body,
          content: `${body.content} Korrigjim: u saktësua numri i punonjësve.`,
        });
      }
    }
  }
  log(`activity  + ${activities} activities`);

  // --- Offers, approvals, wins, losses and contracts, according to the plan ---
  const manager = users.manager;
  const priceOffer = async (m: Made, extra: Record<string, unknown> = {}, dealId = m.dealId) => {
    const city = cities.find((c) => c.nameSq === m.spec.city && areas.find((a) => a.id === c.areaId)?.nameSq === m.spec.area)!;
    const zone = zoneFor(city.id, m.spec.employees);
    const res = await m.api.call('PUT', `/deals/${dealId}/offer`, {
      employees: m.spec.employees,
      businessTypeId: byName(businessTypes, m.spec.businessType, 'business type').id,
      zoneId: zone ? zone.id : null,
      frequencyId: frequencyFor(m.spec.employees).id,
      packageId: pkg.id,
      contactPersonId: m.contactIds[0],
      note: `Ofertë për ${m.spec.name}: kontroll mjekësor vjetor dhe trajnim për sigurinë në punë.`,
      ...extra,
    });
    return res.data.id as string;
  };
  const decideIfPending = async (offerId: string, approve: boolean) => {
    const pending = await prisma.discountApproval.findFirst({ where: { tenantId, quotationId: offerId, status: 'PENDING' } });
    if (!pending) return;
    if (approve) await manager.api.call('POST', `/discount-approvals/${pending.id}/approve`, { comment: 'Miratohet: klient strategjik me volum të lartë.' });
    else await manager.api.call('POST', `/discount-approvals/${pending.id}/reject`, { comment: 'Zbritja e kërkuar është mbi kufirin e lejuar.' });
  };
  const sendOffer = async (m: Made, offerId: string, daysAgo: number) => {
    // An approved discount already made the offer ready.
    const status = (await prisma.quotation.findUniqueOrThrow({ where: { id: offerId } })).status;
    if (status === 'DRAFT') await m.api.call('POST', `/offers/${offerId}/mark-ready`, {});
    void daysAgo;
    await m.api.call('POST', `/offers/${offerId}/mark-sent`, { sentDate: day(0) });
  };

  const wonContracts: Array<{ m: Made; plan: ContractPlan; offerId: string }> = [];
  for (const m of made) {
    const o = m.outcome;
    switch (o.kind) {
      case 'LEAD':
        break;
      case 'CONTACTED':
        await m.api.call('POST', `/deals/${m.dealId}/stage`, { stage: 'CONTACTED' });
        break;
      case 'INTERESTED':
        await m.api.call('POST', `/deals/${m.dealId}/stage`, { stage: 'INTERESTED' });
        break;
      case 'DRAFT_OFFER': {
        const id = await priceOffer(m);
        await m.api.call('POST', `/offers/${id}/mark-ready`, {});
        break;
      }
      case 'SENT_OFFER':
      case 'FOLLOW_UP':
      case 'NEGOTIATION': {
        const discount = o.discount;
        const id = await priceOffer(m, discount ? { discountPercent: String(discount), reason: discount > 10 ? 'Klient me volum të lartë dhe kontratë shumëvjeçare.' : null } : {});
        await decideIfPending(id, o.kind === 'NEGOTIATION' ? (o as any).approve !== false : true);
        await sendOffer(m, id, rng.int(3, 20));
        if (o.kind !== 'SENT_OFFER') await m.api.call('POST', `/deals/${m.dealId}/stage`, { stage: o.kind === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'NEGOTIATION' });
        break;
      }
      case 'MANUAL_PRICE_SENT': {
        const id = await priceOffer(m, { manualMonthlyPrice: o.price, reason: 'Zona e çmimit nuk është përcaktuar për këtë lokacion turistik; çmimi u caktua me dorë sipas sezonit dhe numrit të vizitave.' });
        await decideIfPending(id, true);
        await sendOffer(m, id, 6);
        break;
      }
      case 'LOST': {
        const id = await priceOffer(m);
        await sendOffer(m, id, 25);
        await m.api.call('POST', `/offers/${id}/mark-rejected`, { note: 'Klienti refuzoi ofertën me telefon.' });
        await m.api.call('POST', `/deals/${m.dealId}/lose`, { reasonId: lostReasons[o.reason % lostReasons.length].id, note: LOSS_NOTES[o.reason % LOSS_NOTES.length] });
        break;
      }
      case 'WON': {
        const id = await priceOffer(m, m.index % 4 === 0 ? { discountPercent: '6' } : {});
        await sendOffer(m, id, 60 + m.index);
        await m.api.call('POST', `/offers/${id}/mark-accepted`, { note: 'Klienti e pranoi ofertën me shkrim.' });
        await m.api.call('POST', `/deals/${m.dealId}/win`, { offerId: id, closeFollowUps: true });
        wonContracts.push({ m, plan: o.contract, offerId: id });
        break;
      }
    }
  }
  log(`offer     + offers sent, approved, rejected and accepted; ${wonContracts.length} deals won`);

  const contracts = await seedContracts(ctx, wonContracts, lostReasons[0].id);

  // --- Renewals: one contract ending soon gets an open renewal offer; the expired one is renewed for a year ---
  for (const { id, m, plan } of contracts) {
    if (plan !== 'ACTIVE_ENDING' && plan !== 'EXPIRED') continue;
    const started = plan === 'EXPIRED' ? await users.admin.api.call('POST', `/contracts/${id}/renewal`, { ownerUserId: users[m.owner].id }) : null;
    const renewalDeal = plan === 'EXPIRED' ? (started.data?.id ?? started.id ?? started.dealId ?? started.data?.dealId) : (await prisma.deal.findFirstOrThrow({ where: { tenantId, renewalOfContractId: id } })).id;
    const offerId = await priceOffer(m, { discountPercent: '4' }, renewalDeal);
    await sendOffer(m, offerId, 5);
    if (plan === 'EXPIRED') {
      await m.api.call('POST', `/offers/${offerId}/mark-accepted`, { note: 'Klienti dëshiron të vazhdojë edhe një vit.' });
      await m.api.call('POST', `/deals/${renewalDeal}/win`, { offerId, closeFollowUps: true });
      const renewed = await users.admin.api.call('POST', '/contracts', { dealId: renewalDeal, startsAt: day(-30), endsAt: day(335), billingPeriod: 'MONTHLY' });
      const renewedId = renewed.id ?? renewed.data?.id;
      await attachSignedContract(ctx, renewedId, m, { startsAt: day(-30), endsAt: day(335), billing: 'MONTHLY' });
      await users.admin.api.call('POST', `/contracts/${renewedId}/activate`, {});
    }
  }
  log('renewal   + a renewal deal and offer for the contract ending soon; the expired contract renewed');

  // --- A discount request still waiting for its approver (and its reminder), and one offer revised ---
  const pendingCompany = made.find((m) => m.spec.name === 'Kafe Liqeni Pogradec')!;
  const pendingOffer = await priceOffer(pendingCompany, { discountPercent: '13', reason: 'Klienti kërkon 13% për kontratë dyvjeçare.' });
  const pendingApproval = await prisma.discountApproval.findFirstOrThrow({ where: { tenantId, quotationId: pendingOffer, status: 'PENDING' } });
  await prisma.discountApproval.update({ where: { id: pendingApproval.id }, data: { remindedAt: at(-1, 9, 0) } });
  const revisable = await prisma.quotation.findFirstOrThrow({ where: { tenantId, status: 'SENT' }, orderBy: { createdAt: 'asc' } });
  await made.find((m) => m.clientId === revisable.clientId)!.api.call('POST', `/offers/${revisable.id}/revise`, {});
  log('offer     + one discount waiting for approval, one offer revised to a new version');

  await seedFollowUps(ctx, made, results[0].id);
}

async function attachSignedContract(ctx: Ctx, id: string, m: Made, dates: { startsAt: string; endsAt: string; billing: string }): Promise<void> {
  const detail = await ctx.prisma.contract.findUniqueOrThrow({ where: { id } });
  const pdf = await contractPdf({
    number: detail.number ?? id.slice(0, 8),
    company: m.spec.name,
    plan: detail.planName,
    amount: String(detail.amount),
    period: dates.billing === 'QUARTERLY' ? 'çdo tre muaj' : 'çdo muaj',
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
    signer: m.spec.contacts[0].name,
  });
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), `kontrata-${(detail.number ?? id).toString().replace(/[^A-Za-z0-9-]/g, '')}-e-nenshkruar.pdf`);
  await ctx.users.admin.api.form(`/contracts/${id}/document`, form);
}

async function seedContracts(
  ctx: Ctx,
  won: Array<{ m: Made; plan: ContractPlan; offerId: string }>,
  notRenewingReasonId: string
): Promise<Array<{ id: string; m: Made; plan: ContractPlan }>> {
  const { prisma, tenantId, users, log } = ctx;
  const admin = users.admin.api;
  const made: Array<{ id: string; m: Made; plan: ContractPlan }> = [];
  const methods = ['BANK_TRANSFER', 'CASH', 'CARD'];
  let instalments = 0;

  for (const [n, { m, plan }] of won.entries()) {
    // The contract's dates: ending soon, long gone or well ahead, as the plan needs.
    const dates: Record<ContractPlan, { startsAt: string; endsAt: string }> = {
      ACTIVE_PAID: { startsAt: day(-120), endsAt: day(245) },
      ACTIVE_OVERDUE: { startsAt: day(-100), endsAt: day(265) },
      ACTIVE_ENDING: { startsAt: day(-335), endsAt: day(30) },
      ACTIVE_NOT_RENEWING: { startsAt: day(-340), endsAt: day(25) },
      SUSPENDED: { startsAt: day(-90), endsAt: day(275) },
      CANCELLED: { startsAt: day(-150), endsAt: day(215) },
      EXPIRED: { startsAt: day(-400), endsAt: day(-35) },
      DRAFT: { startsAt: day(10), endsAt: day(375) },
      PENDING_SIGNATURE: { startsAt: day(5), endsAt: day(370) },
    };
    const billing = plan === 'ACTIVE_PAID' && n % 2 === 0 ? 'QUARTERLY' : 'MONTHLY';
    const contract = await admin.call('POST', '/contracts', { dealId: m.dealId, ...dates[plan], billingPeriod: billing });
    const id = contract.id ?? contract.data?.id;
    made.push({ id, m, plan });

    await admin.call('PATCH', `/contracts/${id}`, {
      assignedUserId: users[m.owner].id,
      notes: `Kontratë vjetore me ${m.spec.name}. Vizitat planifikohen çdo tremujor me përgjegjësin e burimeve njerëzore.`,
      renewalDate: dates[plan].endsAt,
      termsText: {
        sq: `Kontrata mbulon kontrollin mjekësor vjetor të ${m.spec.employees} punonjësve dhe trajnimin për sigurinë në punë.`,
        en: `The contract covers the annual medical check of ${m.spec.employees} employees and workplace safety training.`,
      },
    });

    if (plan === 'DRAFT') continue;
    if (plan === 'PENDING_SIGNATURE') {
      await admin.call('POST', `/contracts/${id}/status`, { status: 'PENDING_SIGNATURE', reason: null }).catch(() => undefined);
      continue;
    }
    // Activation needs the signed contract attached (FR-CON-13); the file is a generated PDF.
    await attachSignedContract(ctx, id, m, { ...dates[plan], billing });
    await admin.call('POST', `/contracts/${id}/activate`, {});

    const payments = (await admin.call('GET', `/contracts/${id}/payments`)).data ?? (await prisma.contractPayment.findMany({ where: { contractId: id }, orderBy: { dueDate: 'asc' } }));
    const rows = await prisma.contractPayment.findMany({ where: { contractId: id }, orderBy: { dueDate: 'asc' } });
    void payments;
    instalments += rows.length;
    const past = rows.filter((r) => r.dueDate.getTime() < Date.now());
    for (const [k, row] of past.entries()) {
      const invoiceNumber = `FT-${new Date().getUTCFullYear()}-${String(1000 + n * 20 + k)}`;
      await admin.call('POST', `/contracts/${id}/payments/${row.id}/invoice`, { invoiceNumber, invoiceDate: row.dueDate.toISOString().slice(0, 10) });
      const overdueLast = plan === 'ACTIVE_OVERDUE' && k >= past.length - 2;
      if (overdueLast) {
        if (k === past.length - 1) await admin.call('POST', `/contracts/${id}/payments/${row.id}/pending`, { comment: 'Klienti premtoi pagesën javën e ardhshme.' });
        continue;
      }
      await admin.call('POST', `/contracts/${id}/payments/${row.id}/receipts`, {
        amount: String(row.amount),
        receivedOn: row.dueDate.toISOString().slice(0, 10),
        method: methods[(n + k) % methods.length],
        comment: 'Pagesa u pranua dhe u regjistrua nga financa.',
      });
    }
    if (plan === 'ACTIVE_PAID' && n === 0) {
      await admin.call('POST', `/contracts/${id}/payments`, { dueDate: day(20), amount: '150.00', reason: 'Vizitë shtesë mjekësore e kërkuar nga klienti.', note: 'Shërbim jashtë planit vjetor.' });
    }

    if (plan === 'SUSPENDED') await admin.call('POST', `/contracts/${id}/status`, { status: 'SUSPENDED', reason: 'Pagesa e vonuar; shërbimi pezullohet deri në rregullim.' });
    if (plan === 'CANCELLED') await admin.call('POST', `/contracts/${id}/cancel`, { reason: 'Klienti mbylli aktivitetin dhe kërkoi anulimin.' });
    if (plan === 'EXPIRED') await admin.call('POST', `/contracts/${id}/status`, { status: 'EXPIRED', reason: null }).catch(() => undefined);
    if (plan === 'ACTIVE_NOT_RENEWING') await admin.call('POST', `/contracts/${id}/not-renewing`, { reasonId: notRenewingReasonId, note: 'Klienti kalon te një ofrues tjetër nga viti i ardhshëm.' });
    if (plan === 'ACTIVE_ENDING') {
      // The Renewals screen: a renewal deal for the contract that ends in a month.
      await admin.call('POST', `/contracts/${id}/renewal`, { ownerUserId: users[m.owner].id });
    }
  }
  log(`contract  + ${won.length} contracts in every status, ${instalments} instalments with invoices and receipts`);
  void tenantId;
  return made;
}

async function seedFollowUps(ctx: Ctx, made: Made[], resultId: string): Promise<void> {
  const { prisma, tenantId, rng, log } = ctx;
  let count = 0;
  const open = made.filter((m) => !['WON', 'LOST'].includes(m.outcome.kind));
  for (const [n, m] of open.entries()) {
    const body = {
      clientId: m.clientId,
      dealId: m.dealId,
      contactPersonId: m.contactIds[0],
      type: (['CALL', 'MEETING', 'VISIT', 'EMAIL', 'ONLINE_MEETING'] as const)[n % 5],
      dueDate: day(rng.int(1, 14)),
      time: `${String(rng.int(8, 16)).padStart(2, '0')}:${rng.pick(['00', '15', '30', '45'])}`,
      note: FOLLOW_UP_NOTES[n % FOLLOW_UP_NOTES.length],
      assignedUserId: ctx.users[m.owner].id,
    };
    const created = await m.api.call('POST', '/follow-ups', body);
    const id = created.data?.id ?? created.id;
    count += 1;
    if (n % 4 === 1) {
      // Completed: the activity that happened, recorded with the result.
      await m.api.call('POST', `/follow-ups/${id}/complete`, {
        channel: body.type === 'EMAIL' ? 'EMAIL' : body.type,
        content: 'Follow-up i kryer: biseduam për ofertën dhe afatet e vendimit.',
        resultId,
        contactPersonId: m.contactIds[0],
        dealId: m.dealId,
        clientFeedback: 'Do të na kthejë përgjigje brenda javës.',
        nextAction: 'Rithirrje pas një jave.',
      });
    } else if (n % 4 === 2) {
      await m.api.call('POST', `/follow-ups/${id}/cancel`, { reason: 'Klienti kërkoi ta shtyjmë; do të planifikohet përsëri.' });
    } else if (n % 4 === 3) {
      await m.api.call('POST', `/follow-ups/${id}/reschedule`, { dueDate: day(rng.int(15, 30)), time: '10:30', reason: 'Takimi u zhvendos sipas kërkesës së klientit.' });
    }
  }
  // Two follow-ups already past their date, with the reminder and due notices recorded as sent.
  const overdue = await prisma.appointment.findMany({ where: { tenantId, kind: 'FOLLOW_UP', status: { in: ['SCHEDULED', 'PENDING'] as any } }, take: 2 }).catch(() => []);
  for (const row of overdue) {
    await prisma.appointment.update({ where: { id: row.id }, data: { scheduledAt: at(-3, 9, 30), remindedAt: at(-4, 8, 0), dueNotifiedAt: at(-3, 9, 30) } });
  }
  log(`follow-up + ${count} follow-ups and meetings (open, completed, cancelled, rescheduled, overdue)`);
}
