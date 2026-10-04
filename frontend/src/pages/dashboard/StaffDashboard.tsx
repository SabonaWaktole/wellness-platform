import { getUserFirstName } from '../../utils/userUtils';
import { useTranslation } from 'react-i18next';
import styles from './StaffDashboard.module.css'; 
import { Users, CalendarCheck, AlertTriangle, History, FileText, UserPlus, CalendarPlus, Download } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button'; 
import { KPICard } from '../../components/ui/KPICard'; 
import { TimelineItem } from '../../components/ui/TimelineItem'; 
import { StaffScheduleTable } from '../../components/widgets/StaffScheduleTable'; 
import { getActivityConfig } from '../../utils/activityMapper'; 
import { useDashboardMetrics, useActivityFeed } from '../../hooks/useDashboard'; 
import { useAppointmentsByDateRange } from '../../hooks/useAppointments';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useDateFormat } from '../../hooks/useDateFormat';

/** Shown where a metric is not implemented. Matches the KPI cards. TD-013. */
const PLACEHOLDER_VALUE = '---';

export const StaffDashboard = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('dashboard');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { metrics, isLoading: isLoadingMetrics } = useDashboardMetrics();
  const { activities, isLoading: isLoadingFeed } = useActivityFeed(5);
      
  /*
   * Today's boundaries, resolved in the TENANT's timezone.
   *
   * This was `new Date(); setHours(0,0,0,0)` / `setHours(23,59,59,999)` —
   * midnight in the *browser's* zone. The "New clients" KPI directly above
   * this table is bucketed server-side by the tenant's zone, so a rep in a
   * different zone from their workspace saw a schedule computed on a different
   * day boundary from the figure beside it. That is the disagreement TD-025
   * closed everywhere else; this call site was missed because the frontend had
   * no bounds primitive to reach for. It does now. TD-029.
   */
  const { start: startOfDay, end: exclusiveEnd } = dates.dayBounds();

  /*
   * `dayBounds` is half-open `[start, end)` — the convention the server-side
   * dashboard counts already use (`gte: start, lt: end`). But the endpoint
   * behind `useAppointmentsByDateRange` is `findByDateRange`, which applies
   * `lte` and is therefore inclusive, and the calendar depends on that.
   *
   * Handing it the exclusive end would pull in an appointment scheduled at
   * exactly tomorrow's tenant-local midnight — reintroducing a disagreement
   * with the KPI in the opposite direction. Stepping back one millisecond
   * converts the half-open bound to the inclusive one this endpoint wants.
   * The repository's `lte` is noted as an inconsistency in TD-031.
   */
  const endOfDay = new Date(exclusiveEnd.getTime() - 1);

  const { appointments, isLoading: isLoadingAppointments } = useAppointmentsByDateRange(
    startOfDay.toISOString(),
    endOfDay.toISOString()
  );

  const calculateGrowth = (current: number, past: number) => {
    if (past === 0) return current > 0 ? '+100%' : '0%';
    const pct = ((current - past) / past) * 100;
    return pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
  };

  const growthPct = metrics ? calculateGrowth(metrics.totalClients, metrics.totalClientsLastWeek) : '0%';
  const isGrowthUp = metrics && metrics.totalClients >= metrics.totalClientsLastWeek;

  return (
    <div className={styles.dashboardContainer}>
             
      {/* Mobile-Only Header */}
      <div className={styles.mobileHeader}>
        <h1 className={styles.titleMobile}>{t('greetingStaffMobile', { name: getUserFirstName(user) })}</h1>
        <p className={styles.subtitleMobile}>{t('appointmentsToday', { count: appointments?.length || 0 })}</p>
      </div>

      {/* Mobile-Only Quick Actions */}
      <div className={styles.mobileQuickActions}>
        {/* Same dead-handler problem as the desktop pair below. */}
        <button
          type="button"
          className={styles.quickActionButtonPrimary}
          onClick={() => navigate(`/${tenantSlug}/clients/new`)}
        >
          <UserPlus size={24} />
          <span>{t('addClient')}</span>
        </button>
        <button
          type="button"
          className={styles.quickActionButtonSecondary}
          onClick={() => navigate(`/${tenantSlug}/appointments?plan=1`)}
        >
          <CalendarPlus size={24} />
          <span>{t('newAppointment')}</span>
        </button>
      </div>

      {/* Desktop Header */}
      <header className={styles.desktopHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>{t('greetingOwner', { name: getUserFirstName(user) })}</h1>
          <p className={styles.subtitle}>{t('subtitleStaff')}</p>
        </div>
        <div className={styles.headerActions}>
          {/*
            Was the literal "Today, Oct 24" — a fixed date that stayed on that
            day forever, on a dashboard whose whole subject is today. It now
            renders the actual current date. The button has no handler, so it is
            disabled rather than left looking like a date picker. TD-013/TD-020.
          */}
          <Button variant="outline" icon={<CalendarCheck size={18} />} disabled>
            {dates.dateMedium(new Date())}
          </Button>
          <Button variant="outline" icon={<Download size={18} />}>
            {t('exportReport')}
          </Button>
        </div>
      </header>

      {/* Desktop KPI Bento Grid */}
      <section className={styles.kpiGridDesktop}>
        <div className={styles.kpiItem}>
          <KPICard
            title={t('kpiNewClients')}
            value={isLoadingMetrics ? '...' : (metrics?.totalClients || 0)}
            icon={<Users size={24} />}
            trendValue={isLoadingMetrics ? '...' : growthPct}
            trendLabel={t('kpiVsLastWeek')}
            trendDirection={isGrowthUp ? 'up' : 'down'}
          />
        </div>
        <div className={styles.kpiItem}>
          {/*
            Was a hard-coded value="156" (TD-013), then an honest "Coming in
            Phase 5" placeholder. It is now the real count of clients whose
            `assignedUserId` is this user — computed per-user for every role, so
            the figure matches the card's own title rather than the tenant total
            already shown one card to the left.
          */}
          <KPICard
            title={t('kpiAssignedClients')}
            value={isLoadingMetrics ? '...' : (metrics?.assignedClients ?? PLACEHOLDER_VALUE)}
            icon={<Users size={24} />}
            iconColor="var(--color-secondary)"
            iconBgColor="var(--color-secondary-container)"
            trendValue={isLoadingMetrics ? undefined : t('kpiAssignedClientsTrend')}
            trendDirection="neutral"
          />
        </div>
        <div className={styles.kpiItem}>
          {/*
            Real count: quotations this rep sent that the customer has not
            answered within the workspace's configured follow-up period — the
            same definition QuotationFollowUpJob chases on, so the card and the
            reminder email can never disagree about what is overdue.

            The period is shown alongside the number. A bare "4" against an
            invisible rule is the kind of figure a rep cannot check.
          */}
          <KPICard
            title={t('kpiOpenFollowUps')}
            value={isLoadingMetrics ? '...' : (metrics?.openFollowUps ?? PLACEHOLDER_VALUE)}
            icon={<AlertTriangle size={24} />}
            trendValue={
              isLoadingMetrics || !metrics
                ? undefined
                : t('kpiFollowUpThreshold', { count: metrics.followUpThresholdDays })
            }
            trendDirection="neutral"
          />
        </div>
      </section>

      {/* Main Grid Layout */}
      <div className={styles.mainGrid}>
                 
        {/* Left Column: Schedule Table & Actions */}
        <div className={styles.leftColumn}>
                     
          <div className={styles.scheduleCard}>
            <div className={styles.scheduleHeader}>
              <div className={styles.scheduleTitleGroup}>
                <CalendarCheck size={20} color="var(--color-primary)" />
                <h2>{t('mySchedule')}</h2>
              </div>
              <Button variant="ghost">{t('viewCalendar')}</Button>
            </div>
            {isLoadingAppointments ? (
              <p style={{ padding: '1rem', color: 'var(--color-on-surface-variant)' }}>{t('loadingAppointments')}</p>
            ) : (
              <StaffScheduleTable appointments={appointments || []} />
            )}
          </div>
                     
          {/* Mobile-Only Horizontal Stats Scroll */}
          <div className={styles.mobileStatsSection}>
             <h3>{t('myStats')}</h3>
             {/*
               Every figure in this panel was invented: $12.4k / +8%, 18 /
               Target 20, 64% / -2%. A sales rep read them as their own revenue,
               close count and win rate, and the real trend arrows made them look
               computed. None of the three is derived from anything.

               They now show the same "---" and "Coming in Phase 5" disclosure
               this page's own "Open follow-ups" card already uses, a few
               elements up. Disclosure first; wiring real per-user sales metrics
               is separate work. TD-013.
             */}
             <div className={styles.statsScrollContainer}>
                <div className={styles.statCard}>
                   <span className={styles.statLabel}>{t('statRevenue')}</span>
                   <span className={styles.statValue}>{PLACEHOLDER_VALUE}</span>
                   <div className={styles.statTrendNeutral}>{t('comingPhase5')}</div>
                </div>
                <div className={styles.statCard}>
                   <span className={styles.statLabel}>{t('statClosed')}</span>
                   <span className={styles.statValue}>{PLACEHOLDER_VALUE}</span>
                   <div className={styles.statTrendNeutral}>{t('comingPhase5')}</div>
                </div>
                <div className={styles.statCard}>
                   <span className={styles.statLabel}>{t('statWinRate')}</span>
                   <span className={styles.statValue}>{PLACEHOLDER_VALUE}</span>
                   <div className={styles.statTrendNeutral}>{t('comingPhase5')}</div>
                </div>
             </div>
          </div>

          {/*
            Desktop-Only Quick Actions.

            Both of these were bare <div>s with no handler — styled to look and
            hover like buttons (see .glassButton, which already carries
            `cursor: pointer` and a `:focus-visible` ring), but inert on click
            and unreachable by keyboard. They are real <button>s now.

            "Log note" has no destination of its own: an interaction always
            hangs off a client, and there is no tenant-level note. It therefore
            hands off to the client list carrying `?logInteraction=NOTE`, which
            the list forwards on row click and the detail page consumes by
            opening its note slide-over. Two clicks, but each one lands
            somewhere real.
          */}
          <div className={styles.desktopQuickActions}>
             <button
               type="button"
               className={styles.glassButton}
               onClick={() => navigate(`/${tenantSlug}/appointments?plan=1`)}
             >
                <CalendarPlus size={32} color="var(--color-primary)" />
                <div className={styles.glassButtonContent}>
                  <h3>{t('scheduleAppointment')}</h3>
                  <p>{t('scheduleAppointmentDesc')}</p>
                </div>
             </button>
             <button
               type="button"
               className={styles.glassButton}
               onClick={() => navigate(`/${tenantSlug}/clients?logInteraction=NOTE`)}
             >
                <FileText size={32} color="var(--color-secondary)" />
                <div className={styles.glassButtonContent}>
                  <h3>{t('logNote')}</h3>
                  <p>{t('logNoteDesc')}</p>
                </div>
             </button>
          </div>
         </div>
         
         {/* Right Column: Activity Feed */}
        <div className={styles.rightColumn}>
          <div className={styles.feedCard}>
            <div className={styles.feedHeader}>
              <div className={styles.feedTitleGroup}>
                <History size={20} color="var(--color-on-surface-variant)" />
                <h2>{t('myActivity')}</h2>
              </div>
            </div>
                         
            <div className={styles.feedList}>
              {isLoadingFeed ? (
                <p style={{ padding: '1rem', color: 'var(--color-on-surface-variant)' }}>Loading activity...</p>
              ) : activities.length === 0 ? (
                <p style={{ padding: '1rem', color: 'var(--color-on-surface-variant)' }}>No recent activity.</p>
              ) : (
                activities.map((activity, index) => {
                  const config = getActivityConfig(activity.type);
                  return (
                    <TimelineItem 
                      key={activity.id}
                      title={activity.type.replace(/_/g, ' ')}
                      subtitle={dates.dateTime(activity.timestamp)}
                      content={`${activity.actor.name}: ${activity.description}`}
                      icon={config.icon}
                      iconTextColor={config.color}
                      iconBgColor={config.bg}
                      isLast={index === activities.length - 1}
                    />
                  );
                })
              )}
            </div>
                         
            <div className={styles.feedFooter}>
              <Button variant="ghost" fullWidth>{t('viewAllActivity')}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
