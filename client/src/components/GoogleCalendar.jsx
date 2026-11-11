import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { ChevronLeft, ChevronRight, LogOut, Plus, RefreshCw, Keyboard, Loader2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addMonths, addWeeks, isSameMonth, isSameDay, isWithinInterval, startOfDay } from 'date-fns';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import Dialog from './Dialog';
import EventDetails from './EventDetails';
import EventForm from './EventForm';
import CalendarList from './CalendarList';
import { getEventStart, isAllDayRowEvent } from '../utils/eventUtils';
import { formValuesFromRange, buildEventPayload, defaultNewRange } from '../utils/eventForm';

const VIEWS = ['month', 'week', 'day'];
const VIEW_KEY = 'calendar.view';

const initialView = () => {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (VIEWS.includes(saved)) return saved;
  } catch { /* storage blocked */ }
  return typeof window !== 'undefined' && window.innerWidth < 640 ? 'day' : 'week';
};

const isTypingTarget = (el) =>
  !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

const SHORTCUTS = [
  ['t', 'Go to today'],
  ['j  or  →', 'Next period'],
  ['k  or  ←', 'Previous period'],
  ['m / w / d', 'Month, week, day view'],
  ['n  or  c', 'New event'],
  ['e', 'Edit the open event'],
  ['/', 'Ask the assistant'],
  ['r', 'Refresh'],
  ['Esc', 'Close dialog'],
  ['?', 'Show shortcuts']
];

const scrollMinutesFor = (date, now) => {
  const day = startOfDay(date);
  return isSameDay(day, now) ? now.getHours() * 60 + now.getMinutes() : 8 * 60;
};

// The days a view shows, as [start, end)
const visibleRangeFor = (view, date) => {
  if (view === 'month') {
    const start = startOfWeek(startOfMonth(date));
    return { start, end: addDays(startOfDay(endOfWeek(endOfMonth(date))), 1) };
  }
  if (view === 'week') {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 7) };
  }
  const start = startOfDay(date);
  return { start, end: addDays(start, 1) };
};

/**
 * Calendar pane: header + Month/Week/Day views + event details / create dialogs + keyboard shortcuts.
 * Data changes go through onCreate(payload) / onUpdate(event, changes, options) / onDelete(event, options), all async.
 * onVisibleRangeChange({ start, end }) reports the days on screen so the parent can load them.
 */
