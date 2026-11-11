# Calendar AI Setup Guide

## 1. Install

```bash
cd client
npm install
cp .env.example .env
```

## 2. Fill in `client/.env`

- `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` (same value): the Client ID of a **Web application** OAuth client
  from Google Cloud Console → APIs & Services → Credentials. Add `http://localhost:5173` and `http://127.0.0.1:5173`
  as **authorized JavaScript origins**. No redirect URI is needed (the popup uses `postmessage`).
- `GOOGLE_CLIENT_SECRET`: the Client secret of that same OAuth client (server only)
- `SESSION_SECRET`: 32+ random characters that encrypt the sign-in cookie. Generate one:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- `GROQ_API_KEY` (free, default model `openai/gpt-oss-120b`) from [console.groq.com/keys](https://console.groq.com/keys) and/or `ANTHROPIC_API_KEY` (Claude Haiku 5.5). At least one is required.
- `OWNER_EMAILS`: your Google email(s). Owners get Claude (Groq as backup); every other signed-in account and the demo get Groq's free tier only, rate limited (`PUBLIC_CHAT_LIMIT`, default 20 per 10 minutes). `PUBLIC_ACCESS=false` = owners only.

Then run `npm run check-env` to test them.

Also enable the **Google Calendar API** for the project, and on the **OAuth consent screen** add the scopes
`openid`, `email`, `profile`, `calendar.events` and `calendar.readonly`.

### Staying signed in (read this)

You sign in once and stay signed in for months: the server keeps Google's refresh token in an encrypted httpOnly
cookie and hands the page a fresh 1-hour access token whenever it needs one.

But while the OAuth consent screen's publishing status is **Testing**, Google expires refresh tokens after **7 days**,
so you will be asked to sign in again every week. To stay signed in for months, open the consent screen (Google Auth
Platform → Audience) and click **Publish app** so the status is **In production**. You don't need Google's verification for
personal use: the consent screen will say "Google hasn't verified this app"; click **Advanced → Go to (app name)**.
Then sign out and back in once to get a long-lived refresh token.

## 3. Start

```bash
# Terminal 1: API on http://localhost:3001
npm run dev:api

# Terminal 2: app on http://localhost:5173 (proxies /api to the API)
npm run dev
```

## 4. Test

1. Go to `http://localhost:5173` and sign in with Google
2. Ask the chat: "What's next on my calendar?"
3. Or create one: "gym tomorrow at 6pm"

## 5. Checks

```bash
npm test          # unit tests, no network
npm run eval      # accuracy evals on the configured provider (needs GROQ_API_KEY or ANTHROPIC_API_KEY)
node evals/run.js --model claude-haiku-5-5   # or a Groq model id, e.g. --model openai/gpt-oss-120b
```

## Common issues

- **Chat shows an AI error**: run `npm run check-env`; it prints the provider's reason
- **Google sign-in failed**: check `VITE_GOOGLE_CLIENT_ID` and that `http://localhost:5173` is an authorized origin
- **"Sign-in is not set up on the server"**: set `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` (32+ chars) in `client/.env` and restart `npm run dev:api`
- **Signed out after a week**: the OAuth consent screen is still in Testing; publish it (see above)
