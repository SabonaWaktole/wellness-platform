import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  Briefcase,
  Calendar,
  CalendarCheck,
  CalendarX,
  FileSignature,
  FileText,
  History,
  Mail,
  PhoneCall,
  ScrollText,
  UserMinus,
  UserPlus,
  Video,
} from 'lucide-react';
import { Button } from '../ui/Button/Button';
import { TimelineItem } from '../ui/TimelineItem/TimelineItem';
import { useAuthStore } from '../../store/useAuthStore';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { TIMELINE_CATEGORIES } from '../../types/client';
import type { ClientHistory, TimelineCategory, TimelineEntry } from '../../types/client';
import styles from './CompanyTimeline.module.css';

/** The permission each category's entries need — the chip is hidden without it. */
const CATEGORY_PERMISSION: Record<TimelineCategory, string> = {
  CONTACT: 'companies.view',
  NOTE: 'notes.view',
  ACTIVITY: 'activities.view',
  QUOTATION: 'quotations.manage',
  CONTRACT: 'contracts.validity.view',
  PAYMENT: 'payments.view',
  DEAL: 'deals.view',
};

const NEUTRAL = { color: 'var(--color-on-surface-variant)', bg: 'var(--color-surface-container-high)' };
const POSITIVE = { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
const NEGATIVE = { color: 'var(--color-error)', bg: 'rgba(255, 180, 171, 0.15)' };
const PRIMARY = { color: 'var(--color-on-primary-container)', bg: 'var(--color-primary-container)' };

interface EntryView {
  title: string;
  content?: string;
  status?: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}

interface CompanyTimelineProps {
  history: ClientHistory | null;
  types: TimelineCategory[];
  onTypesChange: (types: TimelineCategory[]) => void;
  isLoading: boolean;
  isLoadingMore: boolean;
  error?: string | null;
  onLoadMore: () => void;
}

/**
 * The company's unified history (FR-CMP-05): contacts, notes, activities,
 * offers, contracts, payments and deals in one list, newest first, filterable by
 * type. The server has already left out what the viewer may not see and
 * removed money fields they may not read, so an amount is shown only when
 * present.
 */
export const CompanyTimeline: React.FC<CompanyTimelineProps> = ({
  history,
  types,
  onTypesChange,
  isLoading,
  isLoadingMore,
  error,
  onLoadMore,
}) => {
  const { t } = useTranslation('clients');
  const statusLabel = useStatusLabel();
  const dates = useDateFormat();
  const money = useMoneyFormat();
  const permissions = useAuthStore((state) => state.user?.permissions);

  const visibleCategories = TIMELINE_CATEGORIES.filter(
    (category) => permissions?.[CATEGORY_PERMISSION[category]] !== undefined
  );

  const toggle = (category: TimelineCategory) =>
    onTypesChange(types.includes(category) ? types.filter((c) => c !== category) : [...types, category]);

  const describe = (entry: TimelineEntry): EntryView => {
    const d = entry.details ?? {};
    const change = (label: (status: string) => string) => ({ from: label(d.fromStatus), to: label(d.toStatus) });

    switch (entry.type) {
      case 'CONTACT_ADDED':
        return { title: t('detail.timeline.events.CONTACT_ADDED', { name: d.name }), content: d.position, icon: <UserPlus size={16} />, ...PRIMARY };
      case 'CONTACT_REMOVED':
        return { title: t('detail.timeline.events.CONTACT_REMOVED', { name: d.name }), content: d.position, icon: <UserMinus size={16} />, ...NEUTRAL };
      case 'INTERACTION_ADDED': {
        const icon =
          d.channel === 'CALL' ? <PhoneCall size={16} /> :
          d.channel === 'EMAIL' ? <Mail size={16} /> :
          d.channel === 'MEETING' ? <Video size={16} /> : <FileText size={16} />;
        return {
          title: t('detail.timeline.events.INTERACTION_ADDED', { channel: t(`detail.channels.${d.channel}`, { defaultValue: d.channel }) }),
          content: d.content,
          icon,
          ...NEUTRAL,
        };
      }
      case 'QUOTATION_CREATED':
        return {
          title: t('detail.timeline.events.QUOTATION_CREATED', { reference: d.reference }),
          content: d.total !== undefined ? t('detail.timeline.offerTotal', { amount: money.format(d.total) }) : undefined,
          status: statusLabel.quotation(d.status),
          icon: <ScrollText size={16} />,
          ...NEUTRAL,
        };
      case 'QUOTATION_STATUS_CHANGED':
        return {
          title: t('detail.timeline.events.QUOTATION_STATUS_CHANGED', { reference: d.reference, ...change(statusLabel.quotation) }),
          content: d.note,
          icon: <ScrollText size={16} />,
          ...NEUTRAL,
        };
      case 'CONTRACT_CREATED': {
        const validity = t('detail.timeline.contractValidity', { from: dates.date(d.startsAt), to: dates.date(d.endsAt) });
        const price =
          d.amount !== undefined
            ? t('detail.timeline.contractPrice', { amount: money.format(d.amount), period: statusLabel.billingPeriod(d.billingPeriod) })
            : null;
        return {
          title: t('detail.timeline.events.CONTRACT_CREATED', { reference: d.reference, plan: d.planName }),
          content: price ? `${validity} · ${price}` : validity,
          icon: <FileSignature size={16} />,
          ...PRIMARY,
        };
      }
      case 'CONTRACT_STATUS_CHANGED':
        return {
          title: t('detail.timeline.events.CONTRACT_STATUS_CHANGED', { reference: d.reference, ...change(statusLabel.contract) }),
          content: d.planName,
          icon: <FileSignature size={16} />,
          ...NEUTRAL,
        };
      case 'DEAL_CREATED':
        return {
          title: t('detail.timeline.events.DEAL_CREATED', { deal: d.title ?? statusLabel.dealType(d.type) }),
          status: statusLabel.deal('NEW_LEAD'),
          icon: <Briefcase size={16} />,
          ...PRIMARY,
        };
      case 'DEAL_STAGE_CHANGED':
        return {
          title: t('detail.timeline.events.DEAL_STAGE_CHANGED', {
            deal: d.title ?? statusLabel.dealType(d.type),
            from: statusLabel.deal(d.fromStage),
            to: statusLabel.deal(d.toStage),
          }),
          icon: <Briefcase size={16} />,
          ...NEUTRAL,
        };
      case 'PAYMENT_RECEIVED': {
        const parts = [
          d.paidAmount !== undefined && d.amount !== undefined
            ? t('detail.timeline.paymentPaid', { paid: money.format(d.paidAmount), amount: money.format(d.amount) })
            : null,
          d.method ? t('detail.timeline.paymentMethod', { method: d.method }) : null,
        ].filter(Boolean);
        return {
          title: t('detail.timeline.events.PAYMENT_RECEIVED', { reference: d.reference }),
          content: parts.join(' · ') || undefined,
          status: statusLabel.contractPayment(d.status),
          icon: <Banknote size={16} />,
          ...POSITIVE,
        };
      }
      default:
        if (entry.type.startsWith('APPOINTMENT_')) {
          const tone = d.status === 'CANCELLED' ? NEGATIVE : d.status === 'COMPLETED' || d.status === 'CONFIRMED' ? POSITIVE : PRIMARY;
          const icon = d.status === 'CANCELLED' ? <CalendarX size={16} /> : d.status === 'SCHEDULED' ? <Calendar size={16} /> : <CalendarCheck size={16} />;
          const scheduled = d.scheduledAt ? t('detail.timeline.appointmentScheduledFor', { date: dates.dateTime(d.scheduledAt) }) : '';
          return {
            title: t('detail.timeline.events.APPOINTMENT'),
            content: [scheduled, d.notes].filter(Boolean).join(' · ') || undefined,
            status: statusLabel.appointment(d.status),
            icon,
            ...tone,
          };
        }
        return { title: entry.type, icon: <History size={16} />, ...NEUTRAL };
    }
  };

  const subtitle = (entry: TimelineEntry) => {
    const timestamp = dates.dateTime(entry.timestamp);
    if (entry.actor) return t('detail.timeline.byActor', { timestamp, actor: entry.actor.name });
    // A status change with no person behind it was made by the scheduler, and
    // a deal stage change by the platform's automatic moves (FR-DEAL-08).
    if (entry.type.endsWith('_STATUS_CHANGED') || entry.type === 'DEAL_STAGE_CHANGED') return t('detail.timeline.byActor', { timestamp, actor: t('detail.timeline.system') });
    return timestamp;
  };

  const entries = history?.timeline ?? [];

  return (
    <div className={styles.timeline}>
      <div className={styles.filters} role="group" aria-label={t('detail.timeline.filtersLabel')}>
        <button
          type="button"
          className={styles.chip}
          aria-pressed={types.length === 0}
          onClick={() => onTypesChange([])}
        >
          {t('detail.timeline.all')}
        </button>
        {visibleCategories.map((category) => (
          <button
            key={category}
            type="button"
            className={styles.chip}
            aria-pressed={types.includes(category)}
            onClick={() => toggle(category)}
          >
            {t(`detail.timeline.categories.${category}`)}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {isLoading && <div className={styles.message}>{t('detail.loadingHistory')}</div>}
        {!isLoading && error && <div className={styles.message} role="alert">{t('detail.timeline.loadError')}</div>}
        {!isLoading && !error && entries.length === 0 && (
          <div className={styles.message}>
            {types.length > 0 ? t('detail.timeline.emptyFiltered') : t('detail.timeline.empty')}
          </div>
        )}
        {!isLoading &&
          entries.map((entry, index) => {
            const view = describe(entry);
            return (
              <TimelineItem
                key={entry.id}
                title={view.title}
                subtitle={subtitle(entry)}
                content={view.content}
                icon={view.icon}
                iconBgColor={view.bg}
                iconTextColor={view.color}
                statusLabel={view.status}
                statusColor={view.color}
                statusBgColor={view.bg}
                isLast={index === entries.length - 1 && !history?.nextCursor}
              />
            );
          })}
      </div>

      {!isLoading && history?.nextCursor && (
        <div className={styles.loadMore}>
          <Button variant="outline" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? t('detail.timeline.loadingMore') : t('detail.timeline.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
};
