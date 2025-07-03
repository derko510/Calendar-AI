import express from 'express';
import { db } from '../db/connection.js';
import { calendarEvents, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = express.Router();

// Sync real calendar data from frontend (no Google auth needed on backend)
router.post('/sync-frontend-data', async (req, res) => {
  try {
    const { events, userInfo } = req.body;
    
    if (!events || !userInfo) {
      return res.status(400).json({ error: 'Events and user info are required' });
    }
    
    console.log(`🔄 Syncing ${events.length} events from frontend...`);
    
    // Create or get user based on email
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
    await db
      .delete(calendarEvents)
      .where(eq(calendarEvents.userId, userId));
    
    // Insert new events
    const eventsToInsert = events.map(event => ({
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
    }));
    
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
    res.status(500).json({ error: error.message });
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
    
    // Get user by email
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1);
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found. Please sync your calendar first.' });
    }
    
    const userId = user[0].id;
    
    console.log(`💬 Real calendar query from ${userEmail}: "${message}"`);
    
    // Import RAG service
    const { RAGService } = await import('../services/ragService.js');
    const ragService = new RAGService();
    
    // Use the existing RAG service
    const result = await ragService.processQuery(userId, message);
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Real calendar chat error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sorry, I encountered an error processing your message.' 
    });
  }
});

function parseGoogleDateTime(dateTimeObj) {
  if (!dateTimeObj) return null;
  
  // All-day events have 'date' field, timed events have 'dateTime' field
  const dateString = dateTimeObj.dateTime || dateTimeObj.date;
  return dateString ? new Date(dateString) : null;
}

export default router;