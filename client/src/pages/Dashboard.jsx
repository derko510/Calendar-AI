import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CalendarDays, MessageCircle, X } from 'lucide-react';
import { addDays, addMonths, format, startOfMonth } from 'date-fns';
import GoogleCalendar from '../components/GoogleCalendar';
import RealCalendarBot from '../components/RealCalendarBot';
import googleCalendarService from '../services/googleCalendar';
import demoCalendarService from '../services/demoCalendar';
import { eventKey, mergeEvents, dedupeAcrossCalendars, isDefaultVisible } from '../utils/calendarData';
import { withMyResponse } from '../utils/rsvp';

const REFRESH_EVERY_MS = 5 * 60 * 1000;
const REFRESH_ON_FOCUS_AFTER_MS = 60 * 1000;
const REFETCH_AFTER_MUTATION_MS = 1500;
const WINDOW_MONTHS_BEFORE = 3;
const WINDOW_MONTHS_AFTER = 3;
const EXTEND_BUFFER_MONTHS = 1; // load a month beyond what's on screen when the window grows
const VISIBILITY_KEY = 'calendar.visibility';
const LOCAL_FIELDS = ['calendarId', 'calendarName', 'calendarColor', 'calendarPrimary', 'isWritable'];
const RSVP_TOAST = { accepted: 'Accepted', tentative: 'Marked as maybe', declined: 'Declined' };

const isAuthError = (err) => {
  const status = err?.response?.status ?? err?.status;
  const text = String(err?.message || '');
  return status === 401 || /\b401\b|unauthori[sz]ed|invalid_token|not signed in|sign in again/i.test(text);
};

const errorText = (err) => {
  const msg = err?.message || err?.response?.data?.error?.message || 'Something went wrong.';
  const status = err?.response?.status ?? err?.status;
  return status && !msg.includes(String(status)) ? `${msg} (HTTP ${status})` : msg;
};

