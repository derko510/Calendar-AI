import { OllamaService } from './ollamaService.js';
import { CloudLLMService } from './cloudLLM.js';
import { CalendarSyncService } from './calendarSync.js';
import { db } from '../db/connection.js';
import { calendarEvents } from '../db/schema.js';
import { eq, and, or, ilike, desc, asc, gte, lte } from 'drizzle-orm';

export class RAGService {
  constructor() {
    // Use cloud LLM in production, Ollama in development
    if (process.env.NODE_ENV === 'production') {
      this.llm = new CloudLLMService();
    } else {
      this.llm = new OllamaService();
    }
    this.calendarSync = new CalendarSyncService();
  }

  async processQuery(userId, userMessage) {
    try {
      // Step 1: Determine query intent
      const intent = await this.parseIntent(userMessage);
      
      if (intent.type === 'CREATE_EVENT') {
        return await this.handleCreateEvent(userId, userMessage, intent);
      } else if (intent.type === 'QUERY_EVENTS') {
        return await this.handleQueryEvents(userId, userMessage, intent);
      }
      
      return {
        success: false,
        message: "I couldn't understand your request. Please try asking about your calendar events or creating new ones."
      };
    } catch (error) {
      console.error('Error processing query:', error);
      return {
        success: false,
        message: "Sorry, I encountered an error processing your request."
      };
    }
  }

  async parseIntent(userMessage) {
    const prompt = `
Analyze this user message and determine the intent:

User message: "${userMessage}"

Respond with JSON in this format:
{
  "type": "CREATE_EVENT" or "QUERY_EVENTS",
  "keywords": ["array", "of", "relevant", "keywords"],
  "timeframe": "past" or "future" or "specific_date" or null,
  "date_mentioned": "YYYY-MM-DD" or null
}

Examples:
- "When was my last dentist appointment?" → {"type": "QUERY_EVENTS", "keywords": ["dentist"], "timeframe": "past"}
- "What meetings do I have tomorrow?" → {"type": "QUERY_EVENTS", "keywords": ["meeting"], "timeframe": "future"}
- "Schedule dinner with John at 7 PM Friday" → {"type": "CREATE_EVENT", "keywords": ["dinner", "John"]}
`;

    const response = await this.llm.generate(prompt, { temperature: 0.1 });

    try {
      // Extract JSON from response (Ollama sometimes adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('Error parsing intent:', error);
      return { type: 'QUERY_EVENTS', keywords: [], timeframe: null };
    }
  }

  async handleQueryEvents(userId, userMessage, intent) {
    try {
      // Step 1: Retrieve relevant events from database
      const events = await this.searchEvents(userId, intent);
      
      // Step 2: Create context for RAG
      const context = this.formatEventsForContext(events);
      
      // Step 3: Generate response using RAG
      const response = await this.generateResponse(userMessage, context);
      
      return {
        success: true,
        message: response,
        events: events.slice(0, 5) // Return top 5 events for reference
      };
    } catch (error) {
      console.error('Error handling query events:', error);
      throw error;
    }
  }

  async searchEvents(userId, intent) {
    try {
      let query = db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.userId, userId));

      // Apply keyword filters
      if (intent.keywords && intent.keywords.length > 0) {
        const keywordFilters = intent.keywords.map(keyword => 
          or(
            ilike(calendarEvents.title, `%${keyword}%`),
            ilike(calendarEvents.description, `%${keyword}%`),
            ilike(calendarEvents.location, `%${keyword}%`)
          )
        );
        
        query = query.where(
          and(
            eq(calendarEvents.userId, userId),
            or(...keywordFilters)
          )
        );
      }

      // Apply timeframe filters
      const now = new Date();
      if (intent.timeframe === 'past') {
        query = query.where(
          and(
            eq(calendarEvents.userId, userId),
            lte(calendarEvents.startDatetime, now)
          )
        ).orderBy(desc(calendarEvents.startDatetime));
      } else if (intent.timeframe === 'future') {
        query = query.where(
          and(
            eq(calendarEvents.userId, userId),
            gte(calendarEvents.startDatetime, now)
          )
        ).orderBy(asc(calendarEvents.startDatetime));
      } else {
        query = query.orderBy(desc(calendarEvents.startDatetime));
      }

      const events = await query.limit(20);
      return events;
    } catch (error) {
      console.error('Error searching events:', error);
      throw error;
    }
  }

  formatEventsForContext(events) {
    if (!events || events.length === 0) {
      return "No relevant calendar events found.";
    }

    return events.map(event => {
      const startDate = event.startDatetime ? new Date(event.startDatetime) : null;
      const dateStr = startDate ? startDate.toLocaleDateString() : 'Unknown date';
      const timeStr = startDate && !event.isAllDay ? startDate.toLocaleTimeString() : '';
      
      return `- ${event.title} on ${dateStr}${timeStr ? ' at ' + timeStr : ''}${event.location ? ' at ' + event.location : ''}`;
    }).join('\n');
  }

  async generateResponse(userMessage, context) {
    const prompt = `
You are a helpful calendar assistant. Answer the user's question based on their calendar events.

User question: "${userMessage}"

Calendar events context:
${context}

Provide a natural, conversational response. If no relevant events are found, let the user know politely.
Be specific about dates and times when possible.
`;

    const response = await this.llm.generate(prompt, { temperature: 0.7 });
    return response;
  }

  async handleCreateEvent(userId, userMessage, intent) {
    // For now, return a message indicating this feature is coming soon
    return {
      success: false,
      message: "Event creation is coming soon! For now, I can help you find and query your existing calendar events."
    };
  }
}