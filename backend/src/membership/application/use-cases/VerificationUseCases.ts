import type { AccessContext } from '../../../access/domain/AccessContext';
import { hashAddress, type IdentityChoice, type VerificationChannel, type VerificationResult } from '../../domain/verification';
import { isWellFormedCardToken } from '../../domain/cardToken';
import { MEMBERS_VERIFY } from '../membershipPermissions';
import type { MemberStandingResolver } from '../memberStanding';
import type { ICardStore } from '../ports/ICardStore';
import type { IMemberStore, MemberRecord } from '../ports/IMemberStore';
import type { IVerificationStore } from '../ports/IVerificationStore';
import {
  presentMemberForPublicVerification,
  presentMemberForVerification,
  presentNotValidForPublic,
  presentVerificationNotFound,
  type PublicVerification,
  type ReceptionVerification,
  type VerificationCandidate,
} from '../presentVerification';

export class VerificationNotFoundError extends Error {
  readonly code = 'VERIFICATION_NOT_FOUND';
  constructor() {
    super('Verification not found.');
  }
}

export class InvalidIdentityChoiceError extends Error {
  readonly code = 'INVALID_IDENTITY_CHOICE';
  constructor() {
    super('The identity choice must be CONFIRMED or MISMATCH.');
  }
}

const resultOf = (valid: boolean): VerificationResult => (valid ? 'VALID' : 'NOT_VALID');

/**
 * FR-VER-01..06: Reception checks a card, by the scanned token or by choosing
 * a member from a search. The answer is calculated now from the terms and the
 * status, so a suspension shows at the next check (FR-VER-05), and every check
 * is written to the verification log with the user (FR-VER-06). A token of
 * another workspace, an unknown token and a replaced token all answer
 * "Member not found" (FR-VER-04).
 */
export class VerifyMemberUseCase {
  constructor(
    private readonly cards: ICardStore,
    private readonly members: IMemberStore,
    private readonly standing: MemberStandingResolver,
    private readonly events: IVerificationStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async byToken(input: { access: AccessContext; tenantId: string; timezone: string; token: unknown }): Promise<ReceptionVerification> {
    input.access.ensure(MEMBERS_VERIFY);
    const owner = isWellFormedCardToken(input.token) ? await this.cards.resolve(input.token) : null;
    const member = owner && owner.tenantId === input.tenantId ? await this.members.find(input.tenantId, owner.memberId) : null;
    return this.verify(input, member, 'RECEPTION_SCAN');
  }

  async byMemberId(input: { access: AccessContext; tenantId: string; timezone: string; memberId: string }): Promise<ReceptionVerification> {
    input.access.ensure(MEMBERS_VERIFY);
    return this.verify(input, await this.members.find(input.tenantId, input.memberId), 'RECEPTION_SEARCH');
  }

  /** FR-VER-01: member ID, name, phone or email. Only a name and a number come back; the choice is then verified like any other. */
  async search(input: { access: AccessContext; tenantId: string; query: unknown }): Promise<VerificationCandidate[]> {
    input.access.ensure(MEMBERS_VERIFY);
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (query.length < 2) return [];
    const { data } = await this.members.search(input.tenantId, { query, sortBy: 'name', sortDir: 'asc', page: 1, limit: 10 });
    return data.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), memberNumber: m.memberNumber }));
  }

  private async verify(input: { access: AccessContext; tenantId: string; timezone: string }, member: MemberRecord | null, channel: VerificationChannel): Promise<ReceptionVerification> {
    if (!member) {
      const id = await this.events.record({ tenantId: input.tenantId, memberId: null, channel, userId: input.access.userId, result: 'NOT_FOUND', ipHash: null });
      return presentVerificationNotFound(id);
    }
    const standing = await this.standing.resolve(input.tenantId, input.timezone, member, this.now());
    const verificationId = await this.events.record({ tenantId: input.tenantId, memberId: member.id, channel, userId: input.access.userId, result: resultOf(standing.valid), ipHash: null });
    return presentMemberForVerification({
      verificationId,
      valid: standing.valid,
      reason: standing.reason,
      firstName: member.firstName,
      lastName: member.lastName,
      memberNumber: member.memberNumber,
      tier: standing.tierLabel,
      validUntil: standing.validUntil,
      status: member.status,
      dateOfBirth: member.dateOfBirth,
      discounts: standing.discounts,
    });
  }
}

/** FR-VER-03, FR-VER-06: Reception records what the identity check found, on the check it just made. */
export class RecordIdentityCheckUseCase {
  constructor(private readonly events: IVerificationStore) {}

  async execute(input: { access: AccessContext; tenantId: string; verificationId: string; choice: unknown }): Promise<{ identityChoice: IdentityChoice }> {
    input.access.ensure(MEMBERS_VERIFY);
    if (input.choice !== 'CONFIRMED' && input.choice !== 'MISMATCH') throw new InvalidIdentityChoiceError();
    if (!(await this.events.setIdentity(input.tenantId, input.verificationId, input.access.userId, input.choice))) throw new VerificationNotFoundError();
    return { identityChoice: input.choice };
  }
}

/**
 * FR-VER-07..10: what a partner clinic's phone sees when it scans the card
 * with its ordinary camera. No login. A valid member shows name, member ID,
 * tier and valid-until date; a suspended, closed, unknown or replaced card all
 * give the same neutral "Not valid" with the same status, so the page cannot be
 * used to learn anything about a person. Every scan of a known card is logged
 * with a keyed hash of the caller's address; an unknown token belongs to no
 * workspace and is not logged.
 */
export class PublicVerifyUseCase {
  constructor(
    private readonly cards: ICardStore,
    private readonly members: IMemberStore,
    private readonly standing: MemberStandingResolver,
    private readonly events: IVerificationStore,
    private readonly addressSecret: () => string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { token: unknown; address: string }): Promise<PublicVerification> {
    if (!isWellFormedCardToken(input.token)) return presentNotValidForPublic();
    const owner = await this.cards.resolve(input.token);
    if (!owner) return presentNotValidForPublic();
    const member = await this.members.find(owner.tenantId, owner.memberId);
    if (!member) return presentNotValidForPublic();

    const standing = await this.standing.resolve(owner.tenantId, owner.timezone, member, this.now());
    await this.events.record({
      tenantId: owner.tenantId,
      memberId: member.id,
      channel: 'PARTNER_SCAN',
      userId: null,
      result: resultOf(standing.valid),
      ipHash: hashAddress(input.address, this.addressSecret()),
    });
    if (!standing.valid) return presentNotValidForPublic();
    return presentMemberForPublicVerification({ firstName: member.firstName, lastName: member.lastName, memberNumber: member.memberNumber, tier: standing.tierLabel, validUntil: standing.validUntil });
  }
}
