import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AddInteractionUseCase } from '../../../clients/application/use-cases/AddInteractionUseCase';
import { ActivityDetails, Interaction } from '../../../clients/domain/entities/Interaction';
import { FollowUpClosedError, FollowUpNotFoundError } from '../../domain/followUps/errors';
import { MANAGE_FOLLOW_UPS, followUpInScope } from './followUpAccess';
import { atTime, FollowUpView } from './followUpViews';
import { IFollowUpStore } from './ports/IFollowUpStore';
import { IFollowUpWriteTransaction } from './ports/IFollowUpWriteTransaction';

/**
 * FR-FUP-06: a follow-up is completed by recording the activity that
 * happened. The activity goes through the same rules as any other (FR-ACT-02,
 * FR-DEAL-08), and the follow-up closes, linked to it, in the same
 * transaction: a refused activity leaves the follow-up open.
 */
export class CompleteFollowUpUseCase {
  constructor(
    private readonly store: IFollowUpStore,
    private readonly writeTx: IFollowUpWriteTransaction,
    private readonly addInteraction: AddInteractionUseCase,
    private readonly scopes: RecordScopeResolver,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    id: string;
    activity: ActivityDetails;
  }): Promise<{ followUp: FollowUpView; activity: Interaction }> {
    input.access.ensure(MANAGE_FOLLOW_UPS);
    // Found and in scope, and still open, before anything is recorded.
    const followUp = await this.writeTx.run(({ followUps }) =>
      followUpInScope(followUps, this.scopes, input.access, MANAGE_FOLLOW_UPS, input.tenantId, input.id)
    );
    if (!followUp.isOpen) throw new FollowUpClosedError();

    const activity = await this.addInteraction.execute(
      { ...input.activity, tenantId: input.tenantId, clientId: followUp.clientId, authorUserId: input.access.userId, access: input.access },
      async ({ followUps }, interaction) => {
        // Read again on the transaction's connection: a second click may have closed it meanwhile.
        const live = await followUps.find(input.tenantId, input.id);
        if (!live) throw new FollowUpNotFoundError();
        live.complete(interaction.id, this.now());
        await followUps.update(live);
      }
    );

    return { followUp: atTime((await this.store.view(input.tenantId, input.id))!, this.now()), activity };
  }
}
