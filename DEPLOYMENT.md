# 🚀 Vercel Deployment Guide

The app and the API deploy as **one Vercel project** from the repo root:
the React build is served as static files and `api/index.js` (the Express app) runs as a
serverless function at `/api/*` on the same domain. No CORS setup or `VITE_API_URL` needed.

## Prerequisites

1. **Vercel**: [vercel.com](https://vercel.com)
2. **Groq** (free AI): API key from [console.groq.com/keys](https://console.groq.com/keys), starts with `gsk_`
3. **Neon** (optional, free Postgres): [neon.tech](https://neon.tech)

## Deploy

1. In Vercel, open the project (or import the repo) and leave **Settings → General → Root Directory** empty (the repo root).
2. Add the environment variables below under **Settings → Environment Variables**.
3. Deploy. Pushing to `main` redeploys automatically when the project is linked to GitHub.

| Variable | Needed for |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in in the browser |
| `GROQ_API_KEY` | the chat (required) |
| `GROQ_MODEL` | optional, defaults to `llama-3.1-8b-instant` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | server-side Google auth |
| `SESSION_SECRET`, `JWT_SECRET` | signing sessions and tokens (`openssl rand -hex 32`) |
| `DATABASE_URL` | optional; without it synced events are kept in memory |
| `NODE_ENV` | `production` |

Only `VITE_*` variables reach the browser; the rest stay on the server.

## Database (optional)

```bash
DATABASE_URL="your_neon_connection_string" npm run db:push
```

## Check your keys

```bash
npm run check-env
```

## Troubleshooting

1. **Chat shows an AI error**: the message includes Groq's reason (bad key, model not available, request too large).
2. **"missing /api/real-calendar/interpret"**: the deployment is out of date; redeploy.
3. **Database errors**: check the connection string, then run `npm run db:push`.

## Cost

Vercel, Neon and Groq free tiers: $0/month for the MVP.
