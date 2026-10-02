import { ActivityView } from '../../../clients/application/activityViews';

/** The activities linked to a deal (FR-ACT-05, FR-DEAL-03). */
export interface IDealActivityStore {
  /** Newest first by when they happened; only the given types (D3). */
  forDeal(tenantId: string, dealId: string, channels: string[]): Promise<ActivityView[]>;
}
