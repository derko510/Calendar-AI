import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarDays, MessageCircle } from 'lucide-react';
import GoogleCalendar from '../components/GoogleCalendar';
import RealCalendarBot from '../components/RealCalendarBot';
import googleCalendarService from '../services/googleCalendar';
import demoCalendarService from '../services/demoCalendar';

const REFRESH_EVERY_MS = 5 * 60 * 1000;
const REFRESH_ON_FOCUS_AFTER_MS = 60 * 1000;
const LOCAL_FIELDS = ['calendarId', 'calendarName', 'isWritable'];

const isAuthError = (err) => {
  const status = err?.response?.status ?? err?.status;
  const text = String(err?.message || '');
  return status === 401 || /\b401\b|unauthori[sz]ed|invalid_token|not signed in|sign in again/i.test(text);
};

const errorText = (err) =>
  err?.response?.data?.error?.message || err?.message || 'Something went wrong.';

const Dashboard = ({ userCredential, onSignOut, demo = false }) => {
  const service = demo ? demoCalendarService : googleCalendarService;
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null); // { message, auth }
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toast, setToast] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [mobilePane, setMobilePane] = useState('calendar');
  const [now, setNow] = useState(() => new Date());
  const chatInputRef = useRef(null);
  const toastTimer = useRef(null);
  const inFlight = useRef(null);
  const lastLoadAt = useRef(0);

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

  const loadEvents = useCallback(async ({ silent = false } = {}) => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      if (silent) setRefreshing(true);
      try {
        if (userCredential?.accessToken) service.setAccessToken(userCredential.accessToken);
        const timeMin = new Date();
        timeMin.setMonth(timeMin.getMonth() - 3);
        const timeMax = new Date();
        timeMax.setMonth(timeMax.getMonth() + 3);
        const list = await service.getAllCalendarEvents(timeMin.toISOString(), timeMax.toISOString(), 2500);
        setEvents(list);
        setError(null);
        setLastUpdated(new Date());
        lastLoadAt.current = Date.now();
      } catch (err) {
        console.error('Failed to load calendar events:', err);
        setError(isAuthError(err)
          ? { message: 'Your Google session has expired. Sign in again to keep your calendar in sync.', auth: true }
          : { message: `Couldn’t load your calendar: ${errorText(err)}`, auth: false });
      } finally {
        setLoading(false);
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [service, userCredential]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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

  // ---- Mutations (used by the calendar and the chat) ----
  const wrapAuth = (err) => {
    if (isAuthError(err)) setError({ message: 'Your Google session has expired. Sign in again to keep your calendar in sync.', auth: true });
    return new Error(isAuthError(err) ? 'Your Google session expired — sign in again.' : errorText(err));
  };

  const createEvent = useCallback(async (payload, calendarId = 'primary') => {
    try {
      const created = await service.createEvent(calendarId, payload);
      const event = { calendarId, isWritable: true, ...created };
      setEvents(prev => [...prev.filter(e => e.id !== event.id), event]);
      return event;
    } catch (err) {
      throw wrapAuth(err);
    }
  }, [service]);

  const updateEvent = useCallback(async (event, changes) => {
    const calendarId = event.calendarId || 'primary';
    try {
      let updated;
      if (typeof service.patchEvent === 'function') {
        updated = await service.patchEvent(calendarId, event.id, changes);
      } else {
        // PUT replaces the whole event, so send the full resource with the changes applied
        const body = Object.fromEntries(Object.entries(event).filter(([k]) => !LOCAL_FIELDS.includes(k)));
        updated = await service.updateEvent(calendarId, event.id, { ...body, ...changes });
      }
      const merged = { ...event, ...updated, calendarId, isWritable: event.isWritable, calendarName: event.calendarName };
      setEvents(prev => prev.map(e => (e.id === event.id ? merged : e)));
      return merged;
    } catch (err) {
      throw wrapAuth(err);
    }
  }, [service]);

  const deleteEvent = useCallback(async (event) => {
    try {
      await service.deleteEvent(event.calendarId || 'primary', event.id);
      setEvents(prev => prev.filter(e => e.id !== event.id));
      return event.id;
    } catch (err) {
      throw wrapAuth(err);
    }
  }, [service]);

  const openEventFromChat = useCallback((id) => {
    if (!events.some(e => e.id === id)) {
      notify('That event is no longer on your calendar.');
      return;
    }
    setMobilePane('calendar');
    setFocusRequest({ id, nonce: Date.now() });
  }, [events, notify]);

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

      <div className="w-full max-w-[120rem] mx-auto flex-1 min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] gap-3 lg:gap-4">
          <section className={paneClass('calendar')} aria-label="Calendar">
            <GoogleCalendar
              events={events}
              now={now}
              demo={demo}
              onSignOut={handleSignOut}
              onCreate={createEvent}
              onUpdate={updateEvent}
              onDelete={deleteEvent}
              notify={notify}
              focusRequest={focusRequest}
              onFocusChat={focusChat}
              onRefresh={refresh}
              refreshing={refreshing}
              lastUpdated={lastUpdated}
            />
          </section>
          <section className={paneClass('chat')} aria-label="Assistant">
            <RealCalendarBot
              demo={demo}
              events={events}
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
