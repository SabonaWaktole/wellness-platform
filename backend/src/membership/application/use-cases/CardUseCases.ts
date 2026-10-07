import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { hashCardToken, isWellFormedCardToken, cardPath, verificationPath } from '../../domain/cardToken';
import { effectiveTierOn, validTermsOn, type MemberTermValue } from '../../domain/MemberTerm';
import { validityOn } from '../../domain/memberValidity';
import { MEMBERS_MANAGE } from '../membershipPermissions';
import type { CardTokenGenerator, IMemberStore, MemberRecord } from '../ports/IMemberStore';
import type { ICardStore, IQrCodeRenderer } from '../ports/ICardStore';
import type { IBenefitStore, IMembershipSettingsStore } from '../ports/IMembershipSettingsStore';
import type { IMemberPaymentStore } from '../ports/IMemberPaymentStore';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';
import type { IEmployeeSheetWriter } from '../ports/IEmployeeImportStore';
import { presentPublicCard, type PublicCard } from '../presentPublicCard';
import { SponsorValidity } from '../SponsorValidity';
import { MemberNotFoundError } from './MemberUseCases';
import { EmployeeImportNotFoundError } from '../employeeImportErrors';

/** Builds an absolute link from a path, from the one configured public address (NFR-OPS-05). */
export type PublicLinkBuilder = (path: string) => string;

const day = (date: Date): string => date.toISOString().slice(0, 10);
const dayDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export type PublicCardOutcome = { kind: 'card'; card: PublicCard } | { kind: 'replaced' } | { kind: 'not-found' };

/**
 * FR-CRD-01..03, FR-CRD-08, FR-BEN-03, D2: the answer for a card link. No
 * login and no tenant in the request, so the token alone says whose card it
 * is. The tier is calculated now from the terms, not read from the stored copy,
 * so the card is right before the daily job has run. A malformed or unknown
 * token is "not found"; a token that was replaced says so (D11).
 */
export class GetPublicCardUseCase {
  constructor(
    private readonly cards: ICardStore,
    private readonly members: IMemberStore,
    private readonly settings: IMembershipSettingsStore,
    private readonly benefits: IBenefitStore,
    private readonly payments: IMemberPaymentStore,
    private readonly qr: IQrCodeRenderer,
    private readonly link: PublicLinkBuilder,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(token: unknown): Promise<PublicCardOutcome> {
    if (!isWellFormedCardToken(token)) return { kind: 'not-found' };
    const owner = await this.cards.resolve(token);
    if (!owner) return (await this.cards.wasReplaced(hashCardToken(token))) ? { kind: 'replaced' } : { kind: 'not-found' };

    const member = await this.members.find(owner.tenantId, owner.memberId);
    if (!member) return { kind: 'not-found' };

    const now = this.now();
    const today = dayDate(dayKeyInZone(now, owner.timezone));
    const [terms, tiers, settings, services] = await Promise.all([
      this.members.listTerms(member.id),
      this.settings.getTiers(owner.tenantId),
      this.settings.getSettings(owner.tenantId).then((s) => s.toJSON()),
      this.benefits.list(owner.tenantId),
    ]);
    const sponsor = member.employerClientId
      ? (await new SponsorValidity(this.payments).forCompanies(owner.tenantId, [member.employerClientId], day(today))).get(member.employerClientId)
      : undefined;

    const values: MemberTermValue[] = terms.map((t) => ({
      tier: t.tier,
      source: t.source,
      startsOn: dayDate(t.startsOn),
      endsOn: t.endsOn ? dayDate(t.endsOn) : null,
    }));
    const tier = effectiveTierOn(values, sponsor?.valid ?? false, settings.graceDays, today);
    const current = validTermsOn(values, sponsor?.valid ?? false, settings.graceDays, today)
      .filter((v) => v.tier === tier)
      .sort((a, b) => (b.endsOn?.getTime() ?? Infinity) - (a.endsOn?.getTime() ?? Infinity))[0];
    const validUntil = !current ? null : current.source === 'SPONSORED' ? (sponsor?.endsOn ?? null) : current.endsOn ? day(current.endsOn) : null;
    const valid = validityOn(member.status, tier, null).valid && member.anonymisedAt === null;

    const setting = tiers.find((t) => t.tier === tier);
    return {
      kind: 'card',
      card: presentPublicCard({
        firstName: member.firstName,
        lastName: member.lastName,
        memberNumber: member.memberNumber,
        language: member.language,
        valid,
        tier: { tier, labelSq: setting?.labelSq ?? tier, labelEn: setting?.labelEn ?? tier, colour: setting?.colour ?? '#888888' },
        validUntil,
        benefits: valid
          ? services.filter((s) => s.active && s.discounts[tier] !== null).map((s) => ({ nameSq: s.nameSq, nameEn: s.nameEn, percent: s.discounts[tier] as string }))
          : [],
        qrSvg: valid ? await this.qr.svg(this.link(verificationPath(token))) : '',
        generatedAt: now,
      }),
    };
  }
}

const label = (m: MemberRecord): string => `${m.memberNumber} ${m.firstName} ${m.lastName}`;

/** FR-CRD-09: the link staff show, copy and print. Needs "Members: manage". */
export class GetCardLinkUseCase {
  constructor(
    private readonly cards: ICardStore,
    private readonly qr: IQrCodeRenderer,
    private readonly link: PublicLinkBuilder
  ) {}

