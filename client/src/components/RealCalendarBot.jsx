import { useState, useEffect, useRef } from 'react';
import { ArrowUp, Loader2, Calendar, RefreshCw, Clock, MapPin, Trash2, X } from 'lucide-react';
import googleCalendarService from '../services/googleCalendar';
import { parseEventText } from '../utils/parseEventText';

// Local dev talks to the local server; the deployed site talks to the deployed one
const getApiBaseUrl = () =>
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : 'https://server-nu-eight-16.vercel.app');

const RealCalendarBot = ({ userCredential, events, onEventsDeleted, onEventsCreated }) => {
  const suggestedPrompts = [
    'What is next on my calendar?',
    'What do I have this week?',
    'Find my last meeting',
    'Where am I going tomorrow?'
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isSynced, setIsSynced] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Auto-sync when component loads
    if (userCredential && events && events.length > 0 && !isSynced) {
      handleSync();
    }
  }, [userCredential, events, isSynced]);

  const handleSync = async () => {
    if (!userCredential || !events) {
      setSyncStatus('No calendar data available');
      return;
    }

    setIsSyncing(true);
    try {
      const API_BASE_URL = getApiBaseUrl();

      // Extract user info from credential
      const userInfo = {
        email: userCredential.email || 'user@example.com',
        name: userCredential.name || 'User',
        id: userCredential.id || 'unknown'
      };

      console.log(`🔄 Syncing ${events.length} real calendar events...`);
      
      const response = await fetch(`${API_BASE_URL}/api/real-calendar/sync-frontend-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: events,
          userInfo: userInfo
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSyncStatus(`Synced ${data.eventCount} events`);
        setIsSynced(true);
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      console.error('Real calendar sync error:', error);
      setSyncStatus('');
    } finally {
      setIsSyncing(false);
    }
  };

  const submitPrompt = (prompt) => sendMessage(prompt);

  const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  const getEventStart = (event) => {
    const startValue = event.startDatetime || event.start?.dateTime || event.start?.date;
    if (!startValue) return null;

    const date = new Date(startValue);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const normalizeCalendarEvent = (event) => ({
    ...event,
    title: stripHtml(event.summary || event.title || 'Untitled event'),
    startDatetime: getEventStart(event),
    location: stripHtml(event.location || ''),
    description: stripHtml(event.description || '')
  });

  const STOPWORDS = new Set([
    'what','when','where','which','who','how','why','is','are','was','were',
    'have','has','had','will','would','could','can','should','shall','may','might',
    'the','a','an','and','or','but','not','no','nor','so','yet',
    'i','me','my','we','our','you','your','he','she','they','their','it','its',
    'this','that','these','those','there','here',
    'on','in','at','for','to','of','from','by','with','about','as','into','through',
    'do','did','does','be','been','being',
    'all','every','everything','anything','something','nothing','any','some',
    'find','show','get','list','tell','give','look',
    'calendar','event','events','schedule','appointment','appointments',
    'please','just','okay','ok','sure','well','now','then','also','too',
    'next','last','soon','upcoming','past','recent',
  ]);

  const extractKeywords = (text) =>
    text.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 1 && !STOPWORDS.has(w));

  const dateRangeFromText = (text, now) => {
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

    if (/\byesterday\b/.test(text)) {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return { min: startOfDay(d), max: endOfDay(d), label: 'yesterday' };
    }
    if (/\btoday\b/.test(text)) {
      return { min: startOfDay(now), max: endOfDay(now), label: 'today' };
    }
    if (/\btomorrow\b/.test(text)) {
      const d = new Date(now); d.setDate(d.getDate() + 1);
      return { min: startOfDay(d), max: endOfDay(d), label: 'tomorrow' };
    }
    if (/\blast\s+week\b/.test(text)) {
      const mon = new Date(now); mon.setDate(mon.getDate() - mon.getDay() - 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { min: startOfDay(mon), max: endOfDay(sun), label: 'last week' };
    }
    if (/\b(this\s+week|week)\b/.test(text) && !/next/.test(text)) {
      const mon = new Date(now); mon.setDate(mon.getDate() - mon.getDay());
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { min: startOfDay(mon), max: endOfDay(sun), label: 'this week' };
    }
    if (/\bnext\s+week\b/.test(text)) {
      const mon = new Date(now); mon.setDate(mon.getDate() - mon.getDay() + 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { min: startOfDay(mon), max: endOfDay(sun), label: 'next week' };
    }
    if (/\blast\s+month\b/.test(text)) {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 0);
      return { min: startOfDay(start), max: endOfDay(end), label: 'last month' };
    }
    if (/\b(this\s+month|month)\b/.test(text) && !/next/.test(text)) {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { min: startOfDay(start), max: endOfDay(end), label: 'this month' };
    }
    if (/\bnext\s+month\b/.test(text)) {
      const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      return { min: startOfDay(start), max: endOfDay(end), label: 'next month' };
    }
    if (/\b(weekend)\b/.test(text)) {
      const sat = new Date(now); sat.setDate(now.getDate() + (6 - now.getDay()));
      const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
      return { min: startOfDay(sat), max: endOfDay(sun), label: 'this weekend' };
    }
    return null;
  };

  const getLocalAnswer = (messageText) => {
    const text = messageText.toLowerCase();
    const now = new Date();
    const normalizedEvents = (events || [])
      .map(normalizeCalendarEvent)
      .filter(event => event.startDatetime)
      .sort((a, b) => a.startDatetime - b.startDatetime);

    let matches = normalizedEvents;
    let intro = 'I found these events:';

    const isLookingForNext  = /\b(next|upcoming|soon|what.{0,10}(is|am)|coming up)\b/.test(text);
    const isLookingForLast  = /\b(last|previous|most recent|when did)\b/.test(text);
    const dateRange = dateRangeFromText(text, now);
    const keywords  = extractKeywords(text);

    if (dateRange) {
      matches = normalizedEvents.filter(e =>
        e.startDatetime >= dateRange.min && e.startDatetime <= dateRange.max
      );
      // If also filtering by keyword (e.g. "dentist last week")
      if (keywords.length > 0) {
        const filtered = matches.filter(e => {
          const s = `${e.title} ${e.location} ${e.description}`.toLowerCase();
          return keywords.some(kw => s.includes(kw));
        });
        if (filtered.length > 0) matches = filtered;
      }
      intro = matches.length > 0
        ? `Here is what you have ${dateRange.label}:`
        : `I could not find events ${dateRange.label}.`;
    } else if (isLookingForNext && keywords.length === 0) {
      matches = normalizedEvents.filter(e => e.startDatetime >= now);
      intro = matches.length > 0 ? 'Next on your calendar:' : 'No upcoming events found.';
    } else if (isLookingForLast && keywords.length === 0) {
      matches = normalizedEvents.filter(e => e.startDatetime < now).reverse();
      intro = matches.length > 0 ? 'Your most recent events:' : 'No past events found.';
    } else if (keywords.length > 0) {
      matches = normalizedEvents.filter(e => {
        const s = `${e.title} ${e.location} ${e.description}`.toLowerCase();
        return keywords.some(kw => s.includes(kw));
      });
      if (isLookingForLast) {
        matches = matches.filter(e => e.startDatetime < now).reverse();
        intro = matches.length > 0
          ? `Most recent matching event${matches.length === 1 ? '' : 's'}:`
          : 'No past events found matching that.';
      } else if (isLookingForNext) {
        matches = matches.filter(e => e.startDatetime >= now);
        intro = matches.length > 0
          ? `Upcoming matching event${matches.length === 1 ? '' : 's'}:`
          : 'No upcoming events found matching that.';
      } else {
        intro = matches.length > 0 ? 'Here are matching events:' : '';
      }
    }

    const topMatches = matches.slice(0, 5);

    if (topMatches.length === 0) {
      return {
        content: 'I could not find matching events in your calendar.',
        events: []
      };
    }

    const lines = topMatches.map(event => {
      const time = event.startDatetime.toLocaleString([], {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: event.start?.date ? undefined : 'numeric',
        minute: event.start?.date ? undefined : '2-digit'
      });
      return `- ${event.title} — ${time}${event.location ? ` at ${event.location}` : ''}`;
    });

    return {
      content: `${intro}\n${lines.join('\n')}`,
      events: topMatches
    };
  };

  const isCreateIntent = (text) =>
    /\b(create|add|schedule|book|make|set up|new event)\b/.test(text.toLowerCase());

  const parseEventsWithAI = async (messageText) => {
    const API_BASE_URL = getApiBaseUrl();
    try {
      const res = await fetch(`${API_BASE_URL}/api/real-calendar/parse-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Parse failed');
      return data.events; // array
    } catch (err) {
      // AI backend unreachable (e.g. deployed without Ollama) — fall back to the local parser
      const local = parseEventText(messageText);
      if (!local) throw err;
      return [local];
    }
  };

  // Local wall-clock "YYYY-MM-DDTHH:MM:SS" + 1h (toISOString would shift it to UTC)
  const addOneHour = (localISO) => {
    const d = new Date(localISO);
    d.setHours(d.getHours() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  };

  const queueCreateConfirmation = async (messageText) => {
    if (!isCreateIntent(messageText)) return false;
    setIsLoading(true);
    try {
      const parsedList = await parseEventsWithAI(messageText);
      const enriched = parsedList.map(parsed => {
        const startISO = `${parsed.date}T${parsed.startTime}:00`;
        const startMs = new Date(startISO).getTime();
        let endISO;
        if (parsed.endTime && /^\d{2}:\d{2}$/.test(parsed.endTime)) {
          const candidate = new Date(`${parsed.date}T${parsed.endTime}:00`).getTime();
          const diffHrs = (candidate - startMs) / (1000 * 60 * 60);
          // Only trust Ollama's endTime if it's a plausible duration (1 min – 4 hrs)
          if (diffHrs > 0 && diffHrs <= 4) {
            endISO = `${parsed.date}T${parsed.endTime}:00`;
          } else {
            endISO = addOneHour(startISO);
          }
        } else {
          endISO = addOneHour(startISO);
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
    } catch (err) {
      console.error('Create event parse error:', err);
      const isQuota = err.message?.includes('429') || err.message?.includes('quota');
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: isQuota
          ? 'AI is rate limited right now — wait a moment and try again.'
          : 'I had trouble parsing that event. Try: "Create dentist appointment on June 3 at 2pm".',
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
    return true;
  };

  const confirmCreateEvent = async (actionId) => {
    if (!pendingCreate || pendingCreate.id !== actionId) return;
    const { events: eventsToCreate } = pendingCreate;
    setPendingCreate(null);
    setIsLoading(true);
    try {
      googleCalendarService.setAccessToken(userCredential.accessToken);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const results = await Promise.allSettled(
        eventsToCreate.map(({ parsed, startISO, endISO }) =>
          googleCalendarService.createEvent('primary', {
            summary: parsed.title,
            description: parsed.description || '',
            location: parsed.location || '',
            start: { dateTime: startISO, timeZone: tz },
            end:   { dateTime: endISO,   timeZone: tz }
          })
        )
      );
      const succeeded = eventsToCreate.filter((_, i) => results[i].status === 'fulfilled');
      const createdGoogleEvents = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
      if (onEventsCreated && createdGoogleEvents.length > 0) {
        onEventsCreated(createdGoogleEvents);
      }
      const failed = eventsToCreate.length - succeeded.length;
      const lines = succeeded.map(({ parsed, startISO }) =>
        `• ${parsed.title} — ${new Date(startISO).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      ).join('\n');
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: `Created ${succeeded.length} event${succeeded.length === 1 ? '' : 's'}:\n${lines}${failed ? `\n${failed} could not be created.` : ''}`,
        timestamp: new Date()
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: 'Failed to create events. Your session may have expired — try signing out and back in.',
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

  const isWildcardDelete = (text) => {
    // Strip the action verb and "all/every/everything" qualifiers, then check if anything specific remains
    const withoutVerb = text.replace(/\b(delete|remove|cancel)\b/gi, '');
    const withoutQualifiers = withoutVerb.replace(/\b(everything|all events?|all of (my|the) events?|all|every)\b/gi, '');
    return extractKeywords(withoutQualifiers).length === 0;
  };

  const getDeleteIntent = (messageText) => {
    const text = messageText.toLowerCase();
    if (!/\b(delete|remove|cancel)\b/.test(text)) return null;

    if (isWildcardDelete(text)) {
      return { query: 'all events', keywords: [], wildcard: true };
    }

    const keywords = extractKeywords(text.replace(/\b(delete|remove|cancel)\b/g, ''));
    if (keywords.length === 0) return null;

    return {
      query: keywords.join(' '),
      keywords,
      wildcard: false
    };
  };

  const findMatchingEvents = (keywords, wildcard = false) => {
    const all = (events || [])
      .map(normalizeCalendarEvent)
      .filter(e => e.startDatetime && e.isWritable !== false)
      .sort((a, b) => a.startDatetime - b.startDatetime);
    if (wildcard) return all;
    return all.filter(e => {
      const s = `${e.title} ${e.location} ${e.description}`.toLowerCase();
      return keywords.length === 1
        ? keywords.some(kw => s.includes(kw))
        : keywords.every(kw => s.includes(kw)) || keywords.some(kw => s.includes(kw) && kw.length > 4);
    });
  };

  const countReadOnlyMatches = (keywords, wildcard = false) => {
    const all = (events || [])
      .map(normalizeCalendarEvent)
      .filter(e => e.startDatetime && e.isWritable === false);
    if (wildcard) return all.length;
    return all.filter(e => {
      const s = `${e.title} ${e.location} ${e.description}`.toLowerCase();
      return keywords.length === 1
        ? keywords.some(kw => s.includes(kw))
        : keywords.every(kw => s.includes(kw)) || keywords.some(kw => s.includes(kw) && kw.length > 4);
    }).length;
  };

  const queueDeleteConfirmation = (messageText) => {
    const deleteIntent = getDeleteIntent(messageText);
    if (!deleteIntent) return false;

    const matches = findMatchingEvents(deleteIntent.keywords, deleteIntent.wildcard);
    if (matches.length === 0) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: `I could not find events matching "${deleteIntent.query}".`,
        timestamp: new Date()
      }]);
      return true;
    }

    const readOnlyCount = countReadOnlyMatches(deleteIntent.keywords, deleteIntent.wildcard);
    const readOnlyNote = readOnlyCount > 0
      ? ` (${readOnlyCount} read-only event${readOnlyCount === 1 ? '' : 's'} from shared/subscribed calendars will be skipped.)`
      : '';

    const actionId = String(Date.now());
    setPendingDelete({ id: actionId, events: matches, query: deleteIntent.query });
    setMessages(prev => [...prev, {
      id: Date.now() + 1,
      type: 'bot',
      content: `I found ${matches.length} deletable event${matches.length === 1 ? '' : 's'} matching "${deleteIntent.query}". Confirm to remove them from Google Calendar.${readOnlyNote}`,
      timestamp: new Date(),
      events: matches.slice(0, 5),
      action: { type: 'confirmDelete', id: actionId }
    }]);
    return true;
  };

  const confirmDeleteEvents = async (actionId) => {
    if (!pendingDelete || pendingDelete.id !== actionId) return;

    const eventsToDelete = pendingDelete.events;
    setPendingDelete(null);
    setIsLoading(true);

    try {
      googleCalendarService.setAccessToken(userCredential.accessToken);

      const results = await Promise.allSettled(
        eventsToDelete.map(event => googleCalendarService.deleteEvent(event.calendarId || 'primary', event.id || event.googleEventId))
      );
      const deletedIds = eventsToDelete
        .filter((_, index) => results[index].status === 'fulfilled')
        .map(event => event.id || event.googleEventId);
      const failedCount = results.length - deletedIds.length;

      onEventsDeleted?.(deletedIds);
      setIsSynced(false);
      setSyncStatus('Calendar changed. Sync again when ready.');

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: failedCount > 0
          ? `Deleted ${deletedIds.length} event${deletedIds.length === 1 ? '' : 's'}. ${failedCount} could not be deleted — they may belong to a calendar managed by another app.`
          : `Deleted ${deletedIds.length} event${deletedIds.length === 1 ? '' : 's'} from Google Calendar.`,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Delete events error:', error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: 'I could not delete those events. Your Google session may need to be refreshed.',
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

    if (await queueCreateConfirmation(userMessage.content)) {
      return;
    }

    if (queueDeleteConfirmation(userMessage.content)) {
      setIsLoading(false);
      return;
    }

    try {
      const answer = await askAIWithCalendar(userMessage.content);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: answer,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      if (error.message === 'rate_limited') {
        setMessages(prev => [...prev, { id: Date.now() + 1, type: 'bot', content: 'AI is rate limited — wait a moment and try again.', timestamp: new Date(), isError: true }]);
        setIsLoading(false);
        return;
      }
      const localAnswer = getLocalAnswer(userMessage.content);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        content: localAnswer.content,
        timestamp: new Date(),
        events: localAnswer.events
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const askAIWithCalendar = async (question) => {
    const API_BASE_URL = getApiBaseUrl();
    const res = await fetch(`${API_BASE_URL}/api/real-calendar/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, events: events || [], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'AI error');
    return data.message;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatEventTime = (event) => {
    const startValue = event.startDatetime || event.start?.dateTime || event.start?.date;
    if (!startValue) return 'Time unavailable';

    const start = new Date(startValue);
    if (Number.isNaN(start.getTime())) return 'Time unavailable';

    if (event.isAllDay || event.start?.date) {
      return start.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }

    return start.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-surface rounded-2xl border border-line flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="font-serif text-[26px] leading-none text-ink">Ask</h3>
            <p className="mt-1 text-xs text-muted truncate">
              {syncStatus || `${events?.length || 0} events loaded`}
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          title={isSynced ? 'Synced with backend' : 'Sync with backend'}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted hover:text-ink hover:bg-paper disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isSynced ? 'bg-[#6E8F68]' : 'bg-line'}`}></span>
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing' : 'Sync'}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-quiet px-5 py-5 space-y-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`${
                message.type === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-md bg-ink text-paper px-3.5 py-2.5'
                  : message.isError
                  ? 'max-w-[92%] border-l-2 border-accent pl-3 text-ink-soft'
                  : 'max-w-[92%] text-ink'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  {message.events?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.events.slice(0, 3).map((event) => (
                        <div
                          key={event.id || event.googleEventId}
                          className="rounded-lg border border-line bg-paper/60 px-3 py-2 text-ink-soft"
                        >
                          <p className="text-sm font-medium text-ink">
                            {event.title || event.summary || 'Untitled event'}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                            <Clock className="w-3 h-3" />
                            <span>{formatEventTime(event)}</span>
                          </div>
                          {event.location && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {message.action?.type === 'confirmCreate' && (
                    <div className="mt-3 space-y-2">
                      <div className="rounded-lg border border-line bg-paper/60 p-3 text-xs text-ink-soft space-y-2">
                        {(message.action.events || []).map((item, i) => (
                          <div key={i} className={`space-y-0.5 ${i > 0 ? 'pt-2 border-t border-line' : ''}`}>
                            <div className="text-sm font-medium text-ink">{item.parsed.title}</div>
                            <div className="text-muted">{new Date(item.startISO).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – {new Date(item.endISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                            {item.parsed.location && <div className="text-muted">{item.parsed.location}</div>}
                            {item.parsed.description && <div className="text-muted italic">{item.parsed.description}</div>}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => confirmCreateEvent(message.action.id)}
                          disabled={!pendingCreate || pendingCreate.id !== message.action.id || isLoading}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper hover:bg-ink-soft disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Calendar className="w-3 h-3" />
                          Add to calendar
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelCreateEvent(message.action.id)}
                          disabled={!pendingCreate || pendingCreate.id !== message.action.id || isLoading}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <X className="w-3 h-3" />
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
                        disabled={!pendingDelete || pendingDelete.id !== message.action.id || isLoading}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelDeleteEvents(message.action.id)}
                        disabled={!pendingDelete || pendingDelete.id !== message.action.id || isLoading}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  )}
                  <p className={`text-[11px] mt-1 ${message.type === 'user' ? 'text-paper/50' : 'text-muted/80'}`}>
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Looking through your calendar…</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-5 pt-3 border-t border-line">
        <div className="flex gap-1.5 overflow-x-auto scroll-quiet pb-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => submitPrompt(prompt)}
              disabled={isLoading}
              className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:bg-paper hover:border-[#D6CFC2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <form id="calendar-ai-chat-form" onSubmit={handleSubmit} className="px-5 pb-5 pt-1">
        <div className="flex items-center gap-2 rounded-full border border-line bg-paper/50 pl-4 pr-1.5 py-1.5 focus-within:border-[#CFC7B8] focus-within:bg-surface transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask, or say “lunch with Sam Friday at 1”"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink placeholder:text-muted/70 focus:outline-none"
            disabled={isLoading}
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
      </form>
    </div>
  );
};

export default RealCalendarBot;
