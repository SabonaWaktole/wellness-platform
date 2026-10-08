import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { checkFamilyLink, type FamilyLinkRefusal } from '../../domain/familyLink';
import { InvalidMemberError, MEMBER_LIMITS, normalisePersonalDetails } from '../../domain/Member';
import { MEMBERS_MANAGE } from '../membershipPermissions';
import type { CardTokenGenerator, MemberRecord } from '../ports/IMemberStore';
import type { IRelationshipStore, RelationshipRecord } from '../ports/IMembershipSettingsStore';
import type { IMembershipWriteTransaction, MembershipWriteRepos } from '../ports/IMembershipWriteTransaction';
import { MemberNotFoundError, registerMemberIn } from './MemberUseCases';

/** The link breaks a family rule (FR-FAM-03). Mapped to 409 with the reason. */
export class FamilyLinkRefusedError extends Error {
  readonly code = 'FAMILY_LINK_REFUSED';
  constructor(readonly reason: FamilyLinkRefusal | 'NOT_A_FAMILY_MEMBER') {
    super(`This family change is not allowed: ${reason}.`);
  }
}

const label = (member: { memberNumber: string; firstName: string; lastName: string }) => `${member.memberNumber} ${member.firstName} ${member.lastName}`;

/**
 * FR-FAM-01, FR-FAM-03, FR-AUD-14: adds a family member to a principal, by
 * creating a new member or linking an existing one. The relationship must be on
 * the active list and the confirmation must be ticked; who confirmed and when
 * is stored (FR-FAM-01). The family member keeps their own tier and terms, and
 * gets no sponsored term from the principal's employer (FR-FAM-08). The link,
 * the history row and the audit entry are one transaction, with both members'
 * rows locked first so two links cannot cross.
 */
export class AddFamilyMemberUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly newCardToken: CardTokenGenerator,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    timezone: string;
    principalId: string;
    body: { relationshipId?: unknown; confirmed?: unknown; memberId?: unknown; member?: Record<string, unknown>; confirmDifferentPerson?: boolean };
  }): Promise<MemberRecord> {
    input.access.ensure(MEMBERS_MANAGE);
    const { body } = input;
    const now = this.now();
    const today = dayKeyInZone(now, input.timezone);

    if (typeof body.relationshipId !== 'string' || body.relationshipId === '') {
      throw new InvalidMemberError('relationshipId', 'Choose the relationship.');
    }
    if (body.confirmed !== true) throw new InvalidMemberError('confirmation', 'Confirm that the relationship was checked.');
    const existingId = typeof body.memberId === 'string' && body.memberId !== '' ? body.memberId : null;
    if ((existingId === null) === (body.member === undefined)) {
      throw new InvalidMemberError('memberId', 'Give either an existing member or the details of a new one.');
    }
    const details = body.member === undefined ? null : normalisePersonalDetails(body.member, today);
    const relationshipId = body.relationshipId;

    return this.writeTx.run(async (repos: MembershipWriteRepos) => {
      const { memberStore, relationshipStore, paymentStore, auditTrail } = repos;
      const lockIds = [input.principalId, ...(existingId ? [existingId] : [])].sort();
      for (const id of lockIds) {
        if (!(await paymentStore.lockMember(input.tenantId, id))) throw new MemberNotFoundError();
      }
      const principal = await memberStore.find(input.tenantId, input.principalId);
      if (!principal) throw new MemberNotFoundError();
      const relationship = await relationshipStore.find(input.tenantId, relationshipId);
      // FR-FAM-02: a deactivated relationship is not offered for a new link.
      if (!relationship || !relationship.active) throw new InvalidMemberError('relationshipId', 'Choose a relationship from the active list.');

      const member = details
        ? await registerMemberIn(repos, { access: input.access, tenantId: input.tenantId, today, details, confirmDifferentPerson: body.confirmDifferentPerson, newCardToken: this.newCardToken })
        : await memberStore.find(input.tenantId, existingId!);
      if (!member) throw new MemberNotFoundError();

      const refusal = checkFamilyLink({
        memberId: member.id,
        principalId: principal.id,
        memberPrincipalId: member.principalMemberId,
        principalPrincipalId: principal.principalMemberId,
        memberHasDependants: (await memberStore.listDependants(input.tenantId, member.id)).length > 0,
      });
      if (refusal) throw new FamilyLinkRefusedError(refusal);

      await memberStore.setFamilyLink(input.tenantId, member.id, {
        principalMemberId: principal.id,
        relationshipId: relationship.id,
        confirmedBy: input.access.userId,
        confirmedAt: now,
      });
      await memberStore.addFamilyEvent({
        memberId: member.id,
        principalMemberId: principal.id,
        relationshipId: relationship.id,
        kind: 'LINKED',
        reason: null,
        byUserId: input.access.userId,
      });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Member',
        entityId: member.id,
        entityLabel: label(member),
        changes: [
          { field: 'principal', old: null, new: principal.memberNumber },
          { field: 'relationship', old: null, new: relationship.nameEn },
          { field: 'relationshipConfirmed', old: null, new: true },
          { field: 'relationshipConfirmedBy', old: null, new: input.access.userId },
          { field: 'relationshipConfirmedAt', old: null, new: now.toISOString() },
        ],
      });
      return { ...member, principalMemberId: principal.id, relationshipId: relationship.id, relationshipConfirmedBy: input.access.userId, relationshipConfirmedAt: now };
    });
  }
}

