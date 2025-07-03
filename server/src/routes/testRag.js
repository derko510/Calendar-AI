import express from 'express';
import { OllamaService } from '../services/ollamaService.js';
import { db } from '../db/connection.js';
import { calendarEvents, users } from '../db/schema.js';
import { eq, and, or, ilike, desc, asc, gte, lte } from 'drizzle-orm';

const router = express.Router();
const ollama = new OllamaService();

// Create a test user and some sample events for demo
router.post('/setup-demo', async (req, res) => {
  try {
    console.log('🔄 Setting up demo data...');
    
    // Create a test user
    const testUser = await db.insert(users).values({
      googleId: 'demo-user-123',
      email: 'demo@example.com',
      name: 'Demo User'
    }).returning();
    
    const userId = testUser[0].id;
    
    // Create some sample events
    const sampleEvents = [
      {
        userId,
        googleEventId: 'demo-1',
        title: 'Dentist Appointment',
        description: 'Annual checkup with Dr. Smith',
        startDatetime: new Date('2024-11-15T10:00:00'),
        endDatetime: new Date('2024-11-15T11:00:00'),
        location: 'Downtown Dental Clinic'
      },
      {
        userId,
        googleEventId: 'demo-2', 
        title: 'Team Meeting',
        description: 'Weekly standup with the development team',
        startDatetime: new Date('2025-01-03T09:00:00'),
        endDatetime: new Date('2025-01-03T10:00:00'),
        location: 'Conference Room A'
      },
      {
        userId,
        googleEventId: 'demo-3',
        title: 'Doctor Visit',
        description: 'Follow-up appointment with Dr. Johnson',
        startDatetime: new Date('2024-12-10T14:30:00'),
        endDatetime: new Date('2024-12-10T15:30:00'),
        location: 'Medical Center'
      },
      {
        userId,
        googleEventId: 'demo-4',
        title: 'Gym Workout',
        description: 'Leg day at the gym',
        startDatetime: new Date('2025-01-02T18:00:00'),
        endDatetime: new Date('2025-01-02T19:30:00'),
        location: 'FitLife Gym'
      }
    ];
    
    await db.insert(calendarEvents).values(sampleEvents);
    
    res.json({
      success: true,
      message: `Demo user created with ${sampleEvents.length} sample events`,
      userId
    });
    
  } catch (error) {
    console.error('Demo setup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test RAG chat without authentication
router.post('/chat', async (req, res) => {
  try {
    const { message, userId = 1 } = req.body; // Default to user ID 1 for demo
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log(`💬 Demo RAG query: "${message}"`);
    
    // Search for relevant events
    const events = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.userId, userId))
      .orderBy(desc(calendarEvents.startDatetime))
      .limit(20);
    
    console.log(`📅 Found ${events.length} events for user ${userId}`);
    
    // Create context from events
    const context = events.map(event => {
      const startDate = event.startDatetime ? new Date(event.startDatetime) : null;
      const dateStr = startDate ? startDate.toLocaleDateString() : 'Unknown date';
      const timeStr = startDate && !event.isAllDay ? startDate.toLocaleTimeString() : '';
      
      return `- ${event.title} on ${dateStr}${timeStr ? ' at ' + timeStr : ''}${event.location ? ' at ' + event.location : ''}`;
    }).join('\n');
    
    // Generate RAG prompt
    const prompt = `You are a helpful calendar assistant. Answer the user's question based on their calendar events.

User question: "${message}"

Calendar events:
${context || 'No events found'}

Provide a natural, helpful response. If the question is about specific events, reference them from the calendar data above.`;

    console.log('🤖 Sending prompt to Ollama...');
    const response = await ollama.generate(prompt, { temperature: 0.7 });
    
    res.json({
      success: true,
      message: response.trim(),
      events: events.slice(0, 5) // Return top 5 for reference
    });
    
  } catch (error) {
    console.error('Demo chat error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sorry, I encountered an error processing your message.' 
    });
  }
});

// Get demo events
router.get('/events', async (req, res) => {
  try {
    const { userId = 1 } = req.query;
    
    const events = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.userId, userId))
      .orderBy(desc(calendarEvents.startDatetime));
    
    res.json({ events, count: events.length });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;