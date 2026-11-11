import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, startOfDay, addDays, differenceInCalendarDays, addMinutes } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getEventTone } from '../utils/eventColors';
import {
  getEventStart, getEventEnd, isAllDayRowEvent, overlapsRange, getTimedSegmentsForDay,
  layoutSegments, getEventTitle, formatShortTime, formatEventRange
} from '../utils/eventUtils';

const HOUR_HEIGHT = 56; // px per hour
const PX_PER_MIN = HOUR_HEIGHT / 60;
const MIN_EVENT_MIN = 22; // shortest drawn block, in minutes of height
const SNAP = 15;
const COLLAPSED_LANES = 2;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const tooltipFor = (event) => [getEventTitle(event), formatEventRange(event), event.location].filter(Boolean).join('\n');

/**
 * Time grid shared by Week (7 days) and Day (1 day) views.
 * - All-day row with multi-day bars spanning columns
 * - Overlapping timed events laid out side by side
 * - Click or drag on empty space to create
 * - Current-time line, auto-scroll to scrollTarget.minutes whenever scrollTarget.nonce changes
 */
const TimeGrid = ({ days, events, now, onEventClick, onCreateRange, onDayClick, scrollTarget, selectedEventId, busyIds }) => {
  const scrollerRef = useRef(null);
  const [drag, setDrag] = useState(null); // { dayIndex, anchor, current } in minutes
  const lastPointerType = useRef('mouse');
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const single = days.length === 1;
  const rangeStartMs = startOfDay(days[0]).getTime();
  const dayCount = days.length;

  // Scroll to the requested time on mount and whenever a new target arrives
  // (instant, like Google: smooth scrolling fights quick j/k presses)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !scrollTarget) return;
    el.scrollTop = Math.max(0, (scrollTarget.minutes - 60) * PX_PER_MIN);
  }, [scrollTarget]);

  // ---- All-day row: lanes of bars spanning day columns ----
  const allDay = useMemo(() => {
    const rangeStart = new Date(rangeStartMs);
    const rangeEnd = addDays(rangeStart, dayCount);
    const items = events
      .filter(e => isAllDayRowEvent(e) && overlapsRange(e, rangeStart, rangeEnd))
      .map(event => {
        const start = getEventStart(event);
        const end = getEventEnd(event);
        const first = Math.max(0, differenceInCalendarDays(start, rangeStart));
        const last = Math.min(dayCount - 1, differenceInCalendarDays(new Date(end.getTime() - 1), rangeStart));
        return { event, first, last, clippedLeft: start < rangeStart, clippedRight: end > rangeEnd };
      })
      .sort((a, b) => a.first - b.first || (b.last - b.first) - (a.last - a.first));
    const laneEnds = [];
    items.forEach(item => {
      let lane = laneEnds.findIndex(endCol => endCol < item.first);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(-1); }
      laneEnds[lane] = item.last;
      item.lane = lane;
    });
    return { items, lanes: laneEnds.length };
  }, [events, rangeStartMs, dayCount]);

  const collapsible = allDay.lanes > COLLAPSED_LANES + 1;
  const showLanes = collapsible && !allDayExpanded ? COLLAPSED_LANES : allDay.lanes;
  const hiddenPerDay = days.map((_, i) =>
    allDay.items.filter(it => it.lane >= showLanes && it.first <= i && it.last >= i).length
  );

  // ---- Timed events per day ----
  const columns = useMemo(
    () => days.map(day => layoutSegments(getTimedSegmentsForDay(events, day), MIN_EVENT_MIN)),
    [days, events]
  );

  // ---- Click / drag to create ----
  const minuteAt = (e, el) => {
    const rect = el.getBoundingClientRect();
    return Math.min(24 * 60, Math.max(0, (e.clientY - rect.top) / PX_PER_MIN));
  };

  const onPointerDown = (e, dayIndex) => {
    lastPointerType.current = e.pointerType;
    if (e.pointerType !== 'mouse' || e.button !== 0 || !onCreateRange) return;
    if (e.target.closest('[data-event]')) return;
    const minute = Math.floor(minuteAt(e, e.currentTarget) / SNAP) * SNAP;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ dayIndex, anchor: minute, current: minute, moved: false });
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const minute = Math.round(minuteAt(e, e.currentTarget) / SNAP) * SNAP;
    if (minute !== drag.current) setDrag(d => ({ ...d, current: minute, moved: d.moved || Math.abs(minute - d.anchor) >= SNAP }));
  };

  const finishDrag = (e) => {
    if (!drag) return;
    const day = startOfDay(days[drag.dayIndex]);
    let startMin;
    let endMin;
    if (!drag.moved) {
      startMin = Math.floor(drag.anchor / 30) * 30;
      endMin = startMin + 60;
    } else {
      startMin = Math.min(drag.anchor, drag.current);
      endMin = Math.max(drag.anchor + SNAP, drag.current);
      if (drag.current < drag.anchor) endMin = drag.anchor + SNAP;
    }
    setDrag(null);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onCreateRange(addMinutes(day, startMin), addMinutes(day, Math.min(endMin, 24 * 60)), false);
  };

  // Touch and pen: a tap creates a one-hour event (dragging would fight scrolling)
  const onColumnClick = (e, dayIndex) => {
    if (lastPointerType.current === 'mouse' || !onCreateRange) return;
    if (e.target.closest('[data-event]')) return;
    const minute = Math.floor(minuteAt(e, e.currentTarget) / 30) * 30;
    const day = startOfDay(days[dayIndex]);
    onCreateRange(addMinutes(day, minute), addMinutes(day, Math.min(minute + 60, 24 * 60)), false);
  };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gutter = 'w-12 sm:w-14 shrink-0';

  return (
    <div ref={scrollerRef} className="h-full overflow-y-auto overflow-x-hidden scroll-quiet [scrollbar-gutter:stable]">
      {/* Sticky header: day names + all-day row */}
      <div className="sticky top-0 z-30 bg-surface border-b border-line">
        <div className="flex">
          <div className={gutter} />
          {days.map((day, i) => {
            const today = isToday(day);
            const label = (
              <>
                <span className={`text-[10px] sm:text-[11px] uppercase tracking-[0.08em] ${today ? 'text-accent font-semibold' : 'text-muted'}`}>
                  {single ? format(day, 'EEEE') : <><span className="sm:hidden">{format(day, 'EEEEE')}</span><span className="hidden sm:inline">{format(day, 'EEE')}</span></>}
                </span>
                <span className={`font-serif leading-none ${single ? 'text-3xl' : 'text-xl sm:text-2xl'} ${today ? 'text-accent' : 'text-ink'}`}>
                  {format(day, 'd')}
                </span>
              </>
            );
            const cls = `w-full px-1 sm:px-2 pt-2.5 pb-2 flex flex-col sm:flex-row items-center ${single ? 'sm:items-baseline sm:justify-start sm:px-3' : 'sm:items-baseline sm:justify-center'} gap-0.5 sm:gap-1.5`;
            return (
              <div key={i} className="flex-1 min-w-0 border-l border-line">
                {onDayClick ? (
                  <button type="button" onClick={() => onDayClick(day)} className={`${cls} rounded-md hover:bg-paper transition-colors`} aria-label={`${format(day, 'EEEE, MMMM d')}${today ? ' (today)' : ''}. Open day view`}>
                    {label}
                  </button>
                ) : (
                  <div className={cls}>{label}</div>
                )}
              </div>
            );
          })}
        </div>

        {allDay.lanes > 0 && (
          <div className="flex border-t border-line/70">
            <div className={`${gutter} flex flex-col items-end justify-start pr-1.5 pt-1`}>
              {collapsible ? (
                <button
                  type="button"
                  onClick={() => setAllDayExpanded(v => !v)}
                  className="flex items-center gap-0.5 rounded px-1 text-[10px] text-muted hover:text-ink hover:bg-paper"
                  aria-expanded={allDayExpanded}
                  aria-label={allDayExpanded ? 'Collapse all-day events' : 'Show all all-day events'}
                >
                  {allDayExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              ) : (
                <span className="text-[10px] text-muted leading-5">all-day</span>
              )}
            </div>
            <div
              className="flex-1 min-w-0 grid gap-y-0.5 py-1"
              style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridAutoRows: '20px' }}
            >
              {allDay.items.filter(it => it.lane < showLanes).map(({ event, first, last, lane, clippedLeft, clippedRight }) => {
                const tone = getEventTone(event);
                return (
                  <button
                    type="button"
                    data-event
                    key={`${event.id}-${first}`}
                    onClick={() => onEventClick(event)}
                    title={tooltipFor(event)}
                    style={{ gridColumn: `${first + 1} / ${last + 2}`, gridRow: lane + 1 }}
                    className={`mx-0.5 min-w-0 text-left ${tone.block} border-l-2 text-[11px] font-medium px-1.5 rounded-[4px] truncate hover:brightness-[0.97] transition ${clippedLeft ? 'rounded-l-none border-l-0' : ''} ${clippedRight ? 'rounded-r-none' : ''} ${selectedEventId === event.id ? 'ring-2 ring-ink/30' : ''} ${busyIds?.has(event.id) ? 'opacity-40 pointer-events-none' : ''}`}
                  >
                    {clippedLeft && <span aria-hidden="true">‹ </span>}{getEventTitle(event)}
                  </button>
                );
              })}
              {collapsible && !allDayExpanded && hiddenPerDay.map((count, i) => count > 0 && (
                <button
                  type="button"
                  key={`more-${i}`}
                  onClick={() => setAllDayExpanded(true)}
                  style={{ gridColumn: `${i + 1} / ${i + 2}`, gridRow: COLLAPSED_LANES + 1 }}
                  className="mx-0.5 text-left text-[11px] text-muted hover:text-ink px-1.5 rounded hover:bg-paper truncate"
                >
                  +{count} more
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Time grid */}
      <div className="flex relative" style={{ height: 24 * HOUR_HEIGHT }}>
        <div className={`${gutter} relative`} aria-hidden="true">
          {HOURS.slice(1).map(h => (
            <div key={h} className="absolute right-2 text-[10.5px] text-muted -translate-y-1/2 whitespace-nowrap" style={{ top: h * HOUR_HEIGHT }}>
              {format(new Date(2000, 0, 1, h), 'h a')}
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => {
          const today = isToday(day);
          const ghost = drag?.dayIndex === dayIndex ? (() => {
            const startMin = drag.moved ? Math.min(drag.anchor, drag.current) : Math.floor(drag.anchor / 30) * 30;
            const endMin = drag.moved ? Math.max(drag.anchor + SNAP, drag.current) : startMin + 60;
            return { top: startMin * PX_PER_MIN, height: (endMin - startMin) * PX_PER_MIN, startMin, endMin };
          })() : null;

          return (
            <div
              key={dayIndex}
              className={`flex-1 min-w-0 border-l border-line relative select-none ${onCreateRange ? 'cursor-cell' : ''} ${today ? 'bg-accent-soft/20' : ''}`}
              onPointerDown={(e) => onPointerDown(e, dayIndex)}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={() => setDrag(null)}
              onClick={(e) => onColumnClick(e, dayIndex)}
              role="presentation"
            >
              {HOURS.map(h => (
                <div key={h} className="border-b border-line/60" style={{ height: HOUR_HEIGHT }} />
              ))}

              {/* Events layer leaves a gutter on the right so empty time stays clickable */}
              <div className="absolute inset-y-0 left-0 right-1.5 sm:right-2.5 pointer-events-none">
                {columns[dayIndex].map(({ event, start, end, col, cols, span, continuesBefore, continuesAfter }) => {
                  const tone = getEventTone(event);
                  const startMin = (start - startOfDay(day)) / 60000;
                  const durationMin = Math.max((end - start) / 60000, MIN_EVENT_MIN);
                  const height = durationMin * PX_PER_MIN - 2;
                  const compact = height < 36;
                  const past = getEventEnd(event) < now;
                  const realStart = getEventStart(event);
                  const realEnd = getEventEnd(event);
                  return (
                    <button
                      type="button"
                      data-event
                      key={event.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                      title={tooltipFor(event)}
                      aria-label={`${getEventTitle(event)}, ${formatEventRange(event)}`}
                      className={`pointer-events-auto absolute ${tone.block} border-l-2 text-left text-[11px] leading-tight px-1.5 ${compact ? 'py-0' : 'py-1'} rounded-[5px] overflow-hidden hover:brightness-[0.97] hover:z-20 focus-visible:z-20 transition shadow-[0_0_0_1px_rgba(255,255,255,0.9)] ${past ? 'opacity-70' : ''} ${selectedEventId === event.id ? 'ring-2 ring-ink/40 z-20' : 'z-10'} ${continuesBefore ? 'rounded-t-none' : ''} ${continuesAfter ? 'rounded-b-none' : ''} ${busyIds?.has(event.id) ? 'opacity-40 pointer-events-none' : ''}`}
                      style={{
                        top: startMin * PX_PER_MIN + 1,
                        height,
                        left: `${(col / cols) * 100}%`,
                        width: `calc(${(span / cols) * 100}% - ${col + span < cols ? 2 : 0}px)`
                      }}
                    >
                      {compact ? (
                        <div className="truncate" style={{ lineHeight: `${Math.max(height, 12)}px` }}>
                          <span className="font-semibold">{getEventTitle(event)}</span>
                          {!single && cols > 2 ? null : <span className="opacity-75">, {formatShortTime(realStart)}</span>}
                        </div>
                      ) : (
                        <>
                          <div className="font-semibold break-normal" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: Math.max(1, Math.floor((height - 18) / 13)), overflow: 'hidden' }}>
                            {getEventTitle(event)}
                          </div>
                          <div className="opacity-75 truncate">
                            {formatShortTime(realStart)} – {formatShortTime(realEnd)}
                            {single && event.location ? ` · ${event.location}` : ''}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}

                {ghost && (
                  <div
                    className="absolute left-0 right-0 rounded-[5px] bg-ink/85 text-paper text-[11px] px-1.5 py-1 z-30 shadow-lg"
                    style={{ top: ghost.top + 1, height: Math.max(ghost.height - 2, 14) }}
                  >
                    <div className="font-semibold">(No title)</div>
                    <div className="opacity-80">{formatShortTime(addMinutes(startOfDay(day), ghost.startMin))} – {formatShortTime(addMinutes(startOfDay(day), ghost.endMin))}</div>
                  </div>
                )}
              </div>

              {today && (
                <div className="absolute left-0 right-0 h-0.5 bg-accent z-20 pointer-events-none" style={{ top: nowMinutes * PX_PER_MIN - 1 }} aria-hidden="true">
                  <div className="absolute -left-[5px] -top-[4px] w-2.5 h-2.5 bg-accent rounded-full" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimeGrid;