const GoogleCalendar = ({
  events = [], now = new Date(), demo = false, onSignOut, onCreate, onUpdate, onDelete, onRespond, notify,
  focusRequest, onFocusChat, onRefresh, refreshing = false, lastUpdated,
  calendars = [], visibleCalendars, onToggleCalendar, onVisibleRangeChange, rangeLoading = false
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setViewState] = useState(initialView);
  const [selectedId, setSelectedId] = useState(null);
  const [createDraft, setCreateDraft] = useState(null); // form initial values
  const [showHelp, setShowHelp] = useState(false);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [scrollTarget, setScrollTarget] = useState(() => ({ minutes: scrollMinutesFor(new Date(), new Date()), nonce: 0 }));
  const detailsHeadingId = useId();
  const createHeadingId = useId();
  const helpHeadingId = useId();

  const selectedEvent = selectedId ? events.find(e => e.id === selectedId) : null;

  const setView = useCallback((v) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  }, []);

  const scrollTo = useCallback((minutes) => setScrollTarget(t => ({ minutes, nonce: t.nonce + 1 })), []);

  // Tell the parent which days are on screen, so it can fetch them if they're outside the loaded window
  const visible = visibleRangeFor(view, currentDate);
  const visibleKey = `${visible.start.getTime()}-${visible.end.getTime()}`;
  useEffect(() => {
    onVisibleRangeChange?.(visibleRangeFor(view, currentDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the visible days change
  }, [visibleKey, onVisibleRangeChange]);

  // The selected event vanished (deleted elsewhere, or a refresh dropped it)
  useEffect(() => {
    if (selectedId && !selectedEvent) setSelectedId(null);
  }, [selectedId, selectedEvent]);

  // Jump to an event requested from the chat panel and open it
  useEffect(() => {
    if (!focusRequest) return;
    const event = events.find(e => e.id === focusRequest.id);
    if (!event) return;
    const start = getEventStart(event);
    const targetKey = view === 'week' ? format(startOfWeek(start), 'yyyy-MM-dd') : format(start, 'yyyy-MM-dd');
    if (view !== 'month' && targetKey !== rangeKey) skipAutoScroll.current = true;
    setCurrentDate(start);
    if (!isAllDayRowEvent(event)) scrollTo(start.getHours() * 60 + start.getMinutes());
    setSelectedId(event.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to a new request, not to event list refreshes
  }, [focusRequest?.nonce]);

  const step = useCallback((dir) => {
    setCurrentDate(d => (view === 'month' ? addMonths(d, dir) : view === 'week' ? addWeeks(d, dir) : addDays(d, dir)));
  }, [view]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    scrollTo(scrollMinutesFor(today, today));
  }, [scrollTo]);

  const openDay = useCallback((day) => {
    setCurrentDate(day);
    setView('day');
    scrollTo(scrollMinutesFor(day, new Date()));
  }, [scrollTo, setView]);

  const selectEvent = useCallback((event) => setSelectedId(event.id), []);

  const openCreate = useCallback((start, end, allDay = false) => {
    setSelectedId(null);
    setCreateDraft(formValuesFromRange(start, end, allDay));
  }, []);

  const openNewForCurrent = useCallback(() => {
    // Today if it's in view, otherwise the first day being looked at
    const today = new Date();
    let day = currentDate;
    if (view === 'week') {
      const ws = startOfWeek(currentDate);
      day = isWithinInterval(today, { start: ws, end: endOfWeek(currentDate) }) ? today : ws;
    } else if (view === 'month') {
      day = isSameMonth(today, currentDate) ? today : currentDate;
    }
    const { start, end } = defaultNewRange(day);
    openCreate(start, end);
  }, [currentDate, view, openCreate]);

  // ---- Keyboard shortcuts (Google Calendar style) ----
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[data-dialog-open]')) return; // dialogs handle their own keys (Esc, Tab, e)
      const key = e.key;
      const actions = {
        t: goToToday,
        j: () => step(1),
        ArrowRight: () => step(1),
        k: () => step(-1),
        ArrowLeft: () => step(-1),
        m: () => setView('month'),
        w: () => setView('week'),
        d: () => setView('day'),
        n: openNewForCurrent,
        c: openNewForCurrent,
        '/': () => onFocusChat?.(),
        r: () => onRefresh?.(),
        '?': () => setShowHelp(true)
      };
      const action = Object.hasOwn(actions, key) ? actions[key] : null;
      if (!action) return;
      e.preventDefault();
      action();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goToToday, step, setView, openNewForCurrent, onFocusChat, onRefresh]);

  // Changing view or period scrolls the time grid to "now" when today is visible,
  // otherwise to the first timed event in range (or 8 AM). A jump to a specific event wins.
  const skipAutoScroll = useRef(false);
  const rangeKey = view === 'week' ? format(startOfWeek(currentDate), 'yyyy-MM-dd') : format(currentDate, 'yyyy-MM-dd');
  useEffect(() => {
    if (view === 'month') return;
    if (skipAutoScroll.current) { skipAutoScroll.current = false; return; }
    const today = new Date();
    const first = view === 'week' ? startOfWeek(currentDate) : startOfDay(currentDate);
    const last = addDays(first, view === 'week' ? 7 : 1);
    if (today >= first && today < last) { scrollTo(today.getHours() * 60 + today.getMinutes()); return; }
    const starts = events
      .filter(e => !isAllDayRowEvent(e))
      .map(getEventStart)
      .filter(d => d && d >= first && d < last)
      .map(d => d.getHours() * 60 + d.getMinutes());
    scrollTo(starts.length ? Math.min(...starts) : 8 * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the visible range changes
  }, [view, rangeKey]);

  const markBusy = (id, busy) => setBusyIds(prev => {
    const next = new Set(prev);
    if (busy) next.add(id); else next.delete(id);
    return next;
  });

  const handleCreate = async (values) => {
    const { payload, error } = buildEventPayload(values);
    if (error) throw new Error(error);
    const created = await onCreate(payload);
    setCreateDraft(null);
    const start = getEventStart(created);
    if (start) setCurrentDate(d => (view === 'month' ? (isSameMonth(d, start) ? d : start) : start));
    notify?.(`Created “${created.summary || 'event'}”`);
  };

  const handleUpdate = async (event, changes, options) => {
    markBusy(event.id, true);
    try {
      await onUpdate(event, changes, options);
      notify?.('Event updated');
    } finally {
      markBusy(event.id, false);
    }
  };

  const handleDelete = async (event, options) => {
    markBusy(event.id, true);
    try {
      await onDelete(event, options);
      setSelectedId(null);
      notify?.(`Deleted “${event.summary || 'event'}”`);
    } finally {
      markBusy(event.id, false);
    }
  };

  const title = (() => {
    if (view === 'month') return <>{format(currentDate, 'MMMM')} <span className="text-muted">{format(currentDate, 'yyyy')}</span></>;
    if (view === 'week') {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      const sameMonth = ws.getMonth() === we.getMonth();
      return <>{format(ws, 'MMM d')} – {format(we, sameMonth ? 'd' : 'MMM d')} <span className="text-muted">{format(we, 'yyyy')}</span></>;
    }
    return <>{format(currentDate, 'EEE')} <span className="text-muted">{format(currentDate, 'MMM d')}</span></>;
  })();

  const iconBtn = 'p-2 rounded-full text-muted hover:text-ink hover:bg-paper transition-colors';
  const viewProps = {
    currentDate,
    events,
    now,
    onEventClick: selectEvent,
    selectedEventId: selectedId,
    busyIds
  };

  return (
    <div className="bg-surface rounded-2xl border border-line w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-line">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <h1 className="font-serif text-[24px] sm:text-[28px] leading-none text-ink whitespace-nowrap" aria-live="polite">{title}</h1>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => step(-1)} aria-label={`Previous ${view}`} title="Previous (k)" className={iconBtn}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={goToToday} title="Today (t)" className="px-2.5 py-1 text-sm font-medium text-ink-soft rounded-md border border-line hover:bg-paper transition-colors">
              Today
            </button>
            <button type="button" onClick={() => step(1)} aria-label={`Next ${view}`} title="Next (j)" className={iconBtn}>
              <ChevronRight size={18} />
            </button>
          </div>
          {rangeLoading && (
            <span role="status" className="inline-flex items-center gap-1 text-xs text-muted whitespace-nowrap">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span className="hidden sm:inline">Loading…</span>
              <span className="sr-only sm:hidden">Loading events</span>
            </span>
          )}
          {demo && (
            <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft/70 px-2 sm:px-2.5 py-0.5 text-[11px] font-medium text-[#6B2E17] whitespace-nowrap" title="This is a demo with sample data. Nothing is saved to Google.">
              Demo<span className="hidden sm:inline">&nbsp;— sample data</span>
            </span>
          )}
          {demo && onSignOut && (
            <button type="button" onClick={onSignOut} className="sm:hidden rounded-full px-2 py-0.5 text-[12px] text-muted underline underline-offset-2 hover:text-ink whitespace-nowrap">
              Exit
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 ml-auto">
          <button
            type="button"
            onClick={openNewForCurrent}
            title="New event (n)"
            className="inline-flex items-center gap-1 rounded-full bg-ink pl-2.5 pr-3 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft transition-colors"
          >
            <Plus size={16} aria-hidden="true" />
            New
          </button>
          <div className="flex rounded-full bg-paper p-1" role="group" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                title={`${v[0].toUpperCase()}${v.slice(1)} view (${v[0]})`}
                className={`px-2.5 sm:px-3.5 py-1 text-sm rounded-full transition-colors ${
                  view === v ? 'bg-surface text-ink font-medium shadow-[0_1px_2px_rgba(29,28,26,0.08)]' : 'text-muted hover:text-ink'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh events"
              title={`Refresh (r)${lastUpdated ? ` · updated ${format(lastUpdated, 'h:mm a')}` : ''}`}
              className={`${iconBtn} inline-flex disabled:opacity-50`}
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
          <CalendarList calendars={calendars} visible={visibleCalendars} onToggle={onToggleCalendar} />
          <button type="button" onClick={() => setShowHelp(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" className={`${iconBtn} hidden md:inline-flex`}>
            <Keyboard size={17} />
          </button>
          {onSignOut && (
            demo ? (
              <>
                <button type="button" onClick={onSignOut} className="hidden sm:inline-flex rounded-full px-3 py-1.5 text-sm text-muted hover:text-ink hover:bg-paper transition-colors whitespace-nowrap">
                  Exit demo
                </button>
              </>
            ) : (
              <button type="button" onClick={onSignOut} className={iconBtn} title="Sign out" aria-label="Sign out">
                <LogOut size={17} />
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {view === 'month' && <MonthView {...viewProps} onDayClick={openDay} />}
        {view === 'week' && <WeekView {...viewProps} onDayClick={openDay} onCreateRange={openCreate} scrollTarget={scrollTarget} />}
        {view === 'day' && <DayView {...viewProps} onCreateRange={openCreate} scrollTarget={scrollTarget} />}
      </div>

      <Dialog open={!!selectedEvent} onClose={() => setSelectedId(null)} labelledBy={detailsHeadingId}>
        {selectedEvent && (
          <EventDetails
            key={selectedEvent.id}
            event={selectedEvent}
            headingId={detailsHeadingId}
            onClose={() => setSelectedId(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onRespond={onRespond}
          />
        )}
      </Dialog>

      <Dialog open={!!createDraft} onClose={() => setCreateDraft(null)} labelledBy={createHeadingId}>
        {createDraft && (
          <EventForm
            heading="New event"
            headingId={createHeadingId}
            initial={createDraft}
            submitLabel={demo ? 'Add (demo)' : 'Add to calendar'}
            onCancel={() => setCreateDraft(null)}
            onSubmit={handleCreate}
          />
        )}
      </Dialog>

      <Dialog open={showHelp} onClose={() => setShowHelp(false)} labelledBy={helpHeadingId}>
        <div className="p-5">
          <h2 id={helpHeadingId} className="font-serif text-[26px] leading-none text-ink">Keyboard shortcuts</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys} className="contents">
                <dt><kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-sans text-xs text-ink whitespace-pre">{keys}</kbd></dt>
                <dd className="text-ink-soft">{label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">Click or drag on an empty time in Week or Day view to create an event.</p>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setShowHelp(false)} className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper">Close</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default GoogleCalendar;
