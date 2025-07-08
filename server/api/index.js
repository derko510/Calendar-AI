import express from 'express';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import { specs } from '../src/config/swagger.js';
import 'dotenv/config';

// Import routes
import authRoutes from '../src/routes/auth.js';
import calendarRoutes from '../src/routes/calendar.js';
import chatbotRoutes from '../src/routes/chatbot.js';
import simpleChatRoutes from '../src/routes/simpleChatbot.js';
import ragChatRoutes from '../src/routes/ragChatbot.js';
import testRagRoutes from '../src/routes/testRag.js';
import realCalendarRoutes from '../src/routes/realCalendar.js';

// Import middleware
import { requireAuth } from '../src/middleware/auth.js';
import { requireJWTAuth } from '../src/middleware/jwtAuth.js';
import { generateToken } from '../src/utils/jwt.js';

// Import services
import { CalendarSyncService } from '../src/services/calendarSync.js';
import { setupOllama } from '../src/utils/setupOllama.js';

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
      'http://127.0.0.1:3001',
      'https://derricks-calendar-ai.vercel.app',
      'https://client-git-dev-derricks-projects-0ffc821f.vercel.app'
    ];
    
    console.log('🌐 CORS request from origin:', origin);
    console.log('🔍 Allowed origins:', allowedOrigins);
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Origin allowed:', origin);
      return callback(null, true);
    } else {
      console.log('❌ Origin blocked:', origin);
      console.log('❌ Exact match check:', allowedOrigins.map(url => `"${url}" === "${origin}" ? ${url === origin}`));
      // For dev branch, be more permissive
      if (origin && (origin.includes('client-git-dev-derricks-projects') || origin.includes('derricks-projects-0ffc821f') || origin.includes('localhost'))) {
        console.log('🟡 Dev override: allowing origin');
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
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
    const { CalendarSyncService } = await import('../src/services/calendarSync.js');
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
    const { db } = await import('../src/db/connection.js');
    const { calendarEvents, users } = await import('../src/db/schema.js');
    
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
    deployTime: new Date().toISOString()
  };
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.2', // Updated for event creation feature
    env: envCheck
  });
});

// Test GET endpoint for auth
app.get('/api/auth/test-auth', (req, res) => {
  res.json({ message: 'Auth route works', timestamp: new Date().toISOString() });
});

// Handle OPTIONS preflight for sync endpoint
app.options('/api/real-calendar/sync-frontend-data', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

// Simple calendar sync test
app.post('/api/real-calendar/sync-frontend-data', async (req, res) => {
  // Set CORS headers first
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    const { events, userInfo } = req.body;
    
    if (!events || !userInfo) {
      return res.status(400).json({ error: 'Events and user info are required' });
    }
    
    console.log(`🔄 Syncing ${events.length} events from frontend...`);
    console.log('📧 User info:', userInfo);
    
    // Import database modules
    const { db } = await import('../src/db/connection.js');
    const { calendarEvents, users } = await import('../src/db/schema.js');
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

// Test CORS endpoint
app.all('/api/cors-test', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  res.json({
    success: true,
    message: 'CORS test successful',
    method: req.method,
    origin: req.headers.origin
  });
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