/**
 * FR-FAM-06: removes a family link, with a reason. The member keeps the
 * membership, the status and every term; later payments are at the full price
 * because the quote no longer finds a principal. The removal goes to the family
 * history and the audit trail in the same transaction.
 */
export class RemoveFamilyLinkUseCase {
  constructor(private readonly writeTx: IMembershipWriteTransaction) {}

  async execute(input: { access: AccessContext; tenantId: string; memberId: string; reason: unknown }): Promise<MemberRecord> {
    input.access.ensure(MEMBERS_MANAGE);
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason === '') throw new InvalidMemberError('reason', 'A reason is required to remove a family link.');
    if (reason.length > MEMBER_LIMITS.reason) throw new InvalidMemberError('reason', `The reason is at most ${MEMBER_LIMITS.reason} characters.`);

    return this.writeTx.run(async ({ memberStore, relationshipStore, paymentStore, auditTrail }) => {
      if (!(await paymentStore.lockMember(input.tenantId, input.memberId))) throw new MemberNotFoundError();
      const member = await memberStore.find(input.tenantId, input.memberId);
      if (!member) throw new MemberNotFoundError();
      if (!member.principalMemberId) throw new FamilyLinkRefusedError('NOT_A_FAMILY_MEMBER');

      const principal = await memberStore.find(input.tenantId, member.principalMemberId);
      const relationship = member.relationshipId ? await relationshipStore.find(input.tenantId, member.relationshipId) : null;
      await memberStore.setFamilyLink(input.tenantId, member.id, null);
      await memberStore.addFamilyEvent({
        memberId: member.id,
        principalMemberId: member.principalMemberId,
        relationshipId: member.relationshipId,
        kind: 'REMOVED',
        reason,
        byUserId: input.access.userId,
      });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Member',
        entityId: member.id,
        entityLabel: label(member),
        changes: [
          { field: 'principal', old: principal?.memberNumber ?? member.principalMemberId, new: null },
          { field: 'relationship', old: relationship?.nameEn ?? null, new: null },
          { field: 'reason', old: null, new: reason },
        ],
      });
      return { ...member, principalMemberId: null, relationshipId: null, relationshipConfirmedBy: null, relationshipConfirmedAt: null };
    });
  }
}

/**
 * FR-FAM-02: the relationships offered for a new link, for a user who may add
 * family members. The settings list needs the settings permission; this one
 * needs only "Members: manage" and shows only the active ones.
 */
export class ListFamilyRelationshipsUseCase {
  constructor(private readonly relationshipStore: IRelationshipStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<RelationshipRecord[]> {
    input.access.ensure(MEMBERS_MANAGE);
    return (await this.relationshipStore.list(input.tenantId)).filter((r) => r.active);
  }
}
