import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { instantAtMinutes, minutesIntoDay, snapMinutes, SNAP_MINUTES } from '../../utils/calendarDays';
import { layoutDay } from '../../utils/calendarLayout';
import type { CalendarItem } from '../../types/calendar';
import { CalendarChip } from './CalendarChip';
import { dayAsDate, groupByDay, groupContractsByDay } from './calendarGrouping';
import { ContractDateChip } from './ContractDateChip';
import { isOpen } from './calendarStyle';
import type { CalendarViewProps } from './CalendarMonthView';
import styles from './Calendar.module.css';

/** Pixels per hour on the grid. */
const HOUR_PX = 48;
const MINUTE_PX = HOUR_PX / 60;
/** The grid opens scrolled to this hour, or to the first item if it is earlier. */
const OPENS_AT_HOUR = 7;

export interface CalendarTimeGridProps extends Pick<CalendarViewProps, 'days' | 'items' | 'today' | 'onOpen' | 'personColour' | 'onPickDay' | 'contractItems' | 'onOpenContract'> {
  /** FR-CAL-07: drops an item on a new slot. Absent where the viewer cannot change items. */
  onMove?: (item: CalendarItem, day: string, minutes: number) => void;
  /** Which items the viewer may move: a follow-up and a planned item are changed under different permissions. */
  canMove?: (item: CalendarItem) => boolean;
}

interface DragState {
  item: CalendarItem;
  /** Where inside the item the pointer grabbed it, in minutes from its top. */
  grabMinutes: number;
}

/**
 * The day and week views: a column per day on a 24-hour grid, items placed at
 * their time and as long as they last, overlapping ones side by side. On
 * desktop an open item can be dragged to another slot, snapping to 15
 * minutes (FR-CAL-07); there is no drag on touch, where Reschedule in the
 * item panel does the same.
 */
export const CalendarTimeGrid: React.FC<CalendarTimeGridProps> = ({ days, items, today, onOpen, onPickDay, personColour, onMove, canMove, contractItems = [], onOpenContract }) => {
  const { t } = useTranslation('appointments');
  const dates = useDateFormat();
  const finePointer = useMediaQuery('(pointer: fine)', true);
  const byDay = useMemo(() => groupByDay(items, dates.dayKey), [items, dates.dayKey]);
  const contractsByDay = useMemo(() => groupContractsByDay(contractItems), [contractItems]);
  const scroller = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<{ day: string; minutes: number } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const canDrag = !!onMove && finePointer;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Open on the working day, or on the earliest item when it is before it.
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const earliest = items.reduce((min, item) => Math.min(min, minutesIntoDay(item.scheduledAt, dates.timeZone)), OPENS_AT_HOUR * 60);
    node.scrollTop = Math.max(0, earliest * MINUTE_PX - 8);
    // Once per set of days, not on every refetch: the user may have scrolled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join(',')]);

  /** The slot under the pointer, or null when the event carries no position. */
  const slotAt = (event: React.DragEvent<HTMLDivElement>): number | null => {
    const top = event.currentTarget.getBoundingClientRect().top;
    const grab = drag.current?.grabMinutes ?? 0;
    const minutes = (event.clientY - top) / MINUTE_PX - grab;
    return Number.isFinite(minutes) ? snapMinutes(minutes, SNAP_MINUTES) : null;
  };

  const label = (key: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(dates.locale, { ...options, timeZone: 'UTC' }).format(dayAsDate(key));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const nowMinutes = minutesIntoDay(now, dates.timeZone);
  const hourLabel = (hour: number) => dates.time(instantAtMinutes(today, hour * 60, dates.timeZone));

  return (
    <div className={styles.timeGridScroll} ref={scroller} data-testid="calendar-time-grid">
      <div className={styles.timeGrid} style={{ '--day-count': days.length, '--hour-height': `${HOUR_PX}px` } as React.CSSProperties}>
        <div className={styles.gridCorner} aria-hidden="true" />
        {days.map((key) => (
          <div key={key} className={`${styles.dayHead} ${key === today ? styles.dayHeadToday : ''}`}>
            <button type="button" className={styles.dayHeadButton} onClick={() => onPickDay(key)} aria-current={key === today ? 'date' : undefined}>
              {label(key, { weekday: 'short', day: 'numeric', month: 'short' })}
            </button>
            {/* Contract end and renewal dates have no time: they sit with the day's heading (FR-REN-11). */}
            {(contractsByDay.get(key) ?? []).length > 0 && (
              <div className={styles.dayHeadContracts}>
                {(contractsByDay.get(key) ?? []).map((item) => (
                  <ContractDateChip key={item.id} item={item} onOpen={(id) => onOpenContract?.(id)} personColour={item.assignedUserId ? personColour?.(item.assignedUserId) : undefined} />
                ))}
              </div>
            )}
          </div>
        ))}

        <div className={styles.hourGutter} aria-hidden="true">
          {hours.slice(1).map((hour) => (
            <span key={hour} className={styles.hourLabel} style={{ top: hour * HOUR_PX }}>
              {hourLabel(hour)}
            </span>
          ))}
        </div>

        {days.map((key) => {
          const placed = layoutDay(byDay.get(key) ?? [], dates.timeZone);
          const isDropTarget = hint?.day === key;
          return (
            <div
              key={key}
              className={`${styles.dayColumn} ${isDropTarget ? styles.dayColumnDropTarget : ''}`}
              data-day={key}
              role="group"
              aria-label={label(key, { weekday: 'long', day: 'numeric', month: 'long' })}
              onDragOver={
                canDrag
                  ? (event) => {
                      if (!drag.current) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      const minutes = slotAt(event);
                      if (minutes === null) return;
                      setHint((current) => (current?.day === key && current.minutes === minutes ? current : { day: key, minutes }));
                    }
                  : undefined
              }
              onDragLeave={canDrag ? (event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setHint(null) : undefined}
              onDrop={
                canDrag
                  ? (event) => {
                      const dragged = drag.current;
                      if (!dragged) return;
                      event.preventDefault();
                      const minutes = slotAt(event);
                      drag.current = null;
                      setDragId(null);
                      setHint(null);
                      if (minutes !== null) onMove?.(dragged.item, key, minutes);
                    }
                  : undefined
              }
            >
              {key === today && <div className={styles.nowLine} style={{ top: nowMinutes * MINUTE_PX }} aria-hidden="true" />}
              {placed.map(({ item, top, height, lane, lanes }) => (
                <div
                  key={item.id}
                  className={styles.placed}
                  style={{ top: top * MINUTE_PX, height: height * MINUTE_PX, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}
                  draggable={canDrag && isOpen(item) && (canMove?.(item) ?? true)}
                  onDragStart={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    drag.current = { item, grabMinutes: Math.max(0, (event.clientY - rect.top) / MINUTE_PX) };
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.id);
                    setDragId(item.id);
                  }}
                  onDragEnd={() => {
                    drag.current = null;
                    setDragId(null);
                    setHint(null);
                  }}
                >
                  <CalendarChip item={item} onOpen={onOpen} personColour={personColour?.(item.assignedUserId)} isDragging={dragId === item.id} />
                </div>
              ))}
              {isDropTarget && hint && (
                <div className={styles.dropHint} style={{ top: hint.minutes * MINUTE_PX }}>
                  {dates.time(instantAtMinutes(key, hint.minutes, dates.timeZone))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {days.every((key) => !byDay.has(key) && !contractsByDay.has(key)) && <p className={styles.empty}>{days.length === 1 ? t('calendar.emptyDay') : t('calendar.emptyWeek')}</p>}
    </div>
  );
};
