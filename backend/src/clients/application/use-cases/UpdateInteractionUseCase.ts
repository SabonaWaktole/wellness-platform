import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionScope, scopeAtLeast } from '../../../access/domain/PermissionScope';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../domain/repositories/IInteractionRepository';
import { ActivityDetails, Interaction } from '../../domain/entities/Interaction';
import { ActivityEditClosedError, ActivityNotFoundError } from '../../domain/errors';
import { ADD_ACTIVITIES, addKeyFor } from '../activityAccess';
import { ActivityReferenceReaders, checkActivityReferences } from '../activityReferences';
import { IInteractionWriteTransaction } from '../ports/IInteractionWriteTransaction';

interface UpdateInteractionDTO {
  tenantId: string;
  clientId: string;
  interactionId: string;
  access: AccessContext;
  details: ActivityDetails;
}

/**
 * Edits an activity (FR-ACT-06). The author may edit it for 24 hours after
 * recording it; after that, and for anyone else's, only a holder of
 * `activities.add` at Team scope or wider — the Sales Manager — may, and only
 * on a company inside that scope. Nobody deletes an activity.
 */
export class UpdateInteractionUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private interactionRepo: IInteractionRepository,
    private readers: ActivityReferenceReaders,
    private writeTx: IInteractionWriteTransaction,
    private now: () => Date = () => new Date()
  ) {}

  async execute(dto: UpdateInteractionDTO): Promise<Interaction> {
    const existing = await this.interactionRepo.findById(dto.interactionId);
    if (!existing || existing.tenantId !== dto.tenantId || existing.clientId !== dto.clientId) {
      throw new ActivityNotFoundError();
    }

    const key = addKeyFor(existing.channel);
    dto.access.ensure(key);
    await this.ensureCompanyInScope(dto, key);

    const now = this.now();
    const ownWithinWindow = existing.authorUserId === dto.access.userId && existing.authorMayStillEdit(now);
    if (!ownWithinWindow) {
      if (!scopeAtLeast(dto.access.scopeOf(ADD_ACTIVITIES), PermissionScope.Team)) {
        throw new ActivityEditClosedError();
      }
      await this.ensureCompanyInScope(dto, ADD_ACTIVITIES);
    }

    const edited = existing.edit(dto.details, dto.access.userId, now);
    return this.writeTx.run(async ({ interactions, deals }) => {
      await checkActivityReferences(this.readers, deals, {
        access: dto.access,
        tenantId: dto.tenantId,
        clientId: dto.clientId,
        details: edited,
        previous: existing,
      });
      await interactions.update(edited);
      return edited;
    });
  }

  /** A company outside the scope is "not found", as on every company route (FR-RBAC-11). */
  private async ensureCompanyInScope(dto: UpdateInteractionDTO, key: string): Promise<void> {
    const scope = await this.readers.scopes.resolve(dto.access, key);
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client) throw new ActivityNotFoundError();
  }
}
