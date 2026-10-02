import { AccessContext } from '../../../access/domain/AccessContext';
import { ActivityView } from '../../../clients/application/activityViews';
import { visibleChannels } from '../../../clients/application/activityAccess';
import { IDealActivityStore } from '../ports/IDealActivityStore';
import { GetDealUseCase } from './GetDealUseCase';

/**
 * The deal page's activities section (FR-ACT-05, FR-DEAL-03): the deal must
 * be in the viewer's scope (FR-DEAL-04), and notes and the other types show
 * only to those who may read them (D3).
 */
export class GetDealActivitiesUseCase {
  constructor(
    private readonly getDeal: GetDealUseCase,
    private readonly activities: IDealActivityStore
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string }): Promise<ActivityView[]> {
    await this.getDeal.execute(input);
    return this.activities.forDeal(input.tenantId, input.id, visibleChannels(input.access));
  }
}
