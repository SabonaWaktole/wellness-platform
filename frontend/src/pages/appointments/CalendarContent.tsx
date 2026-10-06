import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppointmentDetailPanel } from '../../components/panels/AppointmentDetailPanel/AppointmentDetailPanel';
import { CalendarAgenda } from '../../components/calendar/CalendarAgenda';
import { CalendarMonthView } from '../../components/calendar/CalendarMonthView';
import { CalendarTimeGrid } from '../../components/calendar/CalendarTimeGrid';
import { CalendarToolbar } from '../../components/calendar/CalendarToolbar';
import { OverdueSection } from '../../components/calendar/OverdueSection';
import { PlanActivityDialog } from '../../components/calendar/PlanActivityDialog';
import { TeamFilter } from '../../components/calendar/TeamFilter';
import { personColours, typeIcon } from '../../components/calendar/calendarStyle';
import { useToast } from '../../components/ui/Toast/toastContext';
import { useCalendarFeed } from '../../hooks/useCalendarFeed';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useRangeTitle } from '../../hooks/useRangeTitle';
import { usePermission, usePermissionScope } from '../../hooks/usePermission';
import { followUpsChanged } from '../../hooks/useOverdueFollowUpCount';
import { useTeam } from '../../hooks/useTeam';
import { appointmentService } from '../../services/appointmentService';
import { followUpService } from '../../services/followUpService';
import {
  CALENDAR_VIEWS,
  instantAtMinutes,
  isDayKey,
  showsToday,
  step,
  todayKey,
  visibleRange,
  type CalendarView,
} from '../../utils/calendarDays';
import { CALENDAR_TYPES, type CalendarItem } from '../../types/calendar';
import styles from '../../components/calendar/Calendar.module.css';

const clock = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The sales calendar (M2 Slice 12, FR-CAL-01..08): the salesperson's follow-ups,
 * planned calls, meetings, visits and online meetings in day, week, month and
 * agenda views, with the overdue ones listed on today's date. With
 * `calendar.view` at Team or All a filter picks whose items to show, each
 * salesperson in their own colour; the CEO sees everything and can change
 * nothing. The range asked of the server follows the visible view, and the
 * view, day and filter live in the address, so a link or a reload lands on
 * the same screen.
 */