const readVisibility = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(VISIBILITY_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeVisibility = (value) => {
  try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
};

const initialWindow = () => {
  const thisMonth = startOfMonth(new Date());
  return { from: addMonths(thisMonth, -WINDOW_MONTHS_BEFORE), to: addMonths(thisMonth, WINDOW_MONTHS_AFTER + 1) };
};

const names = (failed) => failed.map(f => f.calendar.summary || f.calendar.id).join(', ');

const Dashboard = ({ userCredential, onSignOut, demo = false }) => {
  const service = demo ? demoCalendarService : googleCalendarService;
  const [events, setEvents] = useState([]); // every loaded copy, keyed by calendarId + id
  const [calendars, setCalendars] = useState([]);
  const [visibility, setVisibility] = useState(readVisibility); // { calendarId: boolean } overrides
  const [loadWindow, setLoadWindow] = useState(initialWindow); // [from, to) loaded for the shown calendars
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [error, setError] = useState(null); // { message, auth } — blocking problem
  const [notice, setNotice] = useState(null); // non-blocking: stale data, a calendar that failed
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toast, setToast] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [mobilePane, setMobilePane] = useState('calendar');
  const [now, setNow] = useState(() => new Date());
  const chatInputRef = useRef(null);
  const toastTimer = useRef(null);
  const inFlight = useRef(null);
  const reloadQueued = useRef(false);
  const lastLoadAt = useRef(0);
  const windowRef = useRef(loadWindow);
  const eventsRef = useRef(events);
  const calendarsRef = useRef(calendars);
  const visibilityRef = useRef(visibility);
  const mutationSeq = useRef(0); // bumped when a create/edit/delete starts and when it finishes
  const refetchTimer = useRef(null);
  const wantedRange = useRef(null);
  const extending = useRef(false);
  const loadedOnce = useRef(false);
  eventsRef.current = events;
  calendarsRef.current = calendars;
  visibilityRef.current = visibility;

  const isShown = useCallback((cal, overrides = visibilityRef.current) =>
    (Object.hasOwn(overrides, cal.id) ? !!overrides[cal.id] : isDefaultVisible(cal)), []);

  const notify = useCallback((message, tone = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Clock for the current-time line and past/now styling
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const setWindow = (next) => {
    windowRef.current = next;
    setLoadWindow(next);
  };

  // ---- Loading ----
  // Full load / refresh of the whole loaded window for every shown calendar.
  // A failed refresh never empties the calendar: what's on screen stays, with a notice.
  const loadEvents = useCallback(async ({ silent = false } = {}) => {
    if (inFlight.current) {
      reloadQueued.current = true;
      return inFlight.current;
    }
    const run = (async () => {
      const seq = mutationSeq.current;
      if (silent) setRefreshing(true);
      try {
        if (userCredential?.accessToken) service.setAccessToken(userCredential.accessToken);
        const cals = await service.listCalendars();
        const shown = cals.filter(c => isShown(c));
        const { from, to } = windowRef.current;
        const { events: fetched, failed } = await service.getEventsForCalendars(shown, from.toISOString(), to.toISOString());
        if (mutationSeq.current !== seq) {
          // A create/edit/delete happened while this was loading; its result may be missing here. Try again shortly.
          scheduleRefetch();
          return;
        }
        const failedIds = new Set(failed.map(f => f.calendar.id));
        setCalendars(cals);
        setEvents(prev => mergeEvents(prev, fetched, from, to, id => !failedIds.has(id)));
        setError(null);
        setNotice(failed.length ? `Couldn’t refresh ${names(failed)} — showing saved events.` : null);
        if (failed.length) console.warn('Some calendars failed to load:', failed);
        setLastUpdated(new Date());
        lastLoadAt.current = Date.now();
        loadedOnce.current = true;
      } catch (err) {
        console.error('Failed to load calendar events:', err);
        if (isAuthError(err)) {
          setError({ message: 'Your Google session has expired. Sign in again to keep your calendar in sync.', auth: true });
        } else if (eventsRef.current.length > 0) {
          setNotice(`Couldn’t refresh — showing saved events. (${errorText(err)})`);
        } else {
          setError({ message: `Couldn’t load your calendar: ${errorText(err)}`, auth: false });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        inFlight.current = null;
        if (reloadQueued.current) {
          reloadQueued.current = false;
          loadEvents({ silent: true });
        } else {
          pumpRange();
        }
      }
    })();
    inFlight.current = run;
    return run;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable helpers
  }, [service, userCredential, isShown]);

  const scheduleRefetch = useCallback(() => {
    clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => loadEvents({ silent: true }), REFETCH_AFTER_MUTATION_MS);
  }, [loadEvents]);

  // Grow the loaded window to cover what's on screen (navigating months ahead or back), one gap at a time
  async function pumpRange() {
    const want = wantedRange.current;
    if (!want || extending.current || inFlight.current || !loadedOnce.current) return;
    const { from, to } = windowRef.current;
    let gapFrom;
    let gapTo;
    if (want.start < from) {
      gapFrom = startOfMonth(addMonths(want.start, -EXTEND_BUFFER_MONTHS));
      gapTo = from;
    } else if (want.end > to) {
      gapFrom = to;
      gapTo = startOfMonth(addMonths(want.end, EXTEND_BUFFER_MONTHS + 1));
    } else {
      return;
    }
    extending.current = true;
    setRangeLoading(true);
    const seq = mutationSeq.current;
    let retry = false;
    try {
      const shown = calendarsRef.current.filter(c => isShown(c));
      const { events: fetched, failed } = await service.getEventsForCalendars(shown, gapFrom.toISOString(), gapTo.toISOString());
      if (mutationSeq.current !== seq) {
        retry = true; // stale: fetch the gap again
      } else {
        const failedIds = new Set(failed.map(f => f.calendar.id));
        setEvents(prev => mergeEvents(prev, fetched, gapFrom, gapTo, id => !failedIds.has(id)));
        const cur = windowRef.current;
        setWindow({ from: gapFrom < cur.from ? gapFrom : cur.from, to: gapTo > cur.to ? gapTo : cur.to });
        if (failed.length) setNotice(`Couldn’t load ${names(failed)} for ${format(gapFrom, 'MMM yyyy')} – ${format(addDays(gapTo, -1), 'MMM yyyy')}.`);
        retry = true; // the screen may still need more (e.g. both ends)
      }
    } catch (err) {
      console.error('Failed to load more events:', err);
      if (isAuthError(err)) setError({ message: 'Your Google session has expired. Sign in again to keep your calendar in sync.', auth: true });
      else setNotice(`Couldn’t load events for ${format(gapFrom, 'MMM yyyy')} – ${format(addDays(gapTo, -1), 'MMM yyyy')}: ${errorText(err)}`);
      // no retry loop: the next navigation (or Refresh) tries again
    } finally {
      extending.current = false;
      setRangeLoading(false);
      if (retry) pumpRange();
    }
  }

  const onVisibleRangeChange = useCallback((range) => {
    wantedRange.current = range;
    pumpRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pumpRange only reads refs
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => () => clearTimeout(refetchTimer.current), []);

  // Background refresh: every 5 minutes while visible, and when the tab regains focus
  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadAt.current < REFRESH_ON_FOCUS_AFTER_MS) return;
      loadEvents({ silent: true });
    };
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadEvents({ silent: true });
    }, REFRESH_EVERY_MS);
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [loadEvents]);

  const refresh = useCallback(() => loadEvents({ silent: true }), [loadEvents]);

  // ---- Calendars shown ----
  const visibleCalendars = useMemo(
    () => new Set(calendars.filter(c => (Object.hasOwn(visibility, c.id) ? visibility[c.id] : isDefaultVisible(c))).map(c => c.id)),
    [calendars, visibility]
  );

  const toggleCalendar = useCallback((id, show) => {
    const next = { ...visibilityRef.current, [id]: show };
    visibilityRef.current = next;
    setVisibility(next);
    writeVisibility(next);
    // Newly shown calendars are loaded for the whole window; hidden ones are dropped at the next load
    if (show) loadEvents({ silent: true });
  }, [loadEvents]);

  // What the views and the chat see: shown calendars only, one copy per event
  const visibleEvents = useMemo(
    () => dedupeAcrossCalendars(events.filter(e => visibleCalendars.has(e.calendarId || 'primary'))),
    [events, visibleCalendars]
  );

  const loadedRange = useMemo(() => ({
    from: format(loadWindow.from, 'yyyy-MM-dd'),
    to: format(addDays(loadWindow.to, -1), 'yyyy-MM-dd') // inclusive last loaded day
  }), [loadWindow]);

  // ---- Mutations (used by the calendar and the chat) ----
  // Each bumps the mutation counter before and after, so a load that overlapped it is discarded and redone.
  const mutate = useCallback(async (fn) => {
    mutationSeq.current += 1;
    try {
      return await fn();
    } catch (err) {
      if (isAuthError(err)) setError({ message: 'Your Google session has expired. Sign in again to keep your calendar in sync.', auth: true });
      throw new Error(isAuthError(err) ? 'Your Google session expired — sign in again.' : errorText(err));
    } finally {
      mutationSeq.current += 1; // an overlapping load sees this, discards its result and refetches
    }
  }, []);

  const calendarMeta = (calendarId) => {
    const cal = calendarsRef.current.find(c => c.id === calendarId);
    return cal
      ? { calendarId: cal.id, calendarName: cal.summary, calendarColor: cal.backgroundColor, calendarPrimary: cal.primary, isWritable: cal.writable }
      : { calendarId, isWritable: true };
  };

  // The chat may hand back an event without its calendar; find the loaded copy
  const resolveEvent = (event) => {
    if (event?.calendarId) return event;
    return eventsRef.current.find(e => e.id === event?.id && e.isWritable !== false)
      || eventsRef.current.find(e => e.id === event?.id)
      || event;
  };

  const createEvent = useCallback((payload, calendarId, options = {}) => mutate(async () => {
    const target = calendarId && calendarId !== 'primary'
      ? calendarId
      : calendarsRef.current.find(c => c.primary)?.id || 'primary';
    const created = await service.createEvent(target, payload, options);
    const event = { ...created, ...calendarMeta(target) };
    setEvents(prev => [...prev.filter(e => eventKey(e) !== eventKey(event)), event]);
    return event;
  }), [service, mutate]);

  const updateEvent = useCallback((original, changes, options = {}) => mutate(async () => {
    const event = resolveEvent(original);
    const calendarId = event.calendarId || 'primary';
    let updated;
    if (typeof service.patchEvent === 'function') {
      updated = await service.patchEvent(calendarId, event.id, changes, options);
    } else {
      // PUT replaces the whole event, so send the full resource with the changes applied
      const body = Object.fromEntries(Object.entries(event).filter(([k]) => !LOCAL_FIELDS.includes(k)));
      updated = await service.updateEvent(calendarId, event.id, { ...body, ...changes }, options);
    }
    const merged = { ...event, ...updated, ...calendarMeta(calendarId), isWritable: event.isWritable };
    setEvents(prev => prev.map(e => (eventKey(e) === eventKey(event) ? merged : e)));
    return merged;
  }), [service, mutate]);

  const deleteEvent = useCallback((original, options = {}) => mutate(async () => {
    const event = resolveEvent(original);
    await service.deleteEvent(event.calendarId || 'primary', event.id, options);
    setEvents(prev => prev.filter(e => eventKey(e) !== eventKey(event)));
    return event.id;
  }), [service, mutate]);

  // RSVP: only the signed-in guest's answer changes; the attendees list is sent in full
  const respondToEvent = useCallback((original, status) => mutate(async () => {
    const event = resolveEvent(original);
    const calendarId = event.calendarId || 'primary';
    const attendees = withMyResponse(event, status);
    const updated = await service.respondToEvent(calendarId, event.id, attendees);
    const merged = { ...event, ...updated, ...calendarMeta(calendarId), isWritable: event.isWritable };
    setEvents(prev => prev.map(e => (eventKey(e) === eventKey(event) ? merged : e)));
    notify(RSVP_TOAST[status]);
    return merged;
  }), [service, mutate, notify]);

  const openEventFromChat = useCallback((id) => {
    if (!visibleEvents.some(e => e.id === id)) {
      notify('That event is no longer on your calendar.');
      return;
    }
    setMobilePane('calendar');
    setFocusRequest({ id, nonce: Date.now() });
  }, [visibleEvents, notify]);

  const focusChat = useCallback(() => {
    setMobilePane('chat');
    // Wait for the re-render so the pane is visible on phones before focusing
    setTimeout(() => chatInputRef.current?.focus(), 0);
  }, []);

  const handleSignOut = () => onSignOut?.();

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <p className="font-serif italic text-3xl text-muted animate-pulse">Opening your calendar…</p>
      </div>
    );
  }

  const paneClass = (pane) => `min-h-0 h-full ${mobilePane === pane ? 'block' : 'hidden'} lg:block`;

  return (
    <div className="h-[100dvh] bg-paper p-2 sm:p-3 lg:p-5 flex flex-col gap-2 lg:gap-3 overflow-hidden">
      {error && (
        <div role="alert" className="w-full max-w-3xl mx-auto rounded-xl border border-accent/30 bg-accent-soft px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <p className="text-sm text-[#6B2E17] text-center">{error.message}</p>
          {error.auth ? (
            <button type="button" onClick={handleSignOut} className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft transition-colors">
              Sign in again
            </button>
          ) : (
            <button type="button" onClick={refresh} className="rounded-full border border-accent/40 px-3 py-1 text-sm font-medium text-[#6B2E17] hover:bg-surface/60 transition-colors">
              Try again
            </button>
          )}
        </div>
      )}

      {notice && !error && (
        <div role="status" className="w-full max-w-3xl mx-auto rounded-full border border-line bg-surface pl-4 pr-1 py-1 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <p className="min-w-0 truncate" title={notice}>{notice}</p>
          <button type="button" onClick={refresh} disabled={refreshing} className="shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium text-ink hover:bg-paper disabled:opacity-50">
            Retry
          </button>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 p-1.5 rounded-full text-muted hover:text-ink hover:bg-paper">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="w-full max-w-[120rem] mx-auto flex-1 min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] gap-3 lg:gap-4">
          <section className={paneClass('calendar')} aria-label="Calendar">
            <GoogleCalendar
              events={visibleEvents}
              now={now}
              demo={demo}
              onSignOut={handleSignOut}
              onCreate={createEvent}
              onUpdate={updateEvent}
              onDelete={deleteEvent}
              onRespond={respondToEvent}
              notify={notify}
              focusRequest={focusRequest}
              onFocusChat={focusChat}
              onRefresh={refresh}
              refreshing={refreshing}
              lastUpdated={lastUpdated}
              calendars={calendars}
              visibleCalendars={visibleCalendars}
              onToggleCalendar={toggleCalendar}
              onVisibleRangeChange={onVisibleRangeChange}
              rangeLoading={rangeLoading}
            />
          </section>
          <section className={paneClass('chat')} aria-label="Assistant">
            <RealCalendarBot
              demo={demo}
              events={visibleEvents}
              loadedRange={loadedRange}
              inputRef={chatInputRef}
              onCreateEvent={createEvent}
              onDeleteEvent={deleteEvent}
              onOpenEvent={openEventFromChat}
              onRefresh={refresh}
              refreshing={refreshing}
            />
          </section>
        </div>
      </div>

      {/* Phone: switch between calendar and chat */}
      <nav className="lg:hidden shrink-0 grid grid-cols-2 gap-1 rounded-full bg-surface border border-line p-1" aria-label="Panels">
        {[['calendar', 'Calendar', <CalendarDays key="i" className="w-4 h-4" aria-hidden="true" />], ['chat', 'Ask', <MessageCircle key="i" className="w-4 h-4" aria-hidden="true" />]].map(([pane, label, icon]) => (
          <button
            type="button"
            key={pane}
            onClick={() => setMobilePane(pane)}
            aria-pressed={mobilePane === pane}
            className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition-colors ${mobilePane === pane ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <div className={`fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`} role="status" aria-live="polite">
        {toast && (
          <div className={`text-sm px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap ${toast.tone === 'error' ? 'bg-accent text-white' : 'bg-ink text-paper'}`}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
