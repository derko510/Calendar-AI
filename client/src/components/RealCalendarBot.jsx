import { API_BASE_URL } from '../utils/apiBase';
import { useState, useEffect, useRef } from 'react';
import { ArrowUp, Loader2, Calendar, RefreshCw, Clock, MapPin, Trash2, X, Video, ChevronRight } from 'lucide-react';
import LinkifiedText from './LinkifiedText';
import { getJoinLinks, googleMapsUrl } from '../utils/eventUtils';
import { splitLinks } from '../utils/linkify';

// All-day events carry a bare date ("2026-11-14"). new Date() reads that as UTC midnight,
// which is the previous evening in the Americas, so build it as local midnight instead.
const parseEventStart = (event) => {
  const value = event.startDatetime || event.start?.dateTime || event.start?.date;
  if (!value) return null;
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// The API accepts at most 2000 events; keep the ones closest to today
const MAX_API_EVENTS = 2000;
const eventsForApi = (list) => {
  if (list.length <= MAX_API_EVENTS) return list;
  const now = Date.now();
  const distance = (e) => Math.abs((parseEventStart(e)?.getTime() ?? 0) - now);
  return [...list].sort((a, b) => distance(a) - distance(b)).slice(0, MAX_API_EVENTS);
};

const linkClass = 'underline underline-offset-2 decoration-current/40 hover:decoration-current [overflow-wrap:anywhere]';

const RealCalendarBot = ({ demo = false, events, inputRef, onCreateEvent, onDeleteEvent, onOpenEvent, onRefresh, refreshing = false }) => {
  const suggestedPrompts = [
    'What is next on my calendar?',
    'When is my next interview?',
    'What do I have this week?',
    'When was my last dentist appointment?',
    'Where am I going tomorrow?',
    'Gym tomorrow at 7am'
  ];

  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: "Ask about what's coming up or what already happened. Or type a plan, like “gym Friday at 6pm”, and I'll add it.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const messagesEndRef = useRef(null);
  const localInputRef = useRef(null);
  const textareaRef = inputRef || localInputRef;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Grow the textarea with its content, up to ~5 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Empty (or hidden on phones, where scrollHeight is 0): fall back to the natural one-line height
    if (!input || !el.scrollHeight) { el.style.height = ''; el.style.overflowY = 'hidden'; return; }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
  }, [input, textareaRef]);

  // Reload events (picks up changes made outside this app)
  const handleRefresh = () => onRefresh?.();

  const submitPrompt = (prompt) => sendMessage(prompt);

  const stripHtml = (value = '') =>
    (new DOMParser().parseFromString(String(value), 'text/html').body.textContent || '').replaceAll('\n', ' ').split(' ').filter(Boolean).join(' ');

  const normalizeCalendarEvent = (event) => ({
    ...event,
    title: stripHtml(event.summary || event.title || 'Untitled event'),
    startDatetime: parseEventStart(event),
    location: stripHtml(event.location || ''),
    description: stripHtml(event.description || '')
  });

  // Local wall-clock "YYYY-MM-DDTHH:MM:SS" + 1h (toISOString would shift it to UTC)
  const addOneHour = (localISO) => {
    const d = new Date(localISO);
    d.setHours(d.getHours() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  };

  const showCreateConfirmation = (parsedList) => {
    const enriched = parsedList.map(parsed => {
      const startISO = `${parsed.date}T${parsed.startTime}:00`;
      const startMs = new Date(startISO).getTime();
      let endISO = addOneHour(startISO);
      if (parsed.endTime) {
        const candidate = new Date(`${parsed.date}T${parsed.endTime}:00`).getTime();
        const diffHrs = (candidate - startMs) / (1000 * 60 * 60);
        // Only trust the AI's endTime if it's a plausible duration (1 min – 4 hrs)
        if (diffHrs > 0 && diffHrs <= 4) endISO = `${parsed.date}T${parsed.endTime}:00`;
      }
      return { parsed, startISO, endISO };
    });
    const actionId = String(Date.now());
    setPendingCreate({ id: actionId, events: enriched });
    const count = enriched.length;
    setMessages(prev => [...prev, {
      id: Date.now() + 1,
      type: 'bot',
      content: `I'll create ${count} event${count === 1 ? '' : 's'}. Does this look right?`,
      timestamp: new Date(),
      action: { type: 'confirmCreate', id: actionId, events: enriched }
    }]);
  };

  const confirmCreateEvent = async (actionId) => {
    if (!pendingCreate || pendingCreate.id !== actionId) return;
    const { events: eventsToCreate } = pendingCreate;
    setPendingCreate(null);
    setIsLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const results = await Promise.allSettled(
        eventsToCreate.map(({ parsed, startISO, endISO }) =>
          onCreateEvent({
            summary: parsed.title,
            description: parsed.description || '',
            location: parsed.location || '',
            start: { dateTime: startISO, timeZone: tz },
            end:   { dateTime: endISO,   timeZone: tz }
          })
        )
      );
      const created = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const failures = results.filter(r => r.status === 'rejected');
      if (created.length === 0) throw failures[0]?.reason || new Error('Nothing was created.');
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: `Created ${created.length} event${created.length === 1 ? '' : 's'}.${failures.length ? ` ${failures.length} could not be created: ${failures[0].reason?.message || 'unknown error'}` : ''}`,
        events: created.map(normalizeCalendarEvent),
        timestamp: new Date()
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: `Couldn’t create ${eventsToCreate.length === 1 ? 'that event' : 'those events'}: ${err?.message || 'unknown error'}`,
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelCreateEvent = (actionId) => {
    if (!pendingCreate || pendingCreate.id !== actionId) return;
    setPendingCreate(null);
    setMessages(prev => [...prev, {
      id: Date.now() + 1,
      type: 'bot',
      content: 'Event creation cancelled.',
      timestamp: new Date()
    }]);
  };

  const showDeleteConfirmation = (eventIds) => {
    const wanted = new Set(eventIds);
    const matched = (events || [])
      .filter(e => wanted.has(e.id || e.googleEventId))
      .map(normalizeCalendarEvent)
      .filter(e => e.startDatetime)
      .sort((a, b) => a.startDatetime - b.startDatetime);
    const matches = matched.filter(e => e.isWritable !== false);
    const readOnlyCount = matched.length - matches.length;

    if (matches.length === 0) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: readOnlyCount > 0
          ? 'Those events are on a shared or subscribed calendar, so I can\'t delete them.'
          : 'I could not find events matching that.',
        timestamp: new Date()
      }]);
      return;
    }

    const readOnlyNote = readOnlyCount > 0
      ? ` (${readOnlyCount} read-only event${readOnlyCount === 1 ? '' : 's'} from shared/subscribed calendars will be skipped.)`
      : '';

    const actionId = String(Date.now());
    setPendingDelete({ id: actionId, events: matches });
    setMessages(prev => [...prev, {
      id: Date.now() + 1,
      type: 'bot',
      content: `I found ${matches.length} event${matches.length === 1 ? '' : 's'} to delete. Confirm to remove ${matches.length === 1 ? 'it' : 'them'} from ${demo ? 'the demo calendar' : 'Google Calendar'}.${readOnlyNote}`,
      timestamp: new Date(),
      events: matches.slice(0, 5),
      action: { type: 'confirmDelete', id: actionId }
    }]);
  };

  const confirmDeleteEvents = async (actionId) => {
    if (!pendingDelete || pendingDelete.id !== actionId) return;

    const eventsToDelete = pendingDelete.events;
    setPendingDelete(null);
    setIsLoading(true);

    try {
      const results = await Promise.allSettled(
        eventsToDelete.map(event => onDeleteEvent({ ...event, id: event.id || event.googleEventId }))
      );
      const deletedIds = eventsToDelete
        .filter((_, index) => results[index].status === 'fulfilled')
        .map(event => event.id || event.googleEventId);
      const failedCount = results.length - deletedIds.length;

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: failedCount > 0
          ? `Deleted ${deletedIds.length} event${deletedIds.length === 1 ? '' : 's'}. ${failedCount} could not be deleted — they may belong to a calendar managed by another app.`
          : `Deleted ${deletedIds.length} event${deletedIds.length === 1 ? '' : 's'}${demo ? ' (demo)' : ' from Google Calendar'}.`,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Delete events error:', error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: `I could not delete those events: ${error?.message || 'unknown error'}`,
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelDeleteEvents = (actionId) => {
    if (!pendingDelete || pendingDelete.id !== actionId) return;
    setPendingDelete(null);
    setMessages(prev => [...prev, {
      id: Date.now() + 1,
      type: 'bot',
      content: 'Deletion canceled.',
      timestamp: new Date()
    }]);
  };

  const sendMessage = async (rawMessage) => {
    const messageText = rawMessage.trim();
    if (!messageText || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await interpretMessage(userMessage.content);
      if (result.intent === 'create') {
        showCreateConfirmation(result.events);
      } else if (result.intent === 'delete') {
        showDeleteConfirmation(result.eventIds);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          type: 'bot',
          content: result.answer,
          events: (result.eventIds || [])
            .map(id => (events || []).find(e => (e.id || e.googleEventId) === id))
            .filter(Boolean)
            .map(normalizeCalendarEvent),
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: error.message === 'rate_limited'
          ? 'AI is rate limited — wait a moment and try again.'
          : error instanceof TypeError
            ? 'I could not reach the server. Check your connection and try again.'
            : error.message,
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // The AI decides what the message means: create events, delete events, or answer a question
  const interpretMessage = async (message) => {
    const res = await fetch(`${API_BASE_URL}/api/assistant/message`, {
      method: 'POST',
      // The sign-in cookie proves who is asking; the API refuses chat requests without it
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, events: eventsForApi(events || []), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(demo && { demo: true }) })
    });
    if (res.status === 404) throw new Error('The server is missing /api/assistant/message. Redeploy the backend.');
    const data = await res.json().catch(() => ({}));
    // 401 = session gone, 403 = account not allowed or demo chat off; the server's message says which
    if (res.status === 401 || res.status === 403) throw new Error(data.message || 'You need to sign in to use the assistant.');
    if (!res.ok || !data.success) {
      throw new Error(data.message || (res.status >= 500
        ? `The assistant server isn’t responding (error ${res.status}). Try again in a moment.`
        : `Request failed (error ${res.status}).`));
    }
    return data;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await sendMessage(input);
  };

  // Enter sends, Shift+Enter adds a new line (IME composition is left alone)
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage(input);
    }
    if (e.key === 'Escape') e.currentTarget.blur();
  };

  // Mouse wheels scroll the suggestion strip sideways
  const handlePromptWheel = (e) => {
    const el = e.currentTarget;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatEventTime = (event) => {
    const start = parseEventStart(event);
    if (!start) return 'Time unavailable';

    if (event.isAllDay || (event.start?.date && !event.start?.dateTime)) {
      return start.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }

    return start.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const actionPending = (pending, id) => !pending || pending.id !== id || isLoading;

  const renderEventCard = (event) => {
    const id = event.id || event.googleEventId;
    const joinLinks = getJoinLinks(event);
    const location = (event.location || '').trim();
    const locationHasUrl = splitLinks(location).some(p => p.type === 'link');
    return (
      <div key={id} className="rounded-lg border border-line bg-paper/60 text-ink-soft overflow-hidden">
        <button
          type="button"
          onClick={() => onOpenEvent?.(id)}
          className="group w-full text-left px-3 pt-2 pb-1.5 hover:bg-paper transition-colors"
          title="Show on calendar"
        >
          <span className="flex items-start gap-1">
            <span className="flex-1 min-w-0 text-sm font-medium text-ink break-words">{event.title || event.summary || 'Untitled event'}</span>
            <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted group-hover:text-ink" aria-hidden="true" />
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Clock className="w-3 h-3" aria-hidden="true" />
            <span>{formatEventTime(event)}</span>
          </span>
        </button>
        {(location || joinLinks.length > 0) && (
          <div className="px-3 pb-2 space-y-1.5">
            {location && (
              <div className="flex items-start gap-1.5 text-xs text-muted">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
                {locationHasUrl ? (
                  <LinkifiedText text={location} className="min-w-0" linkClassName={`${linkClass} hover:text-ink`} />
                ) : (
                  <a href={googleMapsUrl(location)} target="_blank" rel="noopener noreferrer" className={`min-w-0 ${linkClass} hover:text-ink`}>{location}</a>
                )}
              </div>
            )}
            {joinLinks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {joinLinks.map((link, i) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={i === 0
                      ? 'inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper hover:bg-ink-soft transition-colors'
                      : 'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft hover:bg-paper transition-colors'}
                  >
                    <Video className="w-3 h-3" aria-hidden="true" />
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-surface rounded-2xl border border-line flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-line">
        <div className="min-w-0">
          <h2 className="font-serif text-[26px] leading-none text-ink">Ask</h2>
          <p className="mt-1 text-xs text-muted truncate">
            {`${events?.length || 0} events loaded${demo ? ' · sample data' : ''}`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || !onRefresh}
          title={demo ? 'Reload events' : 'Reload events from Google Calendar'}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted hover:text-ink hover:bg-paper disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-quiet px-4 sm:px-5 py-5 space-y-5" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`min-w-0 ${
                message.type === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-md bg-ink text-paper px-3.5 py-2.5'
                  : message.isError
                  ? 'max-w-[92%] border-l-2 border-accent bg-accent-soft/40 rounded-r-lg pl-3 pr-3 py-2 text-[#6B2E17]'
                  : 'max-w-[92%] w-full text-ink'
              }`}
            >
              <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                <LinkifiedText text={message.content} linkClassName={linkClass} />
              </p>
              {message.events?.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.events.slice(0, 5).map(renderEventCard)}
                  {message.events.length > 5 && (
                    <p className="text-xs text-muted">and {message.events.length - 5} more</p>
                  )}
                </div>
              )}
              {message.action?.type === 'confirmCreate' && (
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-line bg-paper/60 p-3 text-xs text-ink-soft space-y-2">
                    {(message.action.events || []).map((item, i) => (
                      <div key={i} className={`space-y-0.5 ${i > 0 ? 'pt-2 border-t border-line' : ''}`}>
                        <div className="text-sm font-medium text-ink">{item.parsed.title}</div>
                        <div className="text-muted">{new Date(item.startISO).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – {new Date(item.endISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                        {item.parsed.location && <div className="text-muted"><LinkifiedText text={item.parsed.location} linkClassName={linkClass} /></div>}
                        {item.parsed.description && <div className="text-muted italic"><LinkifiedText text={item.parsed.description} linkClassName={linkClass} /></div>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => confirmCreateEvent(message.action.id)}
                      disabled={actionPending(pendingCreate, message.action.id)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper hover:bg-ink-soft disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Calendar className="w-3 h-3" aria-hidden="true" />
                      Add to calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelCreateEvent(message.action.id)}
                      disabled={actionPending(pendingCreate, message.action.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {message.action?.type === 'confirmDelete' && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => confirmDeleteEvents(message.action.id)}
                    disabled={actionPending(pendingDelete, message.action.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelDeleteEvents(message.action.id)}
                    disabled={actionPending(pendingDelete, message.action.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              )}
              <p className={`text-[11px] mt-1 ${message.type === 'user' ? 'text-paper/50' : 'text-muted/80'}`}>
                {formatTime(message.timestamp)}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Looking through your calendar…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions: one scrollable row; the trailing spacer keeps the last chip clear of the edge */}
      <div className="border-t border-line pt-3">
        <div
          className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 sm:px-5 pb-3 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)]"
          onWheel={handlePromptWheel}
          aria-label="Suggested questions"
        >
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => submitPrompt(prompt)}
              disabled={isLoading}
              className="shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:bg-paper hover:border-[#D6CFC2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {prompt}
            </button>
          ))}
          <span className="shrink-0 w-3" aria-hidden="true" />
        </div>
      </div>

      <form id="calendar-ai-chat-form" onSubmit={handleSubmit} className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1">
        <div className="flex items-end gap-2 rounded-[22px] border border-line bg-paper/50 pl-4 pr-1.5 py-1.5 focus-within:border-[#CFC7B8] focus-within:bg-surface transition-colors">
          <label htmlFor="chat-input" className="sr-only">Message the assistant</label>
          <textarea
            id="chat-input"
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask, or say “lunch with Sam Friday at 1”"
            className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14.5px] leading-snug text-ink placeholder:text-muted/70 focus:outline-none max-h-[120px]"
            aria-describedby="chat-input-hint"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-ink text-paper p-2 rounded-full hover:bg-ink-soft disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
        <p id="chat-input-hint" className="sr-only">Enter to send, Shift+Enter for a new line.</p>
      </form>
    </div>
  );
};

export default RealCalendarBot;
