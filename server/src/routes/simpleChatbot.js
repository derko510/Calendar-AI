import express from 'express';
import { SimpleChatService } from '../services/simpleChatService.js';

const router = express.Router();
const chatService = new SimpleChatService();

// Handle preflight requests
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

/**
 * @swagger
 * /api/chat/message:
 *   post:
 *     summary: Send a message to the chatbot
 *     description: Process a user message using the AI chatbot (no authentication required)
 *     tags: [Simple Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatMessage'
 *     responses:
 *       200:
 *         description: Successful response from chatbot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatResponse'
 *       400:
 *         description: Bad request - message is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Message is required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Sorry, I encountered an error processing your message."
 */
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('Received chat message:', message);
    
    const result = await chatService.processMessage(message);
    
    res.json(result);
  } catch (error) {
    console.error('Error in simple chat endpoint:', error);
    res.status(500).json({ 
      success: false,
      message: 'Sorry, I encountered an error processing your message.' 
    });
  }
});

/**
 * @swagger
 * /api/chat/health:
 *   get:
 *     summary: Check chatbot health status
 *     description: Check if Ollama is running and available
 *     tags: [Simple Chat]
 *     responses:
 *       200:
 *         description: Health status of the chatbot services
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       500:
 *         description: Health check failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Health check failed"
 */
router.get('/health', async (req, res) => {
  try {
    const health = await chatService.healthCheck();
    res.json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

export default router;