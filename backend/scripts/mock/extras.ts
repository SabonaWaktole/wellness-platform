import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { Api, Ctx, at, day } from './support';
import { STAFF, COORDINATOR } from './dataset';

/** A step that must not stop the run: a refusal is reported with the app's own message. */
async function attempt(ctx: Ctx, name: string, work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    ctx.log(`  (${name} skipped: ${String((error as Error).message).slice(0, 220)})`);
    return false;
  }
}

const palette = ['#0F766E', '#1D4ED8', '#9333EA', '#B45309', '#BE123C', '#047857', '#4338CA', '#0E7490', '#A21CAF'];

/** A simple branded image: initials on a coloured shape, drawn locally so no file has to be supplied. */
async function image(kind: 'logo' | 'cover' | 'avatar', label: string, colour: string): Promise<Buffer> {
  const [w, h] = kind === 'cover' ? [1600, 400] : [512, 512];
  const font = Math.round(Math.min(w, h) * (kind === 'cover' ? 0.28 : 0.4));
  const svg =
    kind === 'cover'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="#0B2B42"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="58%" font-family="DejaVu Sans, Arial, sans-serif" font-size="${font}" font-weight="700" fill="#ffffff" fill-opacity="0.92" text-anchor="middle">${label}</text></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${w / 2 - 8}" fill="${colour}"/><text x="50%" y="${kind === 'logo' ? '62%' : '63%'}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${font}" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const upload = async (api: Api, kind: string, png: Buffer) => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), `${kind}.png`);
  await api.form(`/media/${kind}`, form);
};

