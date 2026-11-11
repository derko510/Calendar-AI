// The whole backend: one Express app that Vercel runs as a serverless function (vercel.json rewrites /api/* here).
// It is stateless: the browser loads events from Google itself and sends them with each message. The only
// sign-in state is an encrypted httpOnly cookie holding the Google refresh token (see server/src/routes/auth.js).
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import assistantRoutes from '../server/src/routes/assistant.js';
import authRoutes from '../server/src/routes/auth.js';
import { groqKeyFingerprint, llmProvider, activeModel } from '../server/src/services/llm.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

// The frontend is served from this same deployment, so same-origin requests always pass;
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
  callback(allowed ? null : new Error('Not allowed by CORS'), { origin: allowed, methods: ['GET', 'POST'], credentials: true, optionsSuccessStatus: 200 });
}));

// A few hundred calendar events fit comfortably in 2 MB
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/assistant', assistantRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    engine: process.env.ASSISTANT_ENGINE || 'agent',
    provider: llmProvider(),
    model: activeModel(),
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    groqKey: groqKeyFingerprint(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

// Local dev only: on Vercel this file is a serverless function and must not listen
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}

export default app;