export const CalendarContent: React.FC = () => {
  const { t } = useTranslation('appointments');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const dates = useDateFormat();
  const rangeTitle = useRangeTitle();
  const [params, setParams] = useSearchParams();
  const calendarScope = usePermissionScope('calendar.view');
  const canPlan = usePermission('activities.add');
  const canManageFollowUps = usePermission('followups.manage');
  const seesTeam = calendarScope === 'TEAM' || calendarScope === 'ALL';
  // The CEO's calendar: everything visible, nothing to create or change (FR-CAL-06).
  const readOnly = !canPlan && !canManageFollowUps;
  const defaultView: CalendarView = useMediaQuery('(max-width: 640px)') ? 'agenda' : 'month';
  const { staff, fetchStaff } = useTeam();

  const today = todayKey(dates.timeZone);
  const requestedView = params.get('view') as CalendarView | null;
  const view: CalendarView = requestedView && CALENDAR_VIEWS.includes(requestedView) ? requestedView : defaultView;
  const requestedDate = params.get('date');
  const anchor = isDayKey(requestedDate) ? requestedDate : today;
  const userIds = useMemo(() => (seesTeam ? (params.get('users') ?? '').split(',').filter(Boolean) : []), [seesTeam, params]);

  const range = useMemo(() => visibleRange(view, anchor, dates.timeZone), [view, anchor, dates.timeZone]);
  const feedParams = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString(), userIds }),
    [range.from, range.to, userIds]
  );
  const { feed, isLoading, error, reload } = useCalendarFeed(feedParams);

  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [planning, setPlanning] = useState<{ day: string } | null>(null);
  const [editing, setEditing] = useState<CalendarItem | null>(null);

  // After a reload the open item shows what the server now has (a status change keeps the panel open).
  useEffect(() => {
    if (!feed) return;
    setSelected((current) => (current ? [...feed.items, ...feed.overdue].find((entry) => entry.id === current.id) ?? current : current));
  }, [feed]);

  useEffect(() => {
    if (seesTeam) fetchStaff();
  }, [seesTeam, fetchStaff]);

  // `?plan=1` opens the planning dialog on arrival: the dashboard's "new appointment" buttons.
  const planOnArrival = params.get('plan');
  useEffect(() => {
    if (!planOnArrival) return;
    if (canPlan) setPlanning({ day: today });
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('plan');
        return next;
      },
      { replace: true }
    );
    // Once per arrival: `today` is only the day it opens on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planOnArrival, canPlan]);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const colourOf = useMemo(() => personColours(staff.map((member) => member.id)), [staff]);
  const personColour = seesTeam ? colourOf : undefined;
  const items = feed?.items ?? [];
  // Contract end and renewal dates: read-only, and they open the contract (FR-REN-11).
  const contractItems = feed?.contractItems ?? [];
  const openContract = (contractId: string) => navigate(`/${tenantSlug}/contracts/${contractId}`);
  const showOverdue = !!feed && showsToday(range.days, today) && (view === 'day' || view === 'agenda');

  const pickDay = (day: string) => update({ view: 'day', date: day });
  const goTo = (next: string) => update({ date: next === today ? null : next });

  /** FR-CAL-07: a follow-up keeps its own rules (due notice, history); a planned item reschedules as an item. */
  const move = async (item: CalendarItem, day: string, minutes: number) => {
    if (!tenantSlug) return;
    try {
      if (item.kind === 'FOLLOW_UP') {
        await followUpService.reschedule(tenantSlug, item.id, { dueDate: day, time: clock(minutes), reason: null });
        followUpsChanged();
      } else {
        await appointmentService.rescheduleAppointment(tenantSlug, item.id, { newDate: instantAtMinutes(day, minutes, dates.timeZone).toISOString() });
      }
      toast.success(t('reschedule.done'));
    } catch (failure: any) {
      toast.error(failure?.response?.data?.error ?? t('plan.errors.failed'));
    }
    reload();
  };

  const canMove = (item: CalendarItem) => (item.kind === 'FOLLOW_UP' ? canManageFollowUps : canPlan);
  const grid = view === 'day' || view === 'week';

  return (
    <div className={styles.page} aria-busy={isLoading}>
      <CalendarToolbar
        view={view}
        title={rangeTitle(view, anchor, range.days)}
        onView={(next) => update({ view: next === defaultView ? null : next })}
        onPrevious={() => goTo(step(view, anchor, -1))}
        onNext={() => goTo(step(view, anchor, 1))}
        onToday={() => goTo(today)}
        onPlan={canPlan ? () => setPlanning({ day: anchor }) : undefined}
      />

      {seesTeam && <TeamFilter staff={staff} selected={userIds} onChange={(ids) => update({ users: ids.length ? ids.join(',') : null })} colourOf={colourOf} />}

      <ul className={styles.legend} aria-label={t('calendar.legend')}>
        {CALENDAR_TYPES.map((type) => {
          const Icon = typeIcon(type);
          return (
            <li key={type} className={`${styles.legendItem} ${styles[`type-${type}`]}`}>
              <Icon size={13} aria-hidden="true" />
              <span>{t(`calendar.type.${type}`)}</span>
            </li>
          );
        })}
      </ul>

      {readOnly && <p className={styles.notice}>{t('calendar.readOnly')}</p>}
      {error && (
        <p className={styles.notice} role="alert">
          {t('calendar.error', { message: error })}
        </p>
      )}
      {isLoading && (
        <p className={styles.empty} role="status">
          {t('calendar.loading')}
        </p>
      )}
      {(feed?.itemsTruncated || feed?.contractItemsTruncated) && <p className={styles.notice}>{t('calendar.truncated')}</p>}

      {feed && showOverdue && <OverdueSection items={feed.overdue} truncated={feed.overdueTruncated} onOpen={setSelected} personColour={personColour} />}

      {feed && grid && (
        <CalendarTimeGrid days={range.days} items={items} today={today} onOpen={setSelected} onPickDay={pickDay} personColour={personColour} onMove={move} canMove={canMove} contractItems={contractItems} onOpenContract={openContract} />
      )}
      {feed && view === 'month' && (
        <CalendarMonthView days={range.days} items={items} today={today} anchor={anchor} onOpen={setSelected} onPickDay={pickDay} personColour={personColour} contractItems={contractItems} onOpenContract={openContract} />
      )}
      {feed && view === 'agenda' && <CalendarAgenda days={range.days} items={items} today={today} onOpen={setSelected} personColour={personColour} contractItems={contractItems} onOpenContract={openContract} />}

      <AppointmentDetailPanel
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        item={selected}
        readOnly={readOnly}
        onChanged={reload}
        onEdit={(item) => {
          setSelected(null);
          setEditing(item);
        }}
      />

      <PlanActivityDialog
        isOpen={!!planning || !!editing}
        onClose={() => {
          setPlanning(null);
          setEditing(null);
        }}
        day={planning?.day}
        item={editing}
        onSaved={() => {
          setPlanning(null);
          setEditing(null);
          reload();
        }}
      />
    </div>
  );
};
