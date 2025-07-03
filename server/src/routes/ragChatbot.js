import express from 'express';
import { RAGService } from '../services/ragService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const ragService = new RAGService();

/**
 * @swagger
 * /api/rag-chat/message:
 *   post:
 *     summary: Send a message to the RAG-enabled chatbot
 *     description: Process a user message using calendar data from database
 *     tags: [RAG Chat]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatMessage'
 *     responses:
 *       200:
 *         description: Successful response from RAG chatbot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatResponse'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
router.post('/message', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user?.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`💬 RAG Chat request from user ${userId}: "${message}"`);
    
    const result = await ragService.processQuery(userId, message);
    
    res.json(result);
  } catch (error) {
    console.error('Error in RAG chat endpoint:', error);
    res.status(500).json({ 
      success: false,
      message: 'Sorry, I encountered an error processing your message.' 
    });
  }
});

/**
 * @swagger
 * /api/rag-chat/sync:
 *   post:
 *     summary: Sync calendar data to database
 *     description: Manually trigger sync of Google Calendar events to database
 *     tags: [RAG Chat]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Sync completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Sync failed
 */
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const { CalendarSyncService } = await import('../services/calendarSync.js');
    const syncService = new CalendarSyncService();
    
    const userId = req.user.id;
    const accessToken = req.user.accessToken;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'No access token available' });
    }
    
    console.log(`🔄 Syncing calendar for user ${userId}...`);
    const eventCount = await syncService.syncUserCalendar(userId, accessToken);
    
    res.json({ 
      success: true, 
      message: `Successfully synced ${eventCount} events`,
      eventCount 
    });
  } catch (error) {
    console.error('Calendar sync error:', error);
    res.status(500).json({ error: 'Failed to sync calendar data' });
  }
});

export default router;