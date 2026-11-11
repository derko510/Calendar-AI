import { useEffect, useMemo, useRef, useState } from 'react';
import { format, addDays, isSameMonth, isToday, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay } from 'date-fns';
import { getEventTone } from '../utils/eventColors';
import { getEventsForDay, isAllDayRowEvent, getEventStart, getEventEnd, getEventTitle, formatEventRange } from '../utils/eventUtils';

const ROW_PX = 20; // height of one event line incl. gap
const HEADER_PX = 30; // day number

const MonthView = ({ currentDate, events, now, onDayClick, onEventClick, selectedEventId, busyIds }) => {
  const bodyRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  const monthMs = startOfMonth(currentDate).getTime();
  const weeks = useMemo(() => {
    const monthStart = new Date(monthMs);
    const first = startOfWeek(monthStart, { weekStartsOn: 0 });
    const last = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
    const rows = [];
    for (let day = first; day <= last; day = addDays(day, 7)) {
      rows.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
    }
    return rows;
  }, [monthMs]);

  // How many event lines fit in a cell depends on the space available
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setBodyHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cellHeight = bodyHeight ? bodyHeight / weeks.length : 110;
  const capacity = Math.max(1, Math.floor((cellHeight - HEADER_PX - 4) / ROW_PX));

  const monthStart = new Date(monthMs);

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-line" aria-hidden="true">
        {weeks[0].map(day => (
          <div key={day.getDay()} className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium uppercase tracking-[0.08em] text-muted border-r border-line last:border-r-0">
            <span className="sm:hidden">{format(day, 'EEEEE')}</span>
            <span className="hidden sm:inline">{format(day, 'EEE')}</span>
          </div>
        ))}
      </div>
      <div ref={bodyRef} className="flex-1 min-h-0 flex flex-col">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 flex-1 min-h-[72px]">
            {week.map(day => {
              const dayEvents = getEventsForDay(events, day);
              const inMonth = isSameMonth(day, monthStart);
              const today = isToday(day);
              const overflow = dayEvents.length > capacity;
              const visible = overflow ? dayEvents.slice(0, Math.max(0, capacity - 1)) : dayEvents;
              const hidden = dayEvents.length - visible.length;
              return (
                <div
                  key={day.toISOString()}
                  className={`relative min-w-0 min-h-0 px-0.5 sm:px-1 pb-1 border-r border-b border-line last:border-r-0 overflow-hidden cursor-pointer transition-colors hover:bg-paper/60 ${inMonth ? '' : 'bg-paper/40'}`}
                  onClick={() => onDayClick(day)}
                >
                  <div className="flex justify-center sm:justify-start pt-1 sm:pl-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
                      aria-label={`${format(day, 'EEEE, MMMM d')}${today ? ' (today)' : ''}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}. Open day view`}
                      className={`inline-flex items-center justify-center h-6 min-w-6 px-1 text-[12px] sm:text-[13px] rounded-full transition-colors ${
                        today ? 'bg-accent text-white font-semibold' : inMonth ? 'text-ink hover:bg-line/60' : 'text-muted/60 hover:bg-line/60'
                      }`}
                    >
                      {format(day, 'd')}
                    </button>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {visible.map(event => {
                      const tone = getEventTone(event);
                      const rowEvent = isAllDayRowEvent(event);
                      const start = getEventStart(event);
                      const continues = rowEvent && start < startOfDay(day);
                      const past = getEventEnd(event) < now;
                      return (
                        <button
                          type="button"
                          key={event.id}
                          onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                          title={[getEventTitle(event), formatEventRange(event), event.location].filter(Boolean).join('\n')}
                          className={`w-full h-[18px] flex items-center gap-1 rounded-[4px] px-1 sm:px-1.5 text-[10px] sm:text-[11.5px] leading-none text-left transition hover:brightness-[0.97] ${
                            rowEvent ? `${tone.block} border-l-2` : 'text-ink-soft hover:bg-line/50'
                          } ${past ? 'opacity-60' : ''} ${selectedEventId === event.id ? 'ring-2 ring-ink/30' : ''} ${busyIds?.has(event.id) ? 'opacity-40 pointer-events-none' : ''}`}
                        >
                          {!rowEvent && <span className={`hidden sm:block w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />}
                          {!rowEvent && <span className="hidden md:inline shrink-0 text-muted">{format(start, start.getMinutes() ? 'h:mma' : 'ha').toLowerCase()}</span>}
                          <span className="truncate font-medium">{continues ? '‹ ' : ''}{getEventTitle(event)}</span>
                        </button>
                      );
                    })}
                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
                        className="w-full h-[18px] px-1 sm:px-1.5 text-left whitespace-nowrap truncate text-[10px] sm:text-[11px] font-medium text-muted hover:text-ink rounded-[4px] hover:bg-line/50"
                        aria-label={`${hidden} more event${hidden === 1 ? '' : 's'} on ${format(day, 'MMMM d')}`}
                      >
                        <span className="sm:hidden">+{hidden}</span>
                        <span className="hidden sm:inline">+{hidden} more</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MonthView;
