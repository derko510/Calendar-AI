import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Calendar, RefreshCw, Sparkles, Clock, MapPin, Trash2, X } from 'lucide-react';
import googleCalendarService from '../services/googleCalendar';

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
      content: "Hi, I'm your Calendar AI. I'll sync your events, then you can ask about upcoming plans, past meetings, locations, and people.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Not synced');
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
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://server-nu-eight-16.vercel.app';

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
        
        const syncMessage = {
          id: Date.now(),
          type: 'bot',
          content: `Synced ${data.eventCount} events from your Google Calendar. Ask me what is next, what changed this week, or where a specific event is happening.`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, syncMessage]);
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      console.error('Real calendar sync error:', error);
      setSyncStatus('Sync failed');
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
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const res = await fetch(`${API_BASE_URL}/api/real-calendar/parse-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageText })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Parse failed');
    return data.events; // array
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
            const d = new Date(startISO);
            d.setHours(d.getHours() + 1);
            endISO = d.toISOString().slice(0, 19);
          }
        } else {
          const d = new Date(startISO);
          d.setHours(d.getHours() + 1);
          endISO = d.toISOString().slice(0, 19);
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

    if (!isSynced) {
      const errorMessage = {
        id: Date.now(),
        type: 'bot',
        content: 'Please wait for calendar sync to complete before asking questions.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

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
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const res = await fetch(`${API_BASE_URL}/api/real-calendar/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, events: events || [] })
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white text-gray-900 p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-tight">Calendar AI</h3>
              <p className="text-gray-500 text-sm">Google Calendar assistant</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${
            isSynced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
            <span>{isSynced ? 'Synced' : 'Pending'}</span>
          </div>
        </div>
      </div>

      {/* Sync Status */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
        <span className="text-sm text-gray-600 truncate">{syncStatus}</span>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing' : 'Sync'}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-18rem)]">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl p-3 ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.isError
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="flex items-start gap-2">
                {message.type === 'bot' && (
                  <Bot className={`w-4 h-4 mt-1 flex-shrink-0 ${message.isError ? 'text-red-500' : 'text-gray-500'}`} />
                )}
                <div className="flex-1">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  {message.events?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.events.slice(0, 3).map((event) => (
                        <div
                          key={event.id || event.googleEventId}
                          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-gray-700"
                        >
                          <p className="text-sm font-medium text-gray-900">
                            {event.title || event.summary || 'Untitled event'}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatEventTime(event)}</span>
                          </div>
                          {event.location && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
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
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 space-y-2">
                        {(message.action.events || []).map((item, i) => (
                          <div key={i} className={`space-y-0.5 ${i > 0 ? 'pt-2 border-t border-gray-200' : ''}`}>
                            <div className="font-semibold text-gray-900">{item.parsed.title}</div>
                            <div className="text-gray-600">{new Date(item.startISO).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – {new Date(item.endISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                            {item.parsed.location && <div className="text-gray-500">📍 {item.parsed.location}</div>}
                            {item.parsed.description && <div className="text-gray-400 italic">{item.parsed.description}</div>}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => confirmCreateEvent(message.action.id)}
                          disabled={!pendingCreate || pendingCreate.id !== message.action.id || isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Calendar className="w-3 h-3" />
                          Create Event
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelCreateEvent(message.action.id)}
                          disabled={!pendingCreate || pendingCreate.id !== message.action.id || isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelDeleteEvents(message.action.id)}
                        disabled={!pendingDelete || pendingDelete.id !== message.action.id || isLoading}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  )}
                  <p className={`text-xs mt-1 opacity-70 ${message.type === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {formatTime(message.timestamp)}
                  </p>
                </div>
                {message.type === 'user' && (
                  <User className="w-4 h-4 mt-1 flex-shrink-0 text-blue-100" />
                )}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl p-3 max-w-[80%]">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-gray-500" />
                <div className="flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  <span className="text-sm text-gray-600">Searching your calendar...</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pt-3 border-t border-gray-200">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => submitPrompt(prompt)}
              disabled={!isSynced || isLoading}
              className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <form id="calendar-ai-chat-form" onSubmit={handleSubmit} className="p-4 pt-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isSynced ? "Ask about your calendar..." : "Syncing calendar data..."}
            className="min-w-0 flex-1 px-4 py-2.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading || !isSynced}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !isSynced}
            className="bg-blue-600 text-white p-2.5 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
          <Sparkles className="w-3 h-3" />
          <span>Answers use your synced calendar events.</span>
        </div>
      </form>
    </div>
  );
};

export default RealCalendarBot;
