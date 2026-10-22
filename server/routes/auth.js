import express from 'express';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { optionalJWTAuth } from '../middleware/jwtAuth.js';

const router = express.Router();

// Google OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'https://derricks-calendar-ai.vercel.app/'
);

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth flow
 *     description: Redirects to Google OAuth consent screen
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
router.get('/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
  });
  
  res.redirect(authUrl);
});

// GET /api/auth/callback
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const googleUser = userInfo.data;

    // Upsert user in database
    let user = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleUser.id))
      .limit(1);

    if (user.length === 0) {
      // Create new user
      const newUser = await db
        .insert(users)
        .values({
          googleId: googleUser.id,
          email: googleUser.email,
          name: googleUser.name,
        })
        .returning();
      
      user = newUser;
    } else {
      // Update existing user
      await db
        .update(users)
        .set({
          email: googleUser.email,
          name: googleUser.name,
        })
        .where(eq(users.googleId, googleUser.id));
    }

    // Store user info in session
    req.session.user = {
      id: user[0].id,
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };

    // Redirect to frontend
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
  } catch (error) {
    console.error('Error in auth callback:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * @swagger
 * /api/auth/user:
 *   get:
 *     summary: Get current user
 *     description: Get the currently authenticated user
 *     tags: [Authentication]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 */
router.get('/user', optionalJWTAuth, (req, res) => {
  // Check JWT auth first, then fallback to session
  if (req.user) {
    // JWT authentication
    res.json({ user: req.user });
  } else if (req.session && req.session.user) {
    // Session authentication (backward compatibility)
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

/**
 * @swagger
 * /api/auth/google-token:
 *   post:
 *     summary: Authenticate with Google access token
 *     description: Exchange Google access token for server session
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleTokenRequest'
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Authentication failed
 */
// Simple test endpoint to verify backend is working
router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint hit');
  res.json({ 
    success: true, 
    message: 'Backend is working',
    timestamp: new Date().toISOString(),
    env: {
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL
    }
  });
});

router.post('/google-token', async (req, res) => {
  try {
    console.log('🔄 Received google-token request');
    console.log('📝 Request body keys:', Object.keys(req.body));
    console.log('📝 Access token present:', !!req.body.accessToken);
    
    const { accessToken, credential } = req.body;
    
    if (!accessToken) {
      console.error('❌ No access token provided');
      return res.status(400).json({ error: 'Access token is required' });
    }

    // Check if token format looks valid
    console.log('🔍 Access token length:', accessToken.length);
    console.log('🔍 Access token starts with:', accessToken.substring(0, 10));

    // Try to get user info directly using fetch instead of googleapis
    console.log('📡 Fetching user info from Google using direct API call...');
    const googleApiUrl = `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`;
    console.log('🌐 Making request to:', googleApiUrl.substring(0, 80) + '...');
    
    const response = await fetch(googleApiUrl);
    
    console.log('📊 Google API response status:', response.status);
    console.log('📊 Google API response ok:', response.ok);
    
    if (!response.ok) {
      console.error('❌ Google API response not ok:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      return res.status(401).json({ error: 'Invalid access token', details: errorText });
    }
    
    const googleUser = await response.json();
    console.log('👤 Google user:', { id: googleUser.id, email: googleUser.email, name: googleUser.name });

    if (!googleUser.id || !googleUser.email) {
      return res.status(400).json({ error: 'Invalid Google user data' });
    }

    // Upsert user in database
    console.log('💾 Checking database for user...');
    let user = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleUser.id))
      .limit(1);

    if (user.length === 0) {
      // Create new user
      const newUser = await db
        .insert(users)
        .values({
          googleId: googleUser.id,
          email: googleUser.email,
          name: googleUser.name,
        })
        .returning();
      
      user = newUser;
    } else {
      // Update existing user
      await db
        .update(users)
        .set({
          email: googleUser.email,
          name: googleUser.name,
        })
        .where(eq(users.googleId, googleUser.id));
    }

    // Store user info in session
    req.session.user = {
      id: user[0].id,
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      accessToken: accessToken,
    };

    res.json({ 
      success: true,
      user: {
        id: user[0].id,
        email: googleUser.email,
        name: googleUser.name
      }
    });
  } catch (error) {
    console.error('❌ Error in google-token endpoint:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

export default router;