  /** The card address, what the QR holds and the QR itself, so the member page can show and print it. */
  async execute(input: { access: AccessContext; tenantId: string; memberId: string }): Promise<{ url: string; qrPayload: string; qrSvg: string }> {
    input.access.ensure(MEMBERS_MANAGE);
    const token = await this.cards.tokenOf(input.tenantId, input.memberId);
    if (!token) throw new MemberNotFoundError();
    const qrPayload = this.link(verificationPath(token));
    return { url: this.link(cardPath(token)), qrPayload, qrSvg: await this.qr.svg(qrPayload) };
  }
}

/**
 * FR-CRD-10, FR-AUD-16: a new link for the member, the old one answering "This
 * card was replaced". One transaction: the new token, the hash of the old one
 * and the audit entry, which says who and when and holds no token.
 */
export class ReplaceCardLinkUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly newCardToken: CardTokenGenerator,
    private readonly link: PublicLinkBuilder
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; memberId: string }): Promise<{ url: string }> {
    input.access.ensure(MEMBERS_MANAGE);
    return this.writeTx.run(async ({ memberStore, cardStore, auditTrail }) => {
      const member = await memberStore.find(input.tenantId, input.memberId);
      const oldToken = member ? await cardStore.tokenOf(input.tenantId, member.id) : null;
      if (!member || !oldToken) throw new MemberNotFoundError();

      const newToken = this.newCardToken();
      if (!(await cardStore.replace(input.tenantId, member.id, oldToken, newToken))) throw new MemberNotFoundError();
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Member',
        entityId: member.id,
        entityLabel: label(member),
        changes: [{ field: 'cardLink', old: 'issued', new: 'replaced' }],
      });
      return { url: this.link(cardPath(newToken)) };
    });
  }
}

export interface CardLinkRow {
  memberNumber: string;
  name: string;
  url: string;
}

/**
 * FR-EMP-08: name, member number and card link for every member of an upload,
 * for the company to receive. The export is audited, with the upload and the
 * count and no link (FR-AUD-16).
 */
export class ExportUploadCardLinksUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly writer: IEmployeeSheetWriter,
    private readonly link: PublicLinkBuilder
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; importId: string }): Promise<{ fileName: string; file: Buffer }> {
    input.access.ensure(MEMBERS_MANAGE);
    const { fileName, rows } = await this.writeTx.run(async ({ importStore, memberStore, cardStore, auditTrail }) => {
      const upload = await importStore.find(input.tenantId, input.importId);
      if (!upload || upload.status !== 'CONFIRMED') throw new EmployeeImportNotFoundError();

      const ids = upload.memberIds ?? [];
      const tokens = await cardStore.tokensOf(input.tenantId, ids);
      const rows: CardLinkRow[] = [];
      for (const id of ids) {
        const member = tokens[id] ? await memberStore.find(input.tenantId, id) : null;
        if (member) rows.push({ memberNumber: member.memberNumber, name: `${member.firstName} ${member.lastName}`, url: this.link(cardPath(tokens[id])) });
      }
      rows.sort((a, b) => a.memberNumber.localeCompare(b.memberNumber));

      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Export,
        entityType: 'Member',
        entityId: upload.id,
        entityLabel: `Card links of upload ${upload.fileName}`,
        changes: [
          { field: 'fileName', old: null, new: upload.fileName },
          { field: 'cardLinks', old: null, new: rows.length },
        ],
      });
      return { fileName: `${upload.fileName.replace(/\.xlsx$/i, '')}-card-links.xlsx`, rows };
    });
    return { fileName, file: await this.writer.cardLinks(rows) };
  }
}

