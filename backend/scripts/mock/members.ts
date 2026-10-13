import ExcelJS from 'exceljs';
import { MEMBER_FIRST_NAMES, MEMBER_LAST_NAMES } from './dataset';
import { Api, Ctx, day } from './support';

const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** Wellness+ members, written through the membership API as an Administrator. */
export async function seedMembers(ctx: Ctx): Promise<void> {
  const { prisma, tenantId, users, rng, log } = ctx;
  const admin = users.admin.api;
  const reception = users.reception.api;
  const cities = await prisma.city.findMany({ where: { tenantId, active: true } });
  const relationships = await prisma.familyRelationship.findMany({ where: { tenantId, active: true }, orderBy: { order: 'asc' } });
  const spouse = relationships.find((r) => r.nameEn.toLowerCase().includes('spouse') || r.nameEn.toLowerCase().includes('partner')) ?? relationships[0];
  const child = relationships.find((r) => r.nameEn.toLowerCase().includes('child')) ?? relationships[1] ?? relationships[0];
  const parent = relationships.find((r) => r.nameEn.toLowerCase().includes('parent')) ?? relationships[2] ?? relationships[0];

  let nameIndex = 0;
  const person = (language = 'sq') => {
    const firstName = MEMBER_FIRST_NAMES[nameIndex % MEMBER_FIRST_NAMES.length];
    const lastName = MEMBER_LAST_NAMES[(nameIndex * 7 + 3) % MEMBER_LAST_NAMES.length];
    nameIndex += 1;
    const year = rng.int(1962, 2004);
    return {
      firstName,
      lastName,
      dateOfBirth: `${year}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
      phone: `+3556${rng.int(7, 9)}${String(rng.int(1000000, 9999999))}`,
      email: `${ascii(firstName)}.${ascii(lastName)}${nameIndex}@example.com`,
      language,
      cityId: rng.pick(cities).id,
      note: nameIndex % 3 === 0 ? 'Preferon takime në mëngjes; kontakti i parë u bë në panairin e shëndetit.' : 'Regjistruar në recepsion.',
    };
  };

  // --- Individual members, each with a first payment -----------------------
  const tiers = ['SILVER', 'GOLD', 'SILVER', 'GOLD', 'SILVER', 'GOLD'] as const; // Bronze has no fee: employers' contracts grant it.
  const methods = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;
  const members: Array<{ id: string; tier: string }> = [];
  const payments: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    const created = await admin.call('POST', '/membership/members', person(i % 5 === 4 ? 'en' : 'sq'));
    const id = (created.data ?? created).id as string;
    const tier = tiers[i % tiers.length];
    const paid = await admin.call('POST', `/membership/members/${id}/payments`, {
      kind: 'NEW',
      targetTier: tier,
      method: methods[i % methods.length],
      receivedOn: day(-(8 + i * 11)),
      note: i % 2 === 0 ? 'Pagesë e parë e anëtarësisë, e marrë në recepsion.' : 'Pagesë me transfertë bankare, referenca në faturë.',
    });
    payments.push((paid.data ?? paid).id);
    members.push({ id, tier });
  }
  log(`member    + ${members.length} members with a first payment each`);

  // --- A second payment for some: an upgrade, where the app offers one --------
  let upgrades = 0;
  for (const [i, member] of members.entries()) {
    if (i % 5 !== 0) continue;
    const options = await admin.call('GET', `/membership/members/${member.id}/payments/options?receivedOn=${day(0)}`);
    const list: Array<{ kind: string; targetTier: string }> = (options.data ?? options).options ?? (options.data ?? options).choices ?? [];
    const upgrade = list.find((o) => o.kind === 'UPGRADE');
    if (!upgrade) continue;
    await admin.call('POST', `/membership/members/${member.id}/payments`, {
      kind: 'UPGRADE', targetTier: upgrade.targetTier, method: 'BANK_TRANSFER', receivedOn: day(0), note: 'Kalim në nivel më të lartë me diferencën e çmimit.',
    });
    upgrades += 1;
  }
  // One payment entered by mistake is voided with a reason.
  await admin.call('POST', `/membership/payments/${payments[5]}/void`, { reason: 'Pagesa u regjistrua dy herë nga gabimi; kopja u anulua.' });
  log(`member    + ${upgrades} upgrades and one voided payment`);

  // --- A member whose year is almost over, then renewed (the new term follows the old one) ---
  const renewing = await admin.call('POST', '/membership/members', person());
  const renewingId = (renewing.data ?? renewing).id as string;
  await admin.call('POST', `/membership/members/${renewingId}/payments`, { kind: 'NEW', targetTier: 'GOLD', method: 'BANK_TRANSFER', receivedOn: day(-345), note: 'Pagesa vjetore e vitit të kaluar.' });
  await admin.call('POST', `/membership/members/${renewingId}/payments`, { kind: 'RENEWAL', targetTier: 'GOLD', method: 'CARD', receivedOn: day(0), note: 'Rinovim para përfundimit të afatit.' });

  // --- Families: a spouse and children, a new dependant and an existing member linked ---
  const principals = [members[0], members[3], members[6]];
  for (const [n, principal] of principals.entries()) {
    await admin.call('POST', `/membership/members/${principal.id}/family`, { relationshipId: spouse.id, confirmed: true, member: person() });
    await admin.call('POST', `/membership/members/${principal.id}/family`, { relationshipId: child.id, confirmed: true, member: { ...person(), dateOfBirth: `${rng.int(2008, 2020)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}` } });
    if (n === 0) await admin.call('POST', `/membership/members/${principal.id}/family`, { relationshipId: parent.id, confirmed: true, memberId: members[14].id });
  }
  // A dependant who left the family group (the removal is recorded with its reason).
  const dependant = await prisma.member.findFirstOrThrow({ where: { tenantId, principalMemberId: members[3].id } });
  await admin.call('POST', `/membership/members/${dependant.id}/family/remove`, { reason: 'Anëtari kërkoi të ketë anëtarësi të pavarur.' });
  log('family    + three family groups, one existing member linked, one dependant removed');

  // --- VIP requests: approved, rejected and ended ---------------------------
  const vipReason = 'Klient i rëndësishëm që rekomandon shërbimin te kompani të tjera dhe ka anëtarësi të vazhdueshme.';
  // Requested by the Sales Manager (or Reception), decided by the Administrator: nobody approves their own request.
  const requester = async (memberId: string) => {
    return users.coordinator.api.call('POST', `/membership/members/${memberId}/vip/request`, { reason: vipReason });
  };
  for (const index of [2, 7, 9]) await requester(members[index].id);
  const requests = await prisma.vipRequest.findMany({ where: { tenantId, status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
  for (const [n, request] of requests.entries()) {
    await admin.call('POST', `/membership/members/vip/requests/${request.id}/decision`, {
      decision: n === 2 ? 'REJECT' : 'APPROVE',
      note: n === 2 ? 'Kriteret e VIP nuk plotësohen ende.' : 'Miratohet për një vit.',
    });
  }
  const approved = await prisma.vipRequest.findFirst({ where: { tenantId, status: 'APPROVED' }, orderBy: { createdAt: 'desc' } });
  if (approved) await admin.call('POST', `/membership/members/${approved.memberId}/vip/end`, { reason: 'VIP përfundoi sipas kërkesës së anëtarit.' });
  // A fresh request still waiting for a decision.
  await requester(members[12].id);
  log('vip       + requests approved, rejected, ended and pending');

  // --- Status changes: suspended, reinstated, closed, reopened ---------------
  await admin.call('POST', `/membership/members/${members[10].id}/status`, { action: 'SUSPEND', reason: 'Kontroll i dokumenteve të pagesës.' });
  await admin.call('POST', `/membership/members/${members[11].id}/status`, { action: 'CLOSE', reason: 'Anëtari u shpërngul jashtë vendit.' });
  await admin.call('POST', `/membership/members/${members[13].id}/status`, { action: 'SUSPEND', reason: 'Pezullim i përkohshëm sipas kërkesës.' });
  await admin.call('POST', `/membership/members/${members[13].id}/status`, { action: 'REINSTATE', reason: 'Dokumentet u plotësuan.' });
  await admin.call('POST', `/membership/members/${members[15].id}/status`, { action: 'CLOSE', reason: 'Mbyllje me kërkesë të anëtarit.' });
  await admin.call('POST', `/membership/members/${members[15].id}/status`, { action: 'REOPEN', reason: 'Anëtari u kthye dhe kërkoi rihapjen.' });
  // The Administrator corrects one tier, with the end date and the reason on record.
  await admin.call('POST', `/membership/members/${members[1].id}/correct-tier`, { tier: 'GOLD', endsOn: day(200), reason: 'Korrigjim pas gabimit në nivelin e zgjedhur në recepsion.' });
  // A member's details are edited once, so the record has an edit behind it.
  await admin.call('PATCH', `/membership/members/${members[4].id}`, { note: 'Numri i telefonit u përditësua pas kontaktit me anëtarin.' });
  log('member    + suspensions, reinstatements, closures, a reopening and a tier correction');

  // --- Corporate employees, uploaded as a spreadsheet for two companies with a valid contract ---
  await importEmployees(ctx, admin, 'Hotel Dajti Park', 7);
  await importEmployees(ctx, admin, 'Contact Plus', 7);
  const employer = await prisma.client.findFirstOrThrow({ where: { tenantId, name: 'Contact Plus' } });
  const employees = await prisma.member.findMany({ where: { tenantId, employerClientId: employer.id }, orderBy: { createdAt: 'asc' } });
  if (employees.length >= 3) {
    await admin.call('POST', `/membership/members/${employees[0].id}/remove-employer`, { leftOn: day(-3), reason: 'Punonjësi dha dorëheqjen.' });
    await admin.call('POST', '/membership/members/remove-employees', { memberIds: [employees[1].id, employees[2].id], leftOn: day(-1), reason: 'Largim nga kompania në fund të periudhës së provës.' });
  }
  log('employee  + two company employee imports, one employee and two more removed');

  // --- Cards: links shown to staff, one replaced, then checked at the desk ---
  for (const member of members.slice(0, 4)) await admin.call('GET', `/membership/members/${member.id}/card-link`);
  await admin.call('POST', `/membership/members/${members[4].id}/card-link/replace`, {});
  const active = await prisma.member.findMany({ where: { tenantId, status: 'ACTIVE', principalMemberId: null }, orderBy: { createdAt: 'asc' }, take: 5 });
  for (const member of active.slice(0, 3)) await reception.call('GET', `/membership/verify/by-token/${member.cardToken}`);
  await reception.call('GET', `/membership/verify/search?query=${encodeURIComponent(active[0].lastName)}`);
  await reception.call('POST', `/membership/verify/members/${active[3].id}`, { identityChoice: 'BIRTH_DATE' }).catch(() => reception.call('POST', `/membership/verify/members/${active[3].id}`, {}));
  await reception.call('GET', '/membership/verify/by-token/unknown-card-token-0000').catch(() => undefined);
  // The same check from a phone, with no sign-in, as a partner clinic would do it.
  await fetch(`${ctx.apiBase}/public/verify/${active[1].cardToken}`);
  await fetch(`${ctx.apiBase}/public/cards/${active[2].cardToken}`);
  log('card      + links shown, one replaced, and card checks at reception and from the public page');
}

/** Builds the spreadsheet a company would send and uploads it as the app's own import. */
async function importEmployees(ctx: Ctx, api: Api, companyName: string, count: number): Promise<void> {
  const { prisma, tenantId, rng } = ctx;
  const client = await prisma.client.findFirstOrThrow({ where: { tenantId, name: companyName } });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Punonjësit');
  sheet.addRow(['Emri*', 'Mbiemri*', 'Data e lindjes', 'Telefoni', 'Email', 'Gjuha']);
  const slug = ascii(companyName);
  for (let i = 0; i < count; i += 1) {
    const firstName = MEMBER_FIRST_NAMES[(i * 3 + companyName.length) % MEMBER_FIRST_NAMES.length];
    const lastName = MEMBER_LAST_NAMES[(i * 5 + companyName.length) % MEMBER_LAST_NAMES.length];
    sheet.addRow([firstName, lastName, `${rng.int(1970, 2002)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}`, `+3556${rng.int(7, 9)}${rng.int(1000000, 9999999)}`, `${ascii(firstName)}.${ascii(lastName)}@${slug}.example.com`, i % 4 === 3 ? 'en' : 'sq']);
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const form = new FormData();
  form.append('clientId', client.id);
  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `punonjesit-${slug}.xlsx`);
  const preview = await api.form('/membership/employee-imports', form);
  const body = preview.data ?? preview;
  await api.call('POST', `/membership/employee-imports/${body.id}/confirm`, { confirmToken: body.confirmToken });
}
