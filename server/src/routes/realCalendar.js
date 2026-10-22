import express from 'express';
import { generate } from '../services/llm.js';
import { db } from '../db/connection.js';
import { calendarEvents, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = express.Router();
const memoryCalendarStore = new Map();

function getMemoryKey(userInfoOrEmail) {
  if (typeof userInfoOrEmail === 'string') return userInfoOrEmail.toLowerCase();
  return (userInfoOrEmail?.email || userInfoOrEmail?.id || 'local-user').toLowerCase();
}

function normalizeFrontendEvent(event, userId = 0) {
  return {
    id: event.id,
    userId,
    googleEventId: event.id,
    title: event.summary || event.title || 'No Title',
    description: event.description || null,
    startDatetime: parseGoogleDateTime(event.start) || (event.startDatetime ? new Date(event.startDatetime) : null),
    endDatetime: parseGoogleDateTime(event.end) || (event.endDatetime ? new Date(event.endDatetime) : null),
    location: event.location || null,
    attendees: event.attendees?.map(a => a.email || a).filter(Boolean) || [],
    recurrence: Array.isArray(event.recurrence) ? event.recurrence.join(',') : event.recurrence || null,
    isAllDay: !!(event.start?.date || event.isAllDay)
  };
}

// Sync real calendar data from frontend (no Google auth needed on backend)
router.post('/sync-frontend-data', async (req, res) => {
  try {
    const { events, userInfo } = req.body;
    
    if (!events || !userInfo) {
      return res.status(400).json({ error: 'Events and user info are required' });
    }
    
    console.log(`🔄 Syncing ${events.length} events from frontend...`);
    console.log('📧 User info:', userInfo);
    const memoryKey = getMemoryKey(userInfo);
    const normalizedMemoryEvents = events.map(event => normalizeFrontendEvent(event));
    memoryCalendarStore.set(memoryKey, normalizedMemoryEvents);
    
    // Create or get user based on email
    console.log('🔍 Looking up user in database...');
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, userInfo.email))
      .limit(1);
    
    if (user.length === 0) {
      console.log('👤 Creating new user:', userInfo.email);
      const newUser = await db
        .insert(users)
        .values({
          googleId: userInfo.id || `frontend-${Date.now()}`,
          email: userInfo.email,
          name: userInfo.name || 'Unknown User'
        })
        .returning();
      user = newUser;
    }
    
    const userId = user[0].id;
    console.log(`📊 Using user ID: ${userId}`);
    
    // Clear existing events for this user
    console.log('🗑️ Clearing existing events for user...');
    await db
      .delete(calendarEvents)
      .where(eq(calendarEvents.userId, userId));
    
    // Insert new events
    console.log('📝 Preparing events for insertion...');
    const eventsToInsert = events.map((event, index) => {
      try {
        return {
          userId,
          googleEventId: event.id,
          title: event.summary || 'No Title',
          description: event.description || null,
          startDatetime: parseGoogleDateTime(event.start),
          endDatetime: parseGoogleDateTime(event.end),
          location: event.location || null,
          attendees: event.attendees?.map(a => a.email) || [],
          recurrence: event.recurrence?.join(',') || null,
          isAllDay: !!(event.start?.date) // All-day events have date instead of dateTime
        };
      } catch (parseError) {
        console.error(`❌ Error parsing event ${index}:`, parseError);
        console.error('❌ Event data:', event);
        throw parseError;
      }
    });
    
    console.log('💾 Inserting events into database...');
    if (eventsToInsert.length > 0) {
      await db.insert(calendarEvents).values(eventsToInsert);
    }
    
    console.log(`✅ Successfully synced ${eventsToInsert.length} events`);
    
    res.json({
      success: true,
      message: `Synced ${eventsToInsert.length} events to database`,
      userId,
      eventCount: eventsToInsert.length
    });
    
  } catch (error) {
    console.error('❌ Sync error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint,
      detail: error.detail
    });
    const { events, userInfo } = req.body;
    const memoryKey = getMemoryKey(userInfo);
    const normalizedMemoryEvents = (events || []).map(event => normalizeFrontendEvent(event));
    memoryCalendarStore.set(memoryKey, normalizedMemoryEvents);

    res.json({ 
      success: true,
      message: `Synced ${normalizedMemoryEvents.length} events in local memory because the database is unavailable`,
      eventCount: normalizedMemoryEvents.length,
      storage: 'memory',
      warning: error.message
    });
  }
});

// Chat with real calendar data
router.post('/chat', async (req, res) => {
  try {
    const { message, userEmail } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!userEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }
    
    console.log(`💬 Real calendar query from ${userEmail}: "${message}"`);
    
    // Import RAG service
    const { RAGService } = await import('../services/ragService.js');
    const ragService = new RAGService();

    try {
      // Get user by email
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, userEmail))
        .limit(1);
      
      if (user.length > 0) {
        const result = await ragService.processQuery(user[0].id, message);
        return res.json(result);
      }
    } catch (dbError) {
      console.warn('Database unavailable for chat, using in-memory calendar events:', dbError.message);
    }

    const memoryEvents = memoryCalendarStore.get(getMemoryKey(userEmail)) || [];
    if (memoryEvents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'I could not find synced calendar events. Sync your calendar and try again.'
      });
    }

    const result = await ragService.processEventsQuery(memoryEvents, message);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Real calendar chat error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sorry, I encountered an error processing your message.' 
    });
  }
});

// One AI call per chat message: decides whether the user wants to create events, delete events,
// or ask a question, and returns structured data for that intent. No keyword or regex parsing.
router.post('/interpret', async (req, res) => {
  try {
    const { message, events = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' });
    const timeZone = safeTimeZone(req.body.timeZone);
    const { today, year } = userToday(timeZone);

    const listed = events.filter(e => e.startDatetime || e.start?.dateTime || e.start?.date);
    const eventLines = listed
      .map((e, i) => {
        const start = new Date(e.startDatetime || e.start?.dateTime || e.start?.date);
        const t = start.toLocaleString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const loc = e.location ? ` | ${e.location}` : '';
        return `[${i}] ${e.summary || e.title || 'Untitled'} | ${t}${loc}`;
      })
      .join('\n');

    const prompt = `Today is ${today}. You are a calendar assistant. Read the user's message and decide what they want.

Calendar events (numbered):
${eventLines || '(none)'}

User message: ${message}

The message may contain typos and slang ("tomorow", "tmrw", "libary"). Interpret them the way a person would.

Respond with ONLY one JSON object in this shape:
{"intent":"create" | "delete" | "question",
 "events":[{"title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","description":"...","location":"..."}],
 "deleteIndexes":[0],
 "answer":"..."}

- intent "create": the user wants to add one or more events. Fill "events".
  title: short and clean, spelling fixed, without the date, time, place, or words like "create"/"schedule".
  location: the place with spelling fixed, or "". description: "" unless extra details were given.
  Resolve relative dates ("tomorrow", "next friday") from today. Use ${year} if no year is given.
  24h times (7 pm = 19:00). endTime = startTime + 1 hour unless stated.
- intent "delete": the user wants to remove events. Put the numbers of the matching events from the list in "deleteIndexes".
- intent "question": anything else. Put a concise answer in "answer" using only the events above.
  If asked about "class", "school", "lecture" or "course", look for academic events (course names, instructor names).
  If nothing matches, say so briefly.
Leave fields that don't apply to the intent empty.`;

    // Retry once only when the model answered with unusable JSON; provider errors (bad key, network) go straight to the catch below
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await generate(prompt, { temperature: 0, maxTokens: 800, json: true });
      try {
        const result = toInterpretation(JSON.parse(raw), listed);
        if (result) return res.json({ success: true, ...result });
        lastError = new Error(`Unusable LLM output: ${raw}`);
      } catch (err) {
        lastError = err;
      }
    }
    console.error('Interpret failed:', lastError);
    res.status(422).json({ success: false, message: 'I could not understand that. Try rephrasing.' });
  } catch (err) {
    console.error('Interpret endpoint error:', err);
    if (err.message === 'rate_limited') return res.status(429).json({ success: false, message: 'rate_limited' });
    // Surface the provider's reason (bad key, request too large, ...) so it shows up in the chat
    res.status(500).json({ success: false, message: `AI error: ${String(err.message).slice(0, 300)}` });
  }
});

// Check the LLM's JSON before the client acts on it; null means retry
function toInterpretation(output, listedEvents) {
  if (output?.intent === 'create') {
    const events = (Array.isArray(output.events) ? output.events : [])
      .filter(e => e?.title && isDateTime(e.date, e.startTime))
      .map(e => ({
        title: String(e.title).trim(),
        date: e.date,
        startTime: e.startTime,
        endTime: isDateTime(e.date, e.endTime) ? e.endTime : '',
        description: e.description || '',
        location: e.location || ''
      }));
    return events.length > 0 ? { intent: 'create', events } : null;
  }
  if (output?.intent === 'delete') {
    const ids = (Array.isArray(output.deleteIndexes) ? output.deleteIndexes : [])
      .map(i => listedEvents[i])
      .filter(Boolean)
      .map(e => e.id || e.googleEventId);
    return { intent: 'delete', eventIds: [...new Set(ids)] };
  }
  if (output?.intent === 'question' && output.answer) {
    return { intent: 'question', answer: String(output.answer).trim() };
  }
  return null;
}

function isDateTime(date, time) {
  return typeof date === 'string' && date.length === 10
    && typeof time === 'string' && time.length === 5
    && !Number.isNaN(new Date(`${date}T${time}:00`).getTime());
}

function safeTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// The server runs in UTC; resolve "today" in the user's own time zone so "tomorrow"/"Friday" land on the right day
function userToday(timeZone) {
  const tz = safeTimeZone(timeZone);
  const now = new Date();
  const date = now.toLocaleDateString('en-CA', { timeZone: tz });
  const weekday = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
  return { today: `${weekday}, ${date}`, year: date.slice(0, 4) };
}

function parseGoogleDateTime(dateTimeObj) {
  if (!dateTimeObj) return null;
  
  // All-day events have 'date' field, timed events have 'dateTime' field
  const dateString = dateTimeObj.dateTime || dateTimeObj.date;
  return dateString ? new Date(dateString) : null;
}

export default router;
