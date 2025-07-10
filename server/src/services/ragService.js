import { OllamaService } from './ollamaService.js';
import { CloudLLMService } from './cloudLLM.js';
import { CalendarSyncService } from './calendarSync.js';
import { db } from '../db/connection.js';
import { calendarEvents, users } from '../db/schema.js';
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

  async processQuery(userId, userMessage, conversationContext = {}) {
    try {
      // Step 1: Resolve contextual references in the message
      const resolvedMessage = await this.resolveContextualReferences(userMessage, conversationContext);
      
      // Step 2: Determine query intent
      const intent = await this.parseIntent(resolvedMessage);
      
      if (intent.type === 'CREATE_EVENT') {
        return await this.handleCreateEvent(userId, resolvedMessage, intent, conversationContext);
      } else if (intent.type === 'DELETE_EVENT') {
        return await this.handleDeleteEvent(userId, resolvedMessage, intent, conversationContext);
      } else if (intent.type === 'QUERY_EVENTS') {
        return await this.handleQueryEvents(userId, resolvedMessage, intent);
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

  async resolveContextualReferences(userMessage, conversationContext) {
    // Check if message contains contextual references that need resolution
    const contextualWords = ['that', 'it', 'the event', 'the meeting', 'that event', 'that meeting'];
    const hasContextualReference = contextualWords.some(word => 
      userMessage.toLowerCase().includes(word.toLowerCase())
    );

    if (!hasContextualReference || !conversationContext.recentEvents?.length) {
      return userMessage; // No context needed or available
    }

    const prompt = `
Resolve contextual references in this message using conversation context:

User message: "${userMessage}"

Recent conversation context:
${conversationContext.recentEvents?.map((event, index) => 
  `${index + 1}. Recently ${event.operation}d: "${event.title}" on ${event.date} at ${event.time || 'all day'}`
).join('\n') || 'No recent events'}

Last operation: ${conversationContext.lastOperation || 'None'}

Replace pronouns and references like "that event", "it", "that meeting" with specific event details.

Examples:
- "delete that event" → "delete [specific event title] on [date]"
- "cancel it" → "cancel [specific event title] on [date]"

Return the resolved message:`;

    try {
      const response = await this.llm.generate(prompt, { temperature: 0.1 });
      return response.trim() || userMessage; // Fallback to original if LLM fails
    } catch (error) {
      console.error('Error resolving contextual references:', error);
      return userMessage; // Fallback to original message
    }
  }

  async parseIntent(userMessage) {
    const prompt = `
Analyze this user message and determine the intent:

User message: "${userMessage}"

Respond with JSON in this format:
{
  "type": "CREATE_EVENT" or "DELETE_EVENT" or "QUERY_EVENTS",
  "keywords": ["array", "of", "relevant", "keywords"],
  "timeframe": "past" or "future" or "specific_date" or null,
  "date_mentioned": "YYYY-MM-DD" or null,
  "deleteAll": true or false // true if user wants to delete multiple/all matching events
}

DELETION INTENT EXAMPLES:
- "delete all events" → {"type": "DELETE_EVENT", "keywords": [], "deleteAll": true}
- "clear my calendar" → {"type": "DELETE_EVENT", "keywords": [], "deleteAll": true}
- "remove everything" → {"type": "DELETE_EVENT", "keywords": [], "deleteAll": true}
- "delete all focus time" → {"type": "DELETE_EVENT", "keywords": ["focus", "time"], "deleteAll": true}
- "remove all gym sessions" → {"type": "DELETE_EVENT", "keywords": ["gym"], "deleteAll": true}
- "cancel everything today" → {"type": "DELETE_EVENT", "keywords": [], "timeframe": "specific_date", "deleteAll": true}
- "delete all of them" → {"type": "DELETE_EVENT", "keywords": [], "deleteAll": true}
- "remove all my meetings" → {"type": "DELETE_EVENT", "keywords": ["meeting"], "deleteAll": true}
- "delete focus time" → {"type": "DELETE_EVENT", "keywords": ["focus", "time"], "deleteAll": true}
- "remove studying events" → {"type": "DELETE_EVENT", "keywords": ["studying"], "deleteAll": true}

OTHER EXAMPLES:
- "When was my last dentist appointment?" → {"type": "QUERY_EVENTS", "keywords": ["dentist"], "timeframe": "past"}
- "What meetings do I have tomorrow?" → {"type": "QUERY_EVENTS", "keywords": ["meeting"], "timeframe": "future"}
- "Schedule dinner with John at 7 PM Friday" → {"type": "CREATE_EVENT", "keywords": ["dinner", "John"]}

Key rules:
- Words like "all", "everything", "them" indicate deleteAll: true
- "delete all events" with no keywords means delete ALL calendar events
- Be aggressive about deletion intent - if user mentions removing/deleting something, assume they want ALL matching events
- Extract keywords loosely - "focus time" should match "🎯 Focus time", "studying", etc.
- Empty keywords array with deleteAll: true means delete ALL events
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

      // Apply keyword filters with expanded synonyms
      if (intent.keywords && intent.keywords.length > 0) {
        // Expand keywords with synonyms for better matching
        const expandedKeywords = [];
        for (const keyword of intent.keywords) {
          expandedKeywords.push(keyword);
          
          // Add synonyms for common terms
          const synonyms = {
            'focus': ['studying', 'study', 'learn', 'learning', '🎯'],
            'study': ['focus', 'studying', 'learn', 'learning', '🎯'],
            'studying': ['focus', 'study', 'learn', 'learning', '🎯'],
            'gym': ['workout', 'exercise', 'fitness', 'training'],
            'workout': ['gym', 'exercise', 'fitness', 'training'],
            'meeting': ['call', 'standup', 'sync', 'conference'],
            'call': ['meeting', 'standup', 'sync', 'conference']
          };
          
          if (synonyms[keyword.toLowerCase()]) {
            expandedKeywords.push(...synonyms[keyword.toLowerCase()]);
          }
        }
        
        const keywordFilters = expandedKeywords.map(keyword => 
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
      // If no keywords but deleteAll is true (e.g., "delete all events"), don't add keyword filters
      // This will return ALL events for the user

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

      const events = await query.limit(100); // Increased from 20 to allow bulk operations
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

  async handleCreateEvent(userId, userMessage, intent, conversationContext = {}) {
    try {
      // Step 1: Parse the natural language to extract event details
      const eventDetails = await this.parseEventDetails(userMessage);
      
      if (!eventDetails.success) {
        return {
          success: false,
          message: eventDetails.message || "I couldn't understand the event details. Please try again with more specific information."
        };
      }

      // Step 2: Create the event in Google Calendar
      const createdEvent = await this.createGoogleCalendarEvent(userId, eventDetails.data);
      
      if (!createdEvent.success) {
        return {
          success: false,
          message: createdEvent.message || "Failed to create the event in your calendar."
        };
      }

      // Step 3: Sync the new event to our database
      await this.syncNewEventToDatabase(userId, createdEvent.event);

      // Step 4: Update conversation context
      const eventContext = {
        operation: 'create',
        title: eventDetails.data.title,
        date: eventDetails.data.startDate,
        time: eventDetails.data.startTime,
        googleEventId: createdEvent.event.id,
        timestamp: new Date()
      };

      return {
        success: true,
        message: `✅ Created event "${eventDetails.data.title}" on ${eventDetails.data.startDate} at ${eventDetails.data.startTime}`,
        event: createdEvent.event,
        conversationUpdate: {
          recentEvents: [eventContext, ...(conversationContext.recentEvents || [])].slice(0, 5), // Keep last 5 events
          lastOperation: 'create'
        }
      };
    } catch (error) {
      console.error('Error creating event:', error);
      return {
        success: false,
        message: "Sorry, I encountered an error while creating your event. Please try again."
      };
    }
  }

  async handleDeleteEvent(userId, userMessage, intent, conversationContext = {}) {
    try {
      // Step 1: Find events matching the deletion criteria
      const matchingEvents = await this.findEventsToDelete(userId, userMessage, intent);
      
      if (!matchingEvents.success) {
        return matchingEvents;
      }

      if (matchingEvents.events.length === 0) {
        return {
          success: false,
          message: "I couldn't find any events matching your deletion request. Please be more specific."
        };
      }

      // Safety check: If deleting ALL events (no keywords), require confirmation
      if ((!intent.keywords || intent.keywords.length === 0) && intent.deleteAll && matchingEvents.events.length > 0) {
        // Check if user is confirming a previous "delete all" request
        const confirmationWords = ['yes', 'confirm', 'proceed', 'delete', 'ok', 'sure'];
        const denyWords = ['no', 'cancel', 'stop', 'abort', 'nevermind'];
        
        const isConfirming = confirmationWords.some(word => 
          userMessage.toLowerCase().includes(word.toLowerCase())
        );
        const isDenying = denyWords.some(word => 
          userMessage.toLowerCase().includes(word.toLowerCase())
        );

        // If user is denying, cancel the operation
        if (isDenying) {
          return {
            success: false,
            message: "Operation cancelled. Your calendar events are safe."
          };
        }

        // If not confirming, ask for confirmation
        if (!isConfirming) {
          return {
            success: false,
            message: `⚠️ You're about to delete ALL ${matchingEvents.events.length} events from your calendar. This cannot be undone.\n\nAre you sure you want to proceed? Reply with "yes" to confirm or "no" to cancel.`,
            requiresConfirmation: true,
            eventCount: matchingEvents.events.length
          };
        }
      }

      // Check if user wants to delete all matching events - be more aggressive now
      const deleteAllKeywords = ['delete all', 'remove all', 'cancel all', 'delete them all', 'remove them all', 'all of them', 'everything', 'clear'];
      const wantsToDeleteAll = deleteAllKeywords.some(keyword => 
        userMessage.toLowerCase().includes(keyword.toLowerCase())
      ) || intent.deleteAll === true; // Also check the intent flag

      // NEW: Be more aggressive - if multiple events and user mentioned deletion words, assume bulk deletion
      const aggressiveDeletionWords = ['delete', 'remove', 'cancel', 'clear'];
      const mentionsDeletion = aggressiveDeletionWords.some(word => 
        userMessage.toLowerCase().includes(word.toLowerCase())
      );

      // Only ask for clarification if we have many events AND user didn't clearly indicate bulk deletion
      if (matchingEvents.events.length > 10 && !wantsToDeleteAll && !mentionsDeletion) {
        return {
          success: false,
          message: `I found ${matchingEvents.events.length} events that match your request. Please be more specific about which event to delete, or say "delete all" to remove all matching events.`,
          events: matchingEvents.events.slice(0, 3) // Show first 3 matches
        };
      }

      // Step 2: Delete the event(s)
      const eventsToDelete = matchingEvents.events;
      const deleteResults = [];
      const deletedEvents = [];

      for (const eventToDelete of eventsToDelete) {
        const deleteResult = await this.deleteGoogleCalendarEvent(userId, eventToDelete);
        
        if (deleteResult.success) {
          // Remove from our database
          await this.removeEventFromDatabase(eventToDelete.id);
          deletedEvents.push(eventToDelete);
        }
        
        deleteResults.push({
          event: eventToDelete,
          success: deleteResult.success,
          message: deleteResult.message
        });
      }

      // Step 3: Update conversation context
      const eventContexts = deletedEvents.map(event => ({
        operation: 'delete',
        title: event.title,
        date: new Date(event.startDatetime).toLocaleDateString(),
        time: event.isAllDay ? 'all day' : new Date(event.startDatetime).toLocaleTimeString(),
        googleEventId: event.googleEventId,
        timestamp: new Date()
      }));

      // Generate appropriate success message
      let successMessage;
      if (deletedEvents.length === 1) {
        successMessage = `✅ Deleted event "${deletedEvents[0].title}" on ${new Date(deletedEvents[0].startDatetime).toLocaleDateString()}`;
      } else if (deletedEvents.length === eventsToDelete.length) {
        successMessage = `✅ Successfully deleted all ${deletedEvents.length} matching events`;
      } else {
        successMessage = `✅ Deleted ${deletedEvents.length} of ${eventsToDelete.length} events. Some events may have already been deleted.`;
      }

      return {
        success: true,
        message: successMessage,
        deletedEvents: deletedEvents,
        deleteResults: deleteResults,
        conversationUpdate: {
          recentEvents: [...eventContexts, ...(conversationContext.recentEvents || [])].slice(0, 5), // Keep last 5 events
          lastOperation: 'delete'
        }
      };
    } catch (error) {
      console.error('Error deleting event:', error);
      return {
        success: false,
        message: "Sorry, I encountered an error while deleting your event. Please try again."
      };
    }
  }

  async parseEventDetails(userMessage) {
    const prompt = `
Extract event details from this natural language request and respond with JSON:

User message: "${userMessage}"

Extract the following information:
- title: Event title/summary
- date: Date in YYYY-MM-DD format (if relative like "tomorrow", calculate the actual date)
- startTime: Start time in HH:MM format (24-hour)
- endTime: End time in HH:MM format (24-hour) - if not specified, add 1 hour to start time
- location: Location if mentioned
- description: Additional details
- isAllDay: true if it's an all-day event, false otherwise
- recurrence: RRULE string if it's recurring (e.g., "RRULE:FREQ=WEEKLY")

Current date for reference: ${new Date().toISOString().split('T')[0]}

Respond with JSON in this exact format:
{
  "title": "Event Title",
  "date": "2025-07-08",
  "startTime": "15:00",
  "endTime": "16:00",
  "location": null,
  "description": null,
  "isAllDay": false,
  "recurrence": null
}

If you cannot extract clear event details, respond with:
{
  "error": "Could not parse event details. Please specify title, date, and time."
}
`;

    try {
      const response = await this.llm.generate(prompt, { temperature: 0.1 });
      
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }
      
      const eventData = JSON.parse(jsonMatch[0]);
      
      if (eventData.error) {
        return {
          success: false,
          message: eventData.error
        };
      }

      // Validate required fields
      if (!eventData.title || !eventData.date || (!eventData.isAllDay && !eventData.startTime)) {
        return {
          success: false,
          message: "Please provide at least a title, date, and time for the event."
        };
      }

      return {
        success: true,
        data: {
          title: eventData.title,
          startDate: eventData.date,
          startTime: eventData.startTime,
          endTime: eventData.endTime,
          location: eventData.location,
          description: eventData.description,
          isAllDay: eventData.isAllDay,
          recurrence: eventData.recurrence
        }
      };
    } catch (error) {
      console.error('Error parsing event details:', error);
      return {
        success: false,
        message: "I had trouble understanding your event details. Please try again with a clear format like 'Schedule dinner with John at 7 PM tomorrow'."
      };
    }
  }

  async createGoogleCalendarEvent(userId, eventDetails) {
    try {
      // Get user's access token
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) {
        return { success: false, message: "User not found" };
      }

      const accessToken = user[0].accessToken;
      if (!accessToken) {
        return { success: false, message: "No Google access token available. Please re-authenticate." };
      }

      // Prepare event data for Google Calendar API
      const startDateTime = eventDetails.isAllDay 
        ? { date: eventDetails.startDate }
        : { 
            dateTime: `${eventDetails.startDate}T${eventDetails.startTime}:00`,
            timeZone: 'America/Los_Angeles' // TODO: Make this configurable
          };

      const endDateTime = eventDetails.isAllDay
        ? { date: eventDetails.startDate }
        : {
            dateTime: `${eventDetails.startDate}T${eventDetails.endTime}:00`,
            timeZone: 'America/Los_Angeles'
          };

      const googleEvent = {
        summary: eventDetails.title,
        start: startDateTime,
        end: endDateTime,
        description: eventDetails.description,
        location: eventDetails.location
      };

      if (eventDetails.recurrence) {
        googleEvent.recurrence = [eventDetails.recurrence];
      }

      // Call Google Calendar API
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(googleEvent)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Calendar API error:', errorText);
        return { success: false, message: "Failed to create event in Google Calendar" };
      }

      const createdEvent = await response.json();
      return { success: true, event: createdEvent };
    } catch (error) {
      console.error('Error creating Google Calendar event:', error);
      return { success: false, message: "Failed to create event in Google Calendar" };
    }
  }

  async syncNewEventToDatabase(userId, googleEvent) {
    try {
      const eventData = {
        userId,
        googleEventId: googleEvent.id,
        title: googleEvent.summary || 'No Title',
        description: googleEvent.description || null,
        startDatetime: this.parseDateTime(googleEvent.start),
        endDatetime: this.parseDateTime(googleEvent.end),
        location: googleEvent.location || null,
        attendees: googleEvent.attendees?.map(a => a.email) || [],
        recurrence: googleEvent.recurrence?.join(',') || null,
        isAllDay: !!(googleEvent.start?.date),
        updatedAt: new Date()
      };

      await db.insert(calendarEvents).values(eventData);
      console.log('✅ New event synced to database');
    } catch (error) {
      console.error('Error syncing new event to database:', error);
      // Don't throw error - event was created successfully in Google Calendar
    }
  }

  parseDateTime(dateTimeObj) {
    if (!dateTimeObj) return null;
    const dateString = dateTimeObj.dateTime || dateTimeObj.date;
    return dateString ? new Date(dateString) : null;
  }

  async findEventsToDelete(userId, userMessage, intent) {
    try {
      // Use existing search functionality but with stricter matching
      const potentialEvents = await this.searchEvents(userId, intent);
      
      if (potentialEvents.length === 0) {
        return {
          success: true,
          events: []
        };
      }

      // Use LLM to find the best matching event for deletion
      const eventList = potentialEvents.map((event, index) => {
        const startDate = event.startDatetime ? new Date(event.startDatetime) : null;
        const dateStr = startDate ? startDate.toLocaleDateString() : 'Unknown date';
        const timeStr = startDate && !event.isAllDay ? startDate.toLocaleTimeString() : '';
        
        return `${index + 1}. "${event.title}" on ${dateStr}${timeStr ? ' at ' + timeStr : ''}${event.location ? ' at ' + event.location : ''}`;
      }).join('\n');

      const prompt = `
User wants to delete events with this request: "${userMessage}"

Available events:
${eventList}

Which event(s) should be deleted? Respond with JSON:
{
  "eventNumbers": [1, 2, 3], // Array of event numbers that match the deletion request
  "confidence": "high" or "medium" or "low" // How confident you are in the match
}

AGGRESSIVE MATCHING RULES:
- "delete all focus time" → Match ALL events containing "focus", "Focus", "🎯", or "studying" 
- "remove gym" → Match ALL events containing "gym", "Gym", "workout", "exercise"
- "cancel meetings" → Match ALL events containing "meeting", "Meeting", "call", "standup"
- "delete studying" → Match ALL events containing "studying", "study", "focus", "🎯"
- "clear my calendar" → Match ALL events
- "delete all of them" → Match ALL events from previous context

PATTERN MATCHING:
- Ignore emojis when matching (🎯 Focus time matches "focus time")
- Match partial words ("focus" matches "Focus time", "focusing", etc.)
- Match synonyms (studying = focus = learning)
- Be case insensitive
- If user mentions any deletion word, assume they want ALL matching events unless they specify "one" or "the"

EXAMPLES:
- User: "delete all focus time" → Return ALL events with focus/studying/🎯 in title
- User: "remove gym sessions" → Return ALL events with gym/workout in title  
- User: "cancel everything" → Return ALL events
- User: "delete focus time" (no "all") → STILL return ALL matching events (be aggressive)

BE AGGRESSIVE: When in doubt about quantity, return ALL matching events rather than asking for clarification.
`;

      const response = await this.llm.generate(prompt, { temperature: 0.1 });
      
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in LLM response for event deletion');
        return {
          success: true,
          events: [] // Fallback to no matches found
        };
      }
      
      let matchResult;
      try {
        matchResult = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('Error parsing JSON from LLM response for event deletion:', parseError);
        return {
          success: true,
          events: [] // Fallback to no matches found
        };
      }
      
      if (!matchResult.eventNumbers || matchResult.eventNumbers.length === 0) {
        return {
          success: true,
          events: []
        };
      }

      // Return matching events
      const matchedEvents = matchResult.eventNumbers
        .filter(num => num >= 1 && num <= potentialEvents.length)
        .map(num => potentialEvents[num - 1]);

      return {
        success: true,
        events: matchedEvents,
        confidence: matchResult.confidence
      };
    } catch (error) {
      console.error('Error finding events to delete:', error);
      return {
        success: false,
        message: "I had trouble searching for events to delete. Please try again."
      };
    }
  }

  async deleteGoogleCalendarEvent(userId, event) {
    try {
      // Get user's access token
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) {
        return { success: false, message: "User not found" };
      }

      const accessToken = user[0].accessToken;
      if (!accessToken) {
        return { success: false, message: "No Google access token available. Please re-authenticate." };
      }

      // Call Google Calendar API to delete the event
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.googleEventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Event already deleted or doesn't exist
          console.log('Event not found in Google Calendar, proceeding with local deletion');
          return { success: true };
        }
        
        const errorText = await response.text();
        console.error('Google Calendar API delete error:', errorText);
        return { success: false, message: "Failed to delete event from Google Calendar" };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting Google Calendar event:', error);
      return { success: false, message: "Failed to delete event from Google Calendar" };
    }
  }

  async removeEventFromDatabase(eventId) {
    try {
      await db.delete(calendarEvents).where(eq(calendarEvents.id, eventId));
      console.log('✅ Event removed from database');
    } catch (error) {
      console.error('Error removing event from database:', error);
      // Don't throw error - event was deleted from Google Calendar successfully
    }
  }
}