export async function seedExtras(ctx: Ctx): Promise<void> {
  const { prisma, tenantId, users, rng, log } = ctx;
  const admin = users.admin.api;

  // --- Soft-deleted records: an archived company, a removed contact, a deleted deal, a deactivated user ---
  await attempt(ctx, 'archived records', async () => {
    const fields = await prisma.customFieldDefinition.findMany({ where: { tenantId } });
    const f = (role: string) => fields.find((x) => x.role === role)!.fieldName;
    const [bt, area] = [await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Kafene' } }), await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } })];
    const city = await prisma.city.findFirstOrThrow({ where: { tenantId, areaId: area.id, nameSq: 'Tiranë' } });
    const closed = await users.salesB.api.call('POST', '/clients', {
      customFieldValues: { [f('PRIMARY_NAME')]: 'Kafe Dielli (mbyllur)', [f('PRIMARY_EMAIL')]: 'info@kafedielli.al', [f('PRIMARY_PHONE')]: '+355692001777', [f('STATUS')]: 'FORMER_CLIENT', [f('ASSIGNEE')]: users.salesB.id },
      notes: 'Kafeneja u mbyll përfundimisht; regjistri mbahet i arkivuar.',
      profile: { businessTypeId: bt.id, employeeCount: 5, areaId: area.id, cityId: city.id, streetAddress: 'Rruga Myslym Shyri 40', taxId: 'K41999888A', website: 'https://www.kafedielli.al' },
      contacts: [{ name: 'Valmir Dielli', position: 'Pronar', phone: '+355692001778', email: 'valmir@kafedielli.al', isPrimary: true }],
    });
    await admin.call('DELETE', `/clients/${closed.id}`);

    const hotel = await prisma.client.findFirstOrThrow({ where: { tenantId, name: 'Hotel Dajti Park' } });
    const extra = await users.salesA.api.call('POST', `/clients/${hotel.id}/contacts`, { name: 'Gjergj Marku', position: 'Ish-menaxher operacionesh', phone: '+355692001900', email: 'gjergj.marku@dajtipark.al' });
    await users.salesA.api.call('DELETE', `/clients/${hotel.id}/contacts/${extra.id ?? extra.data?.id}`, undefined);

    const moda = await prisma.client.findFirstOrThrow({ where: { tenantId, name: 'Moda Plus Berat' } });
    const deal = await users.salesB.api.call('POST', '/deals', { clientId: moda.id, type: 'EXTRA_SERVICES', title: 'Shërbime shtesë — deal i krijuar gabimisht', ownerUserId: users.salesB.id, expectedCloseDate: day(30), notes: 'Krijuar dy herë nga gabimi; fshihet.' });
    await admin.call('DELETE', `/deals/${deal.data.id}`);
  });

  // A leaver is deactivated; the record stays for history.
  await attempt(ctx, 'deactivated user', async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { tenantId, key: 'SALES_USER', isSystem: true } });
    const leaver = await admin.call('POST', '/auth/users', { email: `leka.largohet@${ctx.emailDomain}`, password: ctx.password, roleId: role.id, firstName: 'Leka', lastName: 'Largohet' });
    await prisma.user.update({ where: { id: leaver.user.id }, data: { phone: '+355 69 201 1099', language: 'sq' } });
    await admin.call('POST', `/auth/staff/${leaver.user.id}/deactivate`, {});
  });

  // --- Invitations (one open, one revoked), a password reset, integrations, status labels ---
  await attempt(ctx, 'invitations', async () => {
    const roles = await prisma.role.findMany({ where: { tenantId, isSystem: true } });
    const sales = roles.find((r) => r.key === 'SALES_USER')!;
    const reception = roles.find((r) => r.key === 'RECEPTION')!;
    await admin.call('POST', '/auth/invitations', { email: `ermal.shehu@${ctx.emailDomain}`, roleId: sales.id });
    await admin.call('POST', '/auth/invitations', { email: `kaltrina.meta@${ctx.emailDomain}`, roleId: reception.id });
    const revoked = await prisma.invitation.findFirstOrThrow({ where: { tenantId, email: `kaltrina.meta@${ctx.emailDomain}` } });
    await admin.call('DELETE', `/auth/invitations/${revoked.id}`);
  });
  await attempt(ctx, 'password reset', () => ctx.users.salesC.api.call('POST', '/auth/password-reset/request', { email: users.salesC.email }));
  await attempt(ctx, 'integrations', async () => {
    await admin.call('POST', '/integrations/connect', { provider: 'GOOGLE_CALENDAR', config: { calendarId: 'follow-ups@wellness-albania.al', syncFollowUps: true } });
    await admin.call('POST', '/integrations/connect', { provider: 'WHATSAPP', config: { businessNumber: '+355692011000', template: 'follow-up-reminder' } });
  });
  await attempt(ctx, 'status labels', async () => {
    await admin.call('PATCH', '/status-labels/CONTRACT/ACTIVE', { labelSq: 'Në fuqi', labelEn: 'In force', colour: '#047857' });
    await admin.call('PATCH', '/status-labels/PAYMENT/OVERDUE', { labelSq: 'Në vonesë', labelEn: 'Late', colour: '#B91C1C' });
    await admin.call('PATCH', '/status-labels/DEAL/NEGOTIATION', { labelSq: 'Negociim', labelEn: 'Negotiating', colour: '#B45309' });
  });
  log('extras    + archived company, contact and deal, a deactivated user, invitations, password reset, integrations, status labels');

  // --- Pictures: the workspace logo and cover, an avatar and a cover for every user ---
  await attempt(ctx, 'pictures', async () => {
    await upload(admin, 'logo', await image('logo', 'WA', '#0F766E'));
    await upload(admin, 'company-cover', await image('cover', 'Wellness Albania', '#0F766E'));
    const everyone = [{ key: 'admin' as const, initials: 'AL' }, ...STAFF.map((s) => ({ key: s.key, initials: `${s.firstName[0]}${s.lastName[0]}` })), { key: COORDINATOR.key, initials: 'AF' }];
    for (const [i, person] of everyone.entries()) {
      const api = (users as any)[person.key].api as Api;
      await upload(api, 'avatar', await image('avatar', person.initials, palette[i % palette.length]));
      await upload(api, 'user-cover', await image('cover', 'Wellness Albania', palette[(i + 3) % palette.length]));
    }
  });
  log('media     + workspace logo and cover, and an avatar and cover for each user');

  // --- Inventory: warehouses, categories and products with stock movements ---
  await attempt(ctx, 'inventory', async () => {
    const wh = [] as string[];
    for (const w of [
      { name: 'Depo kryesore Tiranë', address: 'Rruga e Kavajës 210, Tiranë' },
      { name: 'Depo Durrës', address: 'Zona Industriale Porto Romano, Durrës' },
    ]) wh.push((await admin.call('POST', '/inventory/warehouses', w)).id);
    const cat = [] as string[];
    for (const c of [
      { name: 'Material mjekësor', description: 'Doreza, maska, shiringa dhe materiale të përdorimit një herë.' },
      { name: 'Pajisje diagnostikuese', description: 'Tensiometra, oksimetra dhe pajisje matëse për vizitat në vend.' },
      { name: 'Materiale trajnimi', description: 'Broshura, poster dhe pajisje për trajnimet e sigurisë në punë.' },
    ]) cat.push((await admin.call('POST', '/inventory/categories', c)).id);
    const products: Array<[string, string, number, number, string, number, string[]]> = [
      ['Doreza nitrili (kuti 100)', 'WA-MED-001', 6.5, 4.1, 'MedLine', 0, ['mjekësore', 'shpenzueshme']],
      ['Maska kirurgjikale (kuti 50)', 'WA-MED-002', 4.2, 2.6, 'MedLine', 0, ['mjekësore']],
      ['Shiringa 5 ml (kuti 100)', 'WA-MED-003', 9.9, 6.3, 'Terumo', 0, ['mjekësore']],
      ['Tensiometër dixhital', 'WA-DIA-001', 38, 24, 'Omron', 1, ['diagnostikim']],
      ['Oksimetër gishti', 'WA-DIA-002', 22, 13.5, 'Beurer', 1, ['diagnostikim']],
      ['Termometër infra të kuqe', 'WA-DIA-003', 27, 16, 'Braun', 1, ['diagnostikim']],
      ['Broshurë: Siguria në punë', 'WA-TRN-001', 1.2, 0.5, 'Wellness Albania', 2, ['trajnim']],
      ['Poster ndihma e parë', 'WA-TRN-002', 3.5, 1.4, 'Wellness Albania', 2, ['trajnim']],
    ];
    for (const [i, [name, sku, price, cost, brand, c, tags]] of products.entries()) {
      const created = await admin.call('POST', '/inventory/products', {
        name, description: `${name} për shërbimet e vizitave mjekësore në vendin e punës.`, sku, brand, categoryId: cat[c], price, cost, tags, lowStockThreshold: 10,
        initialStock: [{ warehouseId: wh[0], quantity: 40 + i * 6 }, { warehouseId: wh[1], quantity: 15 + i * 3 }],
      });
      const id = created.id ?? created.data?.id ?? created.product?.id;
      if (i % 2 === 0) await admin.call('POST', `/inventory/products/${id}/adjust`, { warehouseId: wh[0], quantityChange: -(3 + i), reason: 'Përdorur në vizitat mjekësore të javës.' });
      if (i % 3 === 0) await admin.call('POST', `/inventory/products/${id}/transfer`, { fromWarehouseId: wh[0], toWarehouseId: wh[1], quantity: 5, reason: 'Furnizim për vizitat në Durrës.' });
    }
    await prisma.user.update({ where: { id: users.reception.id }, data: { warehouseId: wh[0] } });
    await prisma.user.update({ where: { id: users.coordinator.id }, data: { warehouseId: wh[1] } });
  });
  log('inventory + warehouses, categories, products, stock adjustments and a transfer');

  // --- A public contact form with one submission ---
  await attempt(ctx, 'form', async () => {
    const form = await admin.call('POST', '/forms', { name: 'Kërkesë për ofertë', description: 'Formulari publik ku bizneset kërkojnë një ofertë wellness.' });
    const formId = form.id ?? form.data?.id;
    const current = await prisma.clientForm.findFirstOrThrow({ where: { id: formId } });
    await admin.call('POST', `/forms/${formId}/publish`, { expectedVersion: (current as any).draftVersion ?? (current as any).version ?? 1 });
    const row = await prisma.clientForm.findFirstOrThrow({ where: { id: formId } });
    const token = row.shareToken;
    if (!token) throw new Error('the published form has no share link');
    const fetched: any = await fetch(`${ctx.apiBase}/public/forms/${token}`).then((r) => r.json());
    // The fields a visitor fills in are named inside the form's document.
    const names: string[] = [];
    const walk = (node: any) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        if (typeof node.fieldName === 'string') names.push(node.fieldName);
        Object.values(node).forEach(walk);
      }
    };
    walk(fetched.document);
    const data: Record<string, string> = {};
    for (const name of [...new Set(names)]) data[name] = /mail/i.test(name) ? 'info@bioplast.example.com' : /phone|tel/i.test(name) ? '+355692005500' : /status/i.test(name) ? 'LEAD' : 'Bioplast Sh.p.k.';
    const res = await fetch(`${ctx.apiBase}/public/forms/${token}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
    if (!res.ok) throw new Error(`submit → ${res.status} ${await res.text()}`);
  });

  // --- Spread creation dates over the last months, so lists and dashboards do not show everything as new today ---
  await attempt(ctx, 'ageing', async () => {
    const clients = await prisma.client.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    for (const [i, client] of clients.entries()) {
      const age = 30 + ((i * 37) % 210);
      await prisma.client.update({ where: { id: client.id }, data: { createdAt: at(-age, 9, 0) } });
      await prisma.contactPerson.updateMany({ where: { clientId: client.id }, data: { createdAt: at(-age, 9, 5) } });
      await prisma.deal.updateMany({ where: { clientId: client.id }, data: { createdAt: at(-age + 1, 10, 0) } });
    }
    // A member's registration date is the day of the first paid term.
    const terms = await prisma.memberTerm.findMany({ orderBy: { startsOn: 'asc' } });
    const first = new Map<string, Date>();
    for (const term of terms) if (!first.has(term.memberId)) first.set(term.memberId, term.startsOn);
    for (const [memberId, startsOn] of first) {
      await prisma.member.update({ where: { id: memberId }, data: { startsOn, createdAt: new Date(startsOn.getTime() + 9 * 3600 * 1000) } });
    }
  });
  log('ageing    + creation dates of companies, contacts, deals and members spread over the last months');

  // --- Plain columns the app sets from its jobs, set here so the records read as lived-in ---
  await attempt(ctx, 'direct fills', async () => {
    const outcomes = ['Interesim i lartë', 'Duhet ndjekje', 'Pa interes', 'Ofertë e kërkuar'];
    const cats = [] as string[];
    for (const label of outcomes) {
      const id = randomUUID();
      await prisma.outcomeCategory.create({ data: { id, tenantId, label } });
      cats.push(id);
    }
    const interactions = await prisma.interaction.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
    for (const [i, row] of interactions.entries()) {
      if (i % 2 === 0) await prisma.interaction.update({ where: { id: row.id }, data: { outcomeCategoryId: cats[i % cats.length] } });
    }
    // Meetings and visits have an end time and a place; one follow-up repeats every week.
    const meetings = await prisma.appointment.findMany({ where: { tenantId, type: { in: ['MEETING', 'VISIT', 'ONLINE_MEETING'] as any } } });
    for (const row of meetings) {
      const client = await prisma.client.findUnique({ where: { id: row.clientId } });
      await prisma.appointment.update({ where: { id: row.id }, data: { endAt: new Date(row.scheduledAt.getTime() + 60 * 60 * 1000), place: client?.streetAddress ?? 'Zyrat e klientit' } });
    }
    const followUps = await prisma.appointment.findMany({ where: { tenantId, kind: 'FOLLOW_UP' }, take: 4 });
    for (const row of followUps) await prisma.appointment.update({ where: { id: row.id }, data: { intervalDays: 7, place: row.place ?? 'Telefon' } });
    // Overdue instalments have had their overdue notice, and the owners have read some of their notifications.
    await prisma.contractPayment.updateMany({ where: { status: 'OVERDUE' as any, overdueNotifiedAt: null }, data: { overdueNotifiedAt: at(-2, 7, 30) } });
    const notes = await prisma.notification.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
    for (const [i, n] of notes.entries()) if (i % 2 === 0) await prisma.notification.update({ where: { id: n.id }, data: { readAt: at(-1, 10, 15) } });
    await prisma.notificationSettings.update({ where: { tenantId }, data: { followUpSummarySentOn: day(-1) } });
    void rng;
  });
  log('fills     + outcome categories, meeting places and end times, notification read times');
}
