import { OllamaService } from './ollamaService.js';
import { CloudLLMService } from './cloudLLM.js';
import { CalendarSyncService } from './calendarSync.js';
import { db } from '../db/connection.js';
import { calendarEvents } from '../db/schema.js';
import { eq, and, or, ilike, desc, asc, gte, lte } from 'drizzle-orm';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'about', 'at', 'be', 'by', 'calendar', 'can',
  'do', 'does', 'event', 'events', 'for', 'from', 'have', 'i', 'in', 'is',
  'it', 'me', 'meeting', 'meetings', 'my', 'of', 'on', 'or', 'schedule',
  'scheduled', 'show', 'tell', 'the', 'this', 'to', 'upcoming', 'was',
  'what', 'when', 'where', 'who', 'with', 'you', 'next', 'last', 'past',
  'previous', 'future', 'soon', 'today', 'tomorrow', 'week', 'month'
]);

const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

export class RAGService {
  constructor() {
    const hasCloudKey = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    this.llm = hasCloudKey ? new CloudLLMService() : new OllamaService();
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
    const heuristicIntent = this.buildHeuristicIntent(userMessage);
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

    try {
      const response = await this.llm.generate(prompt, { temperature: 0.1, max_tokens: 200 });
      // Extract JSON from response (Ollama sometimes adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const llmIntent = JSON.parse(jsonMatch[0]);
        return this.normalizeIntent({
          ...heuristicIntent,
          ...llmIntent,
          keywords: this.mergeKeywords(heuristicIntent.keywords, llmIntent.keywords)
        });
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('Error parsing intent:', error);
      return heuristicIntent;
    }
  }

  buildHeuristicIntent(userMessage) {
    const text = userMessage.toLowerCase();
    const createPattern = /\b(add|book|create|make|schedule|set up)\b/;
    const type = createPattern.test(text) ? 'CREATE_EVENT' : 'QUERY_EVENTS';
    const dateRange = this.extractDateRange(text);
    const keywords = this.extractKeywords(text);

    return this.normalizeIntent({
      type,
      keywords,
      timeframe: dateRange.timeframe,
      date_mentioned: dateRange.dateMentioned,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    });
  }

  normalizeIntent(intent) {
    const dateRange = intent.startDate && intent.endDate
      ? { startDate: intent.startDate, endDate: intent.endDate }
      : this.extractDateRange(`${intent.timeframe || ''} ${intent.date_mentioned || ''}`);

    return {
      type: intent.type === 'CREATE_EVENT' ? 'CREATE_EVENT' : 'QUERY_EVENTS',
      keywords: this.mergeKeywords(intent.keywords || []),
      timeframe: intent.timeframe || dateRange.timeframe || null,
      date_mentioned: intent.date_mentioned || dateRange.dateMentioned || null,
      startDate: dateRange.startDate || null,
      endDate: dateRange.endDate || null
    };
  }

  mergeKeywords(...keywordGroups) {
    const keywords = keywordGroups
      .flat()
      .filter(Boolean)
      .map(keyword => String(keyword).toLowerCase().trim())
      .filter(keyword => keyword.length > 2 && !STOP_WORDS.has(keyword));

    return [...new Set(keywords)].slice(0, 8);
  }

  extractKeywords(text) {
    const quotedTerms = [...text.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    const words = text
      .replace(/["']/g, '')
      .split(/[^a-z0-9@._-]+/i)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word))
      .filter(word => !/^\d{1,4}$/.test(word))
      .filter(word => !Object.prototype.hasOwnProperty.call(WEEKDAYS, word));

    return this.mergeKeywords(quotedTerms, words);
  }

  extractDateRange(text) {
    const now = new Date();
    const startOfDay = (date) => {
      const next = new Date(date);
      next.setHours(0, 0, 0, 0);
      return next;
    };
    const endOfDay = (date) => {
      const next = new Date(date);
      next.setHours(23, 59, 59, 999);
      return next;
    };
    const addDays = (date, days) => {
      const next = new Date(date);
      next.setDate(next.getDate() + days);
      return next;
    };
    const addMonths = (date, months) => {
      const next = new Date(date);
      next.setMonth(next.getMonth() + months);
      return next;
    };

    const isoDate = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoDate) {
      const date = new Date(`${isoDate[1]}T00:00:00`);
      return {
        timeframe: 'specific_date',
        dateMentioned: isoDate[1],
        startDate: startOfDay(date),
        endDate: endOfDay(date)
      };
    }

    if (/\btomorrow\b/.test(text)) {
      const date = addDays(now, 1);
      return {
        timeframe: 'specific_date',
        dateMentioned: date.toISOString().slice(0, 10),
        startDate: startOfDay(date),
        endDate: endOfDay(date)
      };
    }

    if (/\btoday\b/.test(text)) {
      return {
        timeframe: 'specific_date',
        dateMentioned: now.toISOString().slice(0, 10),
        startDate: startOfDay(now),
        endDate: endOfDay(now)
      };
    }

    if (/\b(this week|week)\b/.test(text)) {
      return {
        timeframe: 'future',
        startDate: now,
        endDate: endOfDay(addDays(now, 7))
      };
    }

    if (/\b(this month|month)\b/.test(text)) {
      return {
        timeframe: 'future',
        startDate: now,
        endDate: endOfDay(addMonths(now, 1))
      };
    }

    const weekday = Object.keys(WEEKDAYS).find(day => new RegExp(`\\b${day}\\b`).test(text));
    if (weekday) {
      const date = this.nextWeekday(now, WEEKDAYS[weekday], /\blast\b/.test(text));
      return {
        timeframe: 'specific_date',
        dateMentioned: date.toISOString().slice(0, 10),
        startDate: startOfDay(date),
        endDate: endOfDay(date)
      };
    }

    if (/\b(last|previous|past|ago)\b/.test(text)) {
      return { timeframe: 'past', startDate: null, endDate: now };
    }

    if (/\b(next|upcoming|future|soon)\b/.test(text)) {
      return { timeframe: 'future', startDate: now, endDate: null };
    }

    return { timeframe: null, startDate: null, endDate: null };
  }

