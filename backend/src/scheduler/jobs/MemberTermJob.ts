import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { NotificationService } from '../../notifications/application/NotificationService';
import { addDays } from '../../contracts/domain/calendarDay';
import type { IMemberTermJobStore } from '../../membership/application/ports/IMemberTermJobStore';
import type { IMembershipSettingsStore } from '../../membership/application/ports/IMembershipSettingsStore';
import { MEMBERS_PAYMENTS_RECORD, MEMBERS_VIP_APPROVE } from '../../membership/application/membershipPermissions';
import type { ExpireMemberTermsUseCase } from '../../membership/application/use-cases/MemberTermUseCases';
import { runDailyJob } from './dailyJob';

const dayText = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * The daily Wellness+ member job (M4 Slice 8, D9, FR-TIR-05..07, FR-TIR-11,
 * FR-VIP-04, NFR-REL-02). Steps 1, 2 and 4: paid terms past their end plus the
 * grace days get their downgrade term, ended VIP terms fall back, and the stored
 * tier is brought up to date, member by member in one transaction each. Step 5:
 * the notifications. (Step 3, the sponsored sync, joins in Slice 10.)
 *
 * Built on `runDailyJob`: each workspace's own "today", and members selected by
 * state against it, so a run after a gap catches up and a second run finds
 * nothing. The actor is the system. One member failing is logged and retried on
 * the next run; one workspace failing does not stop the others.
 *
 * Notifications are marked AFTER the emit: a failed send leaves no marker and is
 * retried, a second run finds the marker and sends nothing (D9). The expiring
 * notice is one summary per workspace to everyone who can record payments
 * (FR-TIR-11 allows it); the VIP review notice is one per approved VIP, to
 * everyone who can approve VIP, `vipReviewNoticeDays` before the review date.
 */
export class MemberTermJob implements ScheduledJob {
  readonly name = 'member-term';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly queries: ISchedulerQueries,
    private readonly store: IMemberTermJobStore,
    private readonly settings: IMembershipSettingsStore,
    private readonly expire: ExpireMemberTermsUseCase,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    let changed = 0;
    let announced = 0;

    const { failedTenants } = await runDailyJob(this.queries, now, async ({ tenant, today, todayKey }) => {
      let work = 0;

      for (const memberId of await this.store.membersToReview(tenant.id, todayKey)) {
        try {
          const result = await this.expire.execute({ tenantId: tenant.id, memberId, today });
          if (result.terms > 0 || result.transitions > 0) work += 1;
        } catch (error) {
          console.error(`Scheduler: could not update the terms of member ${memberId}; retrying next run`, error);
        }
      }
      changed += work;

      const { expiringSoonDays, vipReviewNoticeDays } = (await this.settings.getSettings(tenant.id)).toJSON();
      const sent = (await this.announceExpiring(tenant.id, today, expiringSoonDays, now)) + (await this.announceVipReviews(tenant.id, today, vipReviewNoticeDays, now));
      announced += sent;
      return work + sent;
    });

    return `${changed} member(s) stepped down, ${announced} notification(s) sent${failedTenants ? `, ${failedTenants} workspace(s) failed` : ''}`;
  }

  /** FR-TIR-11: one summary per workspace for the terms that entered the window since the last run. */
  private async announceExpiring(tenantId: string, today: Date, windowDays: number, now: Date): Promise<number> {
    const terms = await this.store.termsToAnnounce(tenantId, dayText(today), dayText(addDays(today, windowDays)));
    if (terms.length === 0) return 0;
    try {
      await this.notifications.emitStrict({
        tenantId,
        toPermission: { key: MEMBERS_PAYMENTS_RECORD, subjectOwnerId: null },
        type: 'MEMBERSHIP_EXPIRING',
        params: { count: terms.length, windowDays },
        actorUserId: null,
      });
      // Marked only once the emit returned: a thrown send leaves nothing behind, so it is retried.
      await this.store.markTermsAnnounced(terms.map((term) => term.termId), now);
      return 1;
    } catch (error) {
      console.error(`Scheduler: could not announce expiring memberships for tenant ${tenantId}; retrying next run`, error);
      return 0;
    }
  }

  /** FR-VIP-04: one notice per approved VIP, once, `noticeDays` before its review date. */
  private async announceVipReviews(tenantId: string, today: Date, noticeDays: number, now: Date): Promise<number> {
    let sent = 0;
    for (const review of await this.store.vipReviewsToAnnounce(tenantId, dayText(today), dayText(addDays(today, noticeDays)))) {
      try {
        await this.notifications.emitStrict({
          tenantId,
          toPermission: { key: MEMBERS_VIP_APPROVE, subjectOwnerId: null },
          type: 'VIP_REVIEW_DUE',
          params: { memberName: review.memberName, memberNumber: review.memberNumber, reviewDate: review.reviewDate },
          actorUserId: null,
          entityType: 'MEMBER',
          entityId: review.memberId,
        });
        await this.store.markVipReviewAnnounced(review.requestId, now);
        sent += 1;
      } catch (error) {
        console.error(`Scheduler: could not announce the VIP review of member ${review.memberId}; retrying next run`, error);
      }
    }
    return sent;
  }
}
