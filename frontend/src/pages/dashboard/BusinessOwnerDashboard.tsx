import { getUserFirstName } from '../../utils/userUtils';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { listContainerVariants, listItemVariants } from '../../lib/motion';
import styles from './BusinessOwnerDashboard.module.css'; import {    Users,    CalendarCheck,    Clock,    Package,    Plus,   History } from 'lucide-react'; import { Button } from '../../components/ui/Button/Button'; import { KPICard } from '../../components/ui/KPICard'; import { UpcomingAppointmentsWidget } from '../../components/widgets/UpcomingAppointmentsWidget'; import { TimelineItem } from '../../components/ui/TimelineItem'; import { getActivityConfig } from '../../utils/activityMapper'; import { useNavigate, useParams } from 'react-router-dom'; import { useDashboardMetrics, useActivityFeed } from '../../hooks/useDashboard'; import { useAuthStore } from '../../store/useAuthStore';
import { useDateFormat } from '../../hooks/useDateFormat';

export const BusinessOwnerDashboard = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('dashboard');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { metrics, isLoading: isLoadingMetrics } = useDashboardMetrics();
  const { activities, isLoading: isLoadingFeed } = useActivityFeed(5);

  const calculateGrowth = (current: number, past: number) => {
    if (past === 0) return current > 0 ? '+100%' : '0%';
    const pct = ((current - past) / past) * 100;
    return pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
  };

  const growthPct = metrics ? calculateGrowth(metrics.totalClients, metrics.totalClientsLastWeek) : '0%';
  const isGrowthUp = metrics && metrics.totalClients >= metrics.totalClientsLastWeek;

  // Appointments: a signed day-over-day delta rather than a percentage, since
  // these are small whole numbers where "+2" reads better than "+40%".
  const appointmentDelta = metrics
    ? metrics.appointmentsToday - metrics.appointmentsYesterday
    : 0;
  const appointmentTrend =
    appointmentDelta > 0 ? `+${appointmentDelta}` : `${appointmentDelta}`;

  // Quotations and stock are "lower is better", so an increase is not good
  // news — the trend direction is inverted compared to the clients card.
  const awaitingApproval = metrics?.quotationsAwaitingApproval ?? 0;
  const outOfStock = metrics?.outOfStockProducts ?? 0;
  const lowStock = metrics?.lowStockProducts ?? 0;

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>{t('greetingOwner', { name: getUserFirstName(user) })}</h1>
          <p className={styles.subtitle}>{t('subtitleOwner')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" icon={<CalendarCheck size={18} />} onClick={() => navigate(`/${tenantSlug}/appointments`)}>
            {t('viewSchedule')}
          </Button>
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate(`/${tenantSlug}/appointments?plan=1`)}>
            {t('newAppointmentFull')}
          </Button>
        </div>
      </header>

      {/* KPI Bento Grid */}
      <motion.section
        className={styles.kpiGrid}
        variants={listContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div className={styles.kpiItem} variants={listItemVariants}>
          <KPICard
            title="Total clients"
            value={isLoadingMetrics ? '...' : (metrics?.totalClients || 0)}
            icon={<Users size={24} />}
            trendValue={isLoadingMetrics ? '...' : growthPct}
            trendLabel="vs last week"
            trendDirection={isGrowthUp ? 'up' : 'down'}
          />
        </motion.div>
        <motion.div className={styles.kpiItem} variants={listItemVariants}>
          <KPICard
            title="Appointments today"
            value={isLoadingMetrics ? '...' : (metrics?.appointmentsToday ?? 0)}
            icon={<CalendarCheck size={24} />}
            iconColor="var(--color-secondary)"
            iconBgColor="var(--color-secondary-container)"
            trendValue={isLoadingMetrics ? '...' : appointmentTrend}
            trendLabel="from yesterday"
            trendDirection={
              appointmentDelta > 0 ? 'up' : appointmentDelta < 0 ? 'down' : 'neutral'
            }
          />
        </motion.div>
        <motion.div className={`${styles.kpiItem} ${styles.mobileHidden}`} variants={listItemVariants}>
          <KPICard
            title="Open quotations"
            value={isLoadingMetrics ? '...' : (metrics?.openQuotations ?? 0)}
            icon={<Clock size={24} />}
            iconColor="var(--color-warning)"
            iconBgColor="var(--color-warning-container)"
            trendValue={
              isLoadingMetrics ? '...' : awaitingApproval > 0 ? `${awaitingApproval}` : 'None'
            }
            trendLabel="awaiting approval"
            /* Work piling up is not an improvement, so pending items read as
               a warning rather than as positive growth. */
            trendDirection={awaitingApproval > 0 ? 'down' : 'neutral'}
          />
        </motion.div>
        <motion.div className={`${styles.kpiItem} ${styles.mobileHidden}`} variants={listItemVariants}>
          <KPICard
            title="Inventory alerts"
            value={isLoadingMetrics ? '...' : lowStock}
            icon={<Package size={24} />}
            iconColor={lowStock > 0 ? 'var(--color-error)' : 'var(--color-success)'}
            iconBgColor={
              lowStock > 0 ? 'var(--color-error-container)' : 'var(--color-success-container)'
            }
            trendValue={
              isLoadingMetrics ? '...' : outOfStock > 0 ? `${outOfStock}` : 'All stocked'
            }
            trendLabel={outOfStock > 0 ? 'out of stock' : ''}
            trendDirection={outOfStock > 0 ? 'down' : 'neutral'}
          />
        </motion.div>
      </motion.section>

      {/* Main Grid Layout */}
      <div className={styles.mainGrid}>
        
        {/* Left Column: Schedule & Future Widgets */}
        <div className={styles.leftColumn}>
          
          <UpcomingAppointmentsWidget />
          
          {/* Quick Actions / Future Placeholders */}
          <div className={styles.placeholdersGrid}>
             <div className={styles.dashedPlaceholder}>
                <Clock size={32} className={styles.placeholderIcon} />
                <h3>{t('futureQuotationInsights')}</h3>
                <p>{t('futureQuotationInsightsDesc')}</p>
             </div>
             <div className={styles.dashedPlaceholder}>
                <Package size={32} className={styles.placeholderIcon} />
                <h3>{t('inventoryForecasting')}</h3>
                <p>{t('inventoryForecastingDesc')}</p>
             </div>
          </div>
        </div>

        {/* Right Column: Activity Feed */}
        <div className={styles.rightColumn}>
          <div className={`${styles.feedCard} premium-card`}>
            <div className={styles.feedHeader}>
              <div className={styles.feedTitleGroup}>
                <History size={20} color="var(--color-on-surface-variant)" />
                <h2>{t('recentActivity')}</h2>
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
              <Button variant="ghost" fullWidth onClick={() => navigate(`/${tenantSlug}/clients`)}>{t('viewAllActivity')}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