  nextWeekday(fromDate, weekday, previous = false) {
    const date = new Date(fromDate);
    let diff = weekday - date.getDay();

    if (previous && diff >= 0) diff -= 7;
    if (!previous && diff <= 0) diff += 7;

    date.setDate(date.getDate() + diff);
    return date;
  }

  async handleQueryEvents(userId, userMessage, intent) {
    try {
      // Step 1: Retrieve relevant events from database
      const events = await this.searchEvents(userId, intent);
      
      // Step 2: Create context for RAG
      const context = this.formatEventsForContext(events);
      
      // Step 3: Generate response using RAG
      const response = await this.generateResponse(userMessage, context, events);
      
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

  async processEventsQuery(events, userMessage) {
    try {
      const intent = await this.parseIntent(userMessage);

      if (intent.type === 'CREATE_EVENT') {
        return {
          success: false,
          message: "Event creation is coming soon! For now, I can help you find and query your existing calendar events."
        };
      }

      const relevantEvents = this.searchInMemoryEvents(events, intent);
      const context = this.formatEventsForContext(relevantEvents);
      const response = await this.generateResponse(userMessage, context, relevantEvents);

      return {
        success: true,
        message: response,
        events: relevantEvents.slice(0, 5)
      };
    } catch (error) {
      console.error('Error processing in-memory events query:', error);
      return {
        success: false,
        message: 'Sorry, I encountered an error searching your synced calendar events.'
      };
    }
  }

  async searchEvents(userId, intent) {
    try {
      const baseConditions = [eq(calendarEvents.userId, userId)];
      let keywordCondition = null;

      if (intent.keywords && intent.keywords.length > 0) {
        const keywordFilters = intent.keywords.map(keyword => 
          or(
            ilike(calendarEvents.title, `%${keyword}%`),
            ilike(calendarEvents.description, `%${keyword}%`),
            ilike(calendarEvents.location, `%${keyword}%`)
          )
        );

        keywordCondition = or(...keywordFilters);
      }

      const now = new Date();
      if (intent.startDate) baseConditions.push(gte(calendarEvents.startDatetime, intent.startDate));
      if (intent.endDate) baseConditions.push(lte(calendarEvents.startDatetime, intent.endDate));
      if (!intent.startDate && intent.timeframe === 'future') baseConditions.push(gte(calendarEvents.startDatetime, now));
      if (!intent.endDate && intent.timeframe === 'past') baseConditions.push(lte(calendarEvents.startDatetime, now));

      const conditions = keywordCondition
        ? [...baseConditions, keywordCondition]
        : baseConditions;

      const orderDirection = intent.timeframe === 'future' || intent.startDate
        ? asc(calendarEvents.startDatetime)
        : desc(calendarEvents.startDatetime);

      const events = await db
        .select()
        .from(calendarEvents)
        .where(and(...conditions))
        .orderBy(orderDirection)
        .limit(40);

      if (events.length > 0 || !intent.keywords?.length) {
        return this.rankEvents(events, intent);
      }

      const fallbackEvents = await db
        .select()
        .from(calendarEvents)
        .where(and(...baseConditions))
        .orderBy(orderDirection)
        .limit(80);

      return this.rankEvents(fallbackEvents, intent).slice(0, 20);
    } catch (error) {
      console.error('Error searching events:', error);
      throw error;
    }
  }

  rankEvents(events, intent) {
    const keywords = intent.keywords || [];
    if (!keywords.length) return events.slice(0, 20);

    return events
      .map(event => {
        const searchable = [
          event.title,
          event.description,
          event.location,
          ...(event.attendees || [])
        ].filter(Boolean).join(' ').toLowerCase();

        const score = keywords.reduce((total, keyword) => {
          if (searchable.includes(keyword)) return total + 2;
          return total;
        }, 0);

        return { event, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(item => item.event)
      .slice(0, 20);
  }

  searchInMemoryEvents(events, intent) {
    if (!events || events.length === 0) return [];

    const startDate = intent.startDate ? new Date(intent.startDate) : null;
    const endDate = intent.endDate ? new Date(intent.endDate) : null;
    const now = new Date();
    const keywords = intent.keywords || [];

    const filtered = events.filter(event => {
      const eventDate = event.startDatetime ? new Date(event.startDatetime) : null;
      if (!eventDate || Number.isNaN(eventDate.getTime())) return false;

      if (startDate && eventDate < startDate) return false;
      if (endDate && eventDate > endDate) return false;
      if (!startDate && intent.timeframe === 'future' && eventDate < now) return false;
      if (!endDate && intent.timeframe === 'past' && eventDate > now) return false;

      if (keywords.length === 0) return true;

      const searchable = [
        event.title,
        event.description,
        event.location,
        ...(event.attendees || [])
      ].filter(Boolean).join(' ').toLowerCase();

      return keywords.some(keyword => searchable.includes(keyword));
    });

    const ordered = filtered.length > 0 || keywords.length === 0
      ? filtered
      : events.filter(event => {
          const eventDate = event.startDatetime ? new Date(event.startDatetime) : null;
          if (!eventDate || Number.isNaN(eventDate.getTime())) return false;
          if (startDate && eventDate < startDate) return false;
          if (endDate && eventDate > endDate) return false;
          return true;
        });

    const sortDirection = intent.timeframe === 'future' || intent.startDate ? 1 : -1;

    return this.rankEvents(
      [...ordered].sort((a, b) => {
        const aTime = a.startDatetime ? new Date(a.startDatetime).getTime() : 0;
        const bTime = b.startDatetime ? new Date(b.startDatetime).getTime() : 0;
        return (aTime - bTime) * sortDirection;
      }),
      intent
    );
  }

  formatEventsForContext(events) {
    if (!events || events.length === 0) {
      return "No relevant calendar events found.";
    }

    return events.map(event => {
      const startDate = event.startDatetime ? new Date(event.startDatetime) : null;
      const endDate = event.endDatetime ? new Date(event.endDatetime) : null;
      const dateStr = startDate ? startDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : 'Unknown date';
      const timeStr = startDate && !event.isAllDay ? startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      }) : 'all day';
      const endTimeStr = endDate && !event.isAllDay ? endDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      }) : null;
      const attendees = event.attendees?.length ? `; attendees: ${event.attendees.slice(0, 5).join(', ')}` : '';
      const description = event.description ? `; notes: ${String(event.description).slice(0, 220)}` : '';
      
      return `- ${event.title || 'Untitled event'} on ${dateStr} at ${timeStr}${endTimeStr ? `-${endTimeStr}` : ''}${event.location ? `; location: ${event.location}` : ''}${attendees}${description}`;
    }).join('\n');
  }

  async generateResponse(userMessage, context, events = []) {
    const prompt = `
You are a helpful calendar assistant. Answer the user's question based on their calendar events.

User question: "${userMessage}"

Calendar events context:
${context}

Rules:
- Answer only from the calendar context above.
- If the context says no relevant events were found, say that clearly and suggest syncing or rephrasing.
- Be specific about dates, times, locations, and attendees when available.
- Keep the answer concise and useful.
`;

    try {
      const response = await this.llm.generate(prompt, { temperature: 0.3, max_tokens: 350 });
      return response;
    } catch (error) {
      console.error('Error generating RAG response:', error);
      return this.buildFallbackResponse(events);
    }
  }

  buildFallbackResponse(events) {
    if (!events || events.length === 0) {
      return 'I could not find matching calendar events. Try syncing your calendar again or asking with a more specific event name, date, person, or location.';
    }

    const eventLines = events.slice(0, 3).map(event => {
      const startDate = event.startDatetime ? new Date(event.startDatetime) : null;
      const dateText = startDate ? startDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: event.isAllDay ? undefined : 'numeric',
        minute: event.isAllDay ? undefined : '2-digit'
      }) : 'time unavailable';

      return `${event.title || 'Untitled event'}: ${dateText}${event.location ? ` at ${event.location}` : ''}`;
    });

    return `I found ${events.length} matching event${events.length === 1 ? '' : 's'}:\n${eventLines.map(line => `- ${line}`).join('\n')}`;
  }

  async handleCreateEvent(userId, userMessage, intent) {
    // For now, return a message indicating this feature is coming soon
    return {
      success: false,
      message: "Event creation is coming soon! For now, I can help you find and query your existing calendar events."
    };
  }
}
