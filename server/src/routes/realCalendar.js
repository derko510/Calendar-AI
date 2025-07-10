import express from 'express';
import { track } from '@vercel/analytics/server';
import { db } from '../db/connection.js';
import { calendarEvents, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = express.Router();

// NOTE: /sync-frontend-data is handled directly in api/index.js for serverless deployment
// This route is disabled to avoid conflicts

// Handle preflight OPTIONS requests
// router.options('/sync-frontend-data', (req, res) => {
//   res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
//   res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   res.status(200).end();
// });

// Sync real calendar data from frontend (no Google auth needed on backend)
// DISABLED: This route is handled directly in api/index.js for serverless deployment
/*
router.post('/sync-frontend-data', async (req, res) => {
  // Ensure CORS headers are set even on errors
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    const { events, userInfo } = req.body;
    
    if (!events || !userInfo) {
      return res.status(400).json({ error: 'Events and user info are required' });
    }
    
    console.log(`🔄 Syncing ${events.length} events from frontend...`);
    console.log('📧 User info:', userInfo);
    
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
    res.status(500).json({ 
      error: error.message,
      details: error.code || 'Unknown error'
    });
  }
});
*/

// Chat with real calendar data
router.post('/chat', async (req, res) => {
  try {
    const { message, userEmail, accessToken, conversationContext } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!userEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }
    
    // Track chat interaction
    track('calendar_chat', {
      userEmail: userEmail,
      messageLength: message.length,
      hasAccessToken: !!accessToken,
      hasContext: !!conversationContext
    });
    
    // Get user by email
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1);
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found. Please sync your calendar first.' });
    }
    
    // Update user's access token if provided
    if (accessToken && user[0].accessToken !== accessToken) {
      await db
        .update(users)
        .set({ accessToken: accessToken })
        .where(eq(users.id, user[0].id));
    }
    
    const userId = user[0].id;
    
    console.log(`💬 Real calendar query from ${userEmail}: "${message}"`);
    
    // Import RAG service
    const { RAGService } = await import('../services/ragService.js');
    const ragService = new RAGService();
    
    // Use the existing RAG service with conversation context
    const result = await ragService.processQuery(userId, message, conversationContext || {});
    
    // The RAG service returns a structured response, so send it directly
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