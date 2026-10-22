import express from 'express';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import swaggerUi from 'swagger-ui-express';
import { specs } from '../server/config/swagger.js';
import 'dotenv/config';

// Import routes
import authRoutes from '../server/routes/auth.js';
import calendarRoutes from '../server/routes/calendar.js';
import chatbotRoutes from '../server/routes/chatbot.js';
import simpleChatRoutes from '../server/routes/simpleChatbot.js';
import ragChatRoutes from '../server/routes/ragChatbot.js';
import testRagRoutes from '../server/routes/testRag.js';
import realCalendarRoutes from '../server/routes/realCalendar.js';

// Import middleware
import { requireAuth } from '../server/middleware/auth.js';
import { requireJWTAuth } from '../server/middleware/jwtAuth.js';
import { generateToken } from '../server/utils/jwt.js';
import { groqKeyFingerprint, groqModel } from '../server/services/llm.js';

// Import services
import { CalendarSyncService } from '../server/services/calendarSync.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - Configure helmet to be less restrictive for development
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// CORS: the frontend is served from this same deployment, so same-origin requests always pass;
// the list covers local dev and the production domain
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://derricks-calendar-ai.vercel.app'
];
app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  const sameOrigin = origin && new URL(origin).host === req.headers.host;
  const allowed = !origin || sameOrigin || allowedOrigins.includes(origin);
  callback(allowed ? null : new Error('Not allowed by CORS'), {
    origin: allowed,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200
  });
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Allow cross-site cookies in production
  },
  name: 'calendar-ai-session', // Custom session name
}));

// Session debugging middleware
app.use((req, res, next) => {
  console.log('🔍 Session Debug:', {
    path: req.path,
    method: req.method,
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    cookies: req.headers.cookie ? 'present' : 'missing',
    origin: req.headers.origin
  });
  next();
});

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
    const { CalendarSyncService } = await import('../server/services/calendarSync.js');
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
    const { db } = await import('../server/db/connection.js');
    const { calendarEvents, users } = await import('../server/db/schema.js');
    
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
  const envCheck = {
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    groqKey: groqKeyFingerprint(),
    groqModel: groqModel(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
    deployTime: new Date().toISOString()
  };
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.1',
    env: envCheck
  });
});

// Test GET endpoint for auth
app.get('/api/auth/test-auth', (req, res) => {
  res.json({ message: 'Auth route works', timestamp: new Date().toISOString() });
});

// Simple calendar sync test
app.post('/api/real-calendar/sync-frontend-data', async (req, res) => {
  try {
    const { events, userInfo } = req.body;
    
    if (!events || !userInfo) {
      return res.status(400).json({ error: 'Events and user info are required' });
    }
    
    console.log(`🔄 Syncing ${events.length} events from frontend...`);
    console.log('📧 User info:', userInfo);
    
    // Import database modules
    const { db } = await import('../server/db/connection.js');
    const { calendarEvents, users } = await import('../server/db/schema.js');
    const { eq } = await import('drizzle-orm');
    
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
    
    // Process events in smaller batches to avoid constraint issues
    console.log('📝 Processing events in batches...');
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      try {
        const eventData = {
          userId,
          googleEventId: event.id,
          title: event.summary || 'No Title',
          description: event.description || null,
          startDatetime: parseGoogleDateTime(event.start),
          endDatetime: parseGoogleDateTime(event.end),
          location: event.location || null,
          attendees: event.attendees?.map(a => a.email) || [],
          recurrence: event.recurrence?.join(',') || null,
          isAllDay: !!(event.start?.date)
        };
        
        await db.insert(calendarEvents).values(eventData);
        successCount++;
      } catch (eventError) {
        console.error(`❌ Error inserting event ${i}:`, eventError);
        errorCount++;
      }
    }
    
    console.log(`✅ Successfully synced ${successCount} events, ${errorCount} errors`);
    
    res.json({
      success: true,
      message: `Synced ${successCount} events to database (${errorCount} errors)`,
      userId,
      eventCount: successCount,
      errorCount
    });
    
  } catch (error) {
    console.error('❌ Sync error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
});

function parseGoogleDateTime(dateTimeObj) {
  if (!dateTimeObj) return null;
  const dateString = dateTimeObj.dateTime || dateTimeObj.date;
  return dateString ? new Date(dateString) : null;
}

// Handle all auth requests
app.all('/api/auth/*', async (req, res) => {
  if (req.method === 'POST' && req.path === '/api/auth/google-token') {
    // Handle google-token POST request
    try {
      console.log('🔄 Received google-token request');
      const { accessToken } = req.body;
      
      if (!accessToken) {
        return res.status(400).json({ error: 'Access token is required' });
      }

      // Test Google API call
      const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(401).json({ error: 'Invalid access token', details: errorText });
      }
      
      const googleUser = await response.json();
      
      // Create JWT token instead of session
      const tokenPayload = {
        id: `google-${googleUser.id}`,
        googleId: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        accessToken: accessToken,
        iat: Math.floor(Date.now() / 1000)
      };

      const jwtToken = generateToken(tokenPayload);

      console.log('✅ JWT token created:', {
        userEmail: googleUser.email,
        tokenLength: jwtToken.length,
        userId: tokenPayload.id
      });

      // Also create session for backward compatibility
      req.session.user = tokenPayload;

      res.json({ 
        success: true,
        token: jwtToken,
        user: {
          email: googleUser.email,
          name: googleUser.name,
          id: tokenPayload.id
        }
      });
    } catch (error) {
      console.error('❌ Error in google-token endpoint:', error);
      res.status(500).json({ error: 'Authentication failed', details: error.message });
    }
  } else {
    res.status(404).json({ error: 'Auth endpoint not found' });
  }
});

// OLD: Temporary auth endpoint to bypass import issues
app.post('/api/auth/google-token-old', async (req, res) => {
  try {
    console.log('🔄 Received google-token request');
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    // Test Google API call
    const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(401).json({ error: 'Invalid access token', details: errorText });
    }
    
    const googleUser = await response.json();
    
    // Create a simple session (without database for now)
    req.session.user = {
      id: 'temp-user',
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      accessToken: accessToken,
    };

    res.json({ 
      success: true,
      user: {
        email: googleUser.email,
        name: googleUser.name
      }
    });
  } catch (error) {
    console.error('❌ Error in google-token endpoint:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

// Environment test endpoint
app.get('/api/env-test', (req, res) => {
  console.log('🧪 Environment test endpoint hit');
  res.json({ 
    success: true, 
    message: 'Backend environment check',
    timestamp: new Date().toISOString(),
    env: {
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasSessionSecret: !!process.env.SESSION_SECRET,
      nodeEnv: process.env.NODE_ENV
    }
  });
});

// Set up periodic calendar sync (every 30 minutes)
const calendarSync = new CalendarSyncService();

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Local dev only: on Vercel this file is a serverless function and must not listen
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}

export default app;