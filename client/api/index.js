// The whole backend: one Express app that Vercel runs as a serverless function (vercel.json rewrites /api/* here).
// It is stateless: the browser loads events from Google itself and sends them with each message. The only
// sign-in state is an encrypted httpOnly cookie holding the Google refresh token (see server/src/routes/auth.js).
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import assistantRoutes from '../server/src/routes/assistant.js';
import authRoutes from '../server/src/routes/auth.js';
import { groqKey, llmProvider, activeModel } from '../server/src/services/llm.js';
import { ownerEmails, publicAccess, demoChatEnabled } from '../server/src/auth/requireUser.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

// The frontend is served from this same deployment, so same-origin requests always pass.
// The defaults cover local dev and the production domain; ALLOWED_ORIGINS (comma-separated) replaces them
// (e.g. for a custom domain). Cross-origin requests from anywhere else get a 403.
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://derricks-calendar-ai.vercel.app'
];
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
const allowedOrigins = configuredOrigins.length ? configuredOrigins : defaultOrigins;

// "Origin: null" (sandboxed pages) and garbage values are not valid URLs, so they are simply not allowed
function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  if (isAllowedOrigin(req.headers.origin, req.headers.host)) return next();
  res.status(403).json({ error: 'origin_not_allowed' });
});
app.use(cors({ origin: true, methods: ['GET', 'POST'], credentials: true, optionsSuccessStatus: 200 }));

// A few hundred calendar events fit comfortably in 2 MB
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/assistant', assistantRoutes);

// Configuration booleans and labels only: never any part of a key or secret
app.get('/api/health', (req, res) => {
  const { GOOGLE_CLIENT_ID, VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET } = process.env;
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    engine: process.env.ASSISTANT_ENGINE || 'agent',
    provider: llmProvider(),
    model: activeModel(),
    hasGroqKey: Boolean(groqKey()),
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    authConfigured: Boolean((GOOGLE_CLIENT_ID || VITE_GOOGLE_CLIENT_ID) && GOOGLE_CLIENT_SECRET && (SESSION_SECRET || '').length >= 32),
    ownersConfigured: ownerEmails().length > 0,
    publicAccess: publicAccess(),
    demoChat: demoChatEnabled(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Body-parser errors carry a status (413 too large, 400 bad JSON); anything else is a 500 that never echoes internals
app.use((err, req, res, next) => {
  const status = Number(err.status || err.statusCode);
  if (status === 413) return res.status(413).json({ error: 'payload_too_large' });
  if (status === 400) return res.status(400).json({ error: 'bad_json' });
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

// Local dev only: on Vercel this file is a serverless function and must not listen
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}

export default app;
