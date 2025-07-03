import express from 'express';
import { CalendarSyncService } from '../services/calendarSync.js';

const router = express.Router();
const calendarSync = new CalendarSyncService();

// POST /api/calendar/sync
router.post('/sync', async (req, res) => {
  try {
    const userId = req.user?.id;
    const accessToken = req.user?.accessToken;

    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const eventCount = await calendarSync.syncUserCalendar(userId, accessToken);
    
    res.json({ 
      success: true, 
      message: `Successfully synced ${eventCount} events`,
      eventCount 
    });
  } catch (error) {
    console.error('Error syncing calendar:', error);
    res.status(500).json({ error: 'Failed to sync calendar' });
  }
});

// GET /api/calendar/events
router.get('/events', async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { startDate, endDate, searchTerm, limit } = req.query;
    
    const events = await calendarSync.getUserEvents(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      searchTerm,
      limit: limit ? parseInt(limit) : undefined
    });
    
    res.json({ events });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

export default router;