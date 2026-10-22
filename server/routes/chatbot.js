import express from 'express';
import { RAGService } from '../services/ragService.js';

const router = express.Router();
const ragService = new RAGService();

// POST /api/chatbot/message
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user?.id; // Assuming user is attached to req from auth middleware

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await ragService.processQuery(userId, message);
    
    res.json(result);
  } catch (error) {
    console.error('Error in chatbot message endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;