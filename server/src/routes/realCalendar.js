import express from 'express';
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

// Smart Q&A: frontend sends events + question, backend answers with Ollama
router.post('/ask', async (req, res) => {
  try {
    const { message, events = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

    const { OllamaService } = await import('../services/ollamaService.js');
    const ollama = new OllamaService();

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const eventLines = events
      .filter(e => e.startDatetime || e.start?.dateTime || e.start?.date)
      .map(e => {
        const start = new Date(e.startDatetime || e.start?.dateTime || e.start?.date);
        const t = start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const loc = e.location ? ` | ${e.location}` : '';
        return `- ${e.summary || e.title || 'Untitled'} | ${t}${loc}`;
      })
      .join('\n');

    const prompt = `Today is ${today}. You are a smart calendar assistant. Answer the user's question based on their calendar events below.
If asking about "class", "school", "lecture", or "course" look for academic events (course names, instructor names).
Be concise. If no matching event exists, say so briefly.

Calendar events:
${eventLines}

Question: ${message}
Answer:`;

    const answer = await ollama.generate(prompt, { temperature: 0.3, num_predict: 300 });
    res.json({ success: true, message: answer.trim() });
  } catch (err) {
    console.error('Ask endpoint error:', err);
    res.status(500).json({ success: false, message: 'Could not reach the local AI. Make sure Ollama is running.' });
  }
});

// Parse MULTIPLE event creation requests into a JSON array using Ollama
router.post('/parse-events', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false });

    const { OllamaService } = await import('../services/ollamaService.js');
    const ollama = new OllamaService();

    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();

    const prompt = `Today is ${today}. Extract ALL calendar events mentioned in this message. Respond with ONLY a JSON array, no explanation.

Message: ${message}

Output format: [{"title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","description":"...","location":"..."}]

Rules: use ${year} if year not given, 24h time (2pm=14:00), endTime MUST be startTime+1hr if not explicitly stated (never leave endTime empty), empty string for description/location if not given.

JSON array:`;

    const raw = await ollama.generate(prompt, { temperature: 0.0, num_predict: 500 });
    const jsonMatch = raw.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return res.status(422).json({ success: false, message: 'Could not parse events.' });

    const parsed = JSON.parse(jsonMatch[0]);
    const valid = parsed.filter(e => e.title && e.date && e.startTime);
    if (valid.length === 0) return res.status(422).json({ success: false, message: 'No valid events found.' });

    res.json({ success: true, events: valid });
  } catch (err) {
    console.error('Parse events error:', err);
    res.status(500).json({ success: false, message: 'Could not parse events.' });
  }
});

// Parse event creation request into structured JSON using Ollama
router.post('/parse-event', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false });

    const { OllamaService } = await import('../services/ollamaService.js');
    const ollama = new OllamaService();

    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();

    const prompt = `Today is ${today}. Extract ONE calendar event from this message. Respond with ONLY a JSON object, no explanation.

Message: ${message}

JSON structure: {"title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","description":"...","location":"..."}

Rules: use ${year} if year not given, 24h time, endTime MUST be startTime+1hr if not explicitly stated (never leave endTime empty), empty string for description/location if not given.

JSON:`;

    const raw = await ollama.generate(prompt, { temperature: 0.0, num_predict: 150 });
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return res.status(422).json({ success: false, message: 'Could not parse event from that message.' });

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.title || !parsed.date || !parsed.startTime) {
      return res.status(422).json({ success: false, message: 'Missing event details.' });
    }
    res.json({ success: true, event: parsed });
  } catch (err) {
    console.error('Parse event error:', err);
    res.status(500).json({ success: false, message: 'Could not parse event. Try: "Create dentist on June 3 at 2pm".' });
  }
});

function parseGoogleDateTime(dateTimeObj) {
  if (!dateTimeObj) return null;
  
  // All-day events have 'date' field, timed events have 'dateTime' field
  const dateString = dateTimeObj.dateTime || dateTimeObj.date;
  return dateString ? new Date(dateString) : null;
}

export default router;
