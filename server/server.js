import express from 'express';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import { specs } from './src/config/swagger.js';
import 'dotenv/config';

// Import routes
import authRoutes from './src/routes/auth.js';
import calendarRoutes from './src/routes/calendar.js';
import chatbotRoutes from './src/routes/chatbot.js';
import simpleChatRoutes from './src/routes/simpleChatbot.js';
import ragChatRoutes from './src/routes/ragChatbot.js';
import testRagRoutes from './src/routes/testRag.js';
import realCalendarRoutes from './src/routes/realCalendar.js';

// Import middleware
import { requireAuth } from './src/middleware/auth.js';

// Import services
import { CalendarSyncService } from './src/services/calendarSync.js';
import { setupOllama } from './src/utils/setupOllama.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - Configure helmet to be less restrictive for development
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// CORS configuration - must be before other middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Swagger, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001'
    ];
    
    console.log('🌐 CORS request from origin:', origin);
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Origin allowed:', origin);
      return callback(null, true);
    } else {
      console.log('❌ Origin blocked:', origin);
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Calendar AI API Documentation"
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/calendar', requireAuth, calendarRoutes);
app.use('/api/chatbot', requireAuth, chatbotRoutes);
app.use('/api/chat', simpleChatRoutes); // Simple chat without auth
app.use('/api/rag-chat', ragChatRoutes); // RAG chat with calendar data
app.use('/api/test-rag', testRagRoutes); // Demo RAG without auth
app.use('/api/real-calendar', realCalendarRoutes); // Real calendar data sync

// Test route for calendar sync (requires auth session)
app.post('/api/test-sync', requireAuth, async (req, res) => {
  try {
    const { CalendarSyncService } = await import('./src/services/calendarSync.js');
    const syncService = new CalendarSyncService();
    
    const userId = req.user.id;
    const accessToken = req.user.accessToken;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'No access token available' });
    }
    
    console.log(`🔄 Starting calendar sync for user ${userId}...`);
    const eventCount = await syncService.syncUserCalendar(userId, accessToken);
    
    res.json({ 
      success: true, 
      message: `Successfully synced ${eventCount} events to database`,
      eventCount 
    });
  } catch (error) {
    console.error('Sync test error:', error);
    res.status(500).json({ error: 'Failed to sync calendar data' });
  }
});

// Test route to check database without auth
app.get('/api/test-db', async (req, res) => {
  try {
    const { db } = await import('./src/db/connection.js');
    const { calendarEvents, users } = await import('./src/db/schema.js');
    
    const userCount = await db.select().from(users);
    const eventCount = await db.select().from(calendarEvents);
    
    res.json({
      users: userCount.length,
      events: eventCount.length,
      status: 'Database connected'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: API health check
 *     description: Check if the API server is running
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-07-03T10:30:00.000Z"
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Set up periodic calendar sync (every 30 minutes)
const calendarSync = new CalendarSyncService();

cron.schedule('*/30 * * * *', async () => {
  console.log('Running periodic calendar sync...');
  // This would need to be implemented to sync all users
  // For now, sync happens when user triggers it manually
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  
  // Setup Ollama
  await setupOllama();
});

export default app;