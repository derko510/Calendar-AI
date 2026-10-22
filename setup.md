# Calendar AI Setup Guide

## 1. Install

```bash
npm install
cp .env.example .env
```

## 2. Fill in `.env`

One file for the app and the API (only `VITE_*` values reach the browser):

- `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: from Google Cloud Console → APIs & Services → Credentials
- `GROQ_API_KEY`: from [console.groq.com/keys](https://console.groq.com/keys)
- `SESSION_SECRET`, `JWT_SECRET`: each from `openssl rand -hex 32`
- `DATABASE_URL`: optional Postgres connection string

Then run `npm run check-env` to test the Groq key and database.

## 3. Start

```bash
# Terminal 1: API on http://localhost:3001
npm run dev:api

# Terminal 2: app on http://localhost:5173 (proxies /api to the API)
npm run dev
```

## 4. Test

1. Go to `http://localhost:5173` and sign in with Google
2. Ask the chat: "What events do I have this week?"
3. Or create one: "gym tomorrow at 6pm"

## Common issues

- **Chat shows an AI error**: run `npm run check-env`; it prints Groq's reason
- **Google auth failed**: check the Google OAuth values in `.env` and that `http://localhost:5173` is an authorized origin
- **Database errors**: check `DATABASE_URL`, then `npm run db:push`
