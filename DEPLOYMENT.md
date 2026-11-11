# Vercel Deployment Guide

The app and the API deploy as **one Vercel project** from the `client/` folder:
the React build is served as static files and `client/api/index.js` (the Express app) runs as a
serverless function at `/api/*` on the same domain. Same-origin requests need no CORS setup and no `VITE_API_URL`;
`ALLOWED_ORIGINS` is only needed if you serve the app from a custom domain (see the table).

The API is stateless (no database): the browser loads events from Google and sends them with each chat message.
The only sign-in state is one encrypted, httpOnly cookie that holds your Google refresh token, so you stay signed in
for months (see [Staying signed in](#staying-signed-in)).

## Prerequisites

1. **Vercel**: [vercel.com](https://vercel.com)
2. **Groq** (free AI): API key from [console.groq.com/keys](https://console.groq.com/keys), starts with `gsk_`
3. **Google OAuth client** (Google Cloud Console → APIs & Services → Credentials): its client ID *and* client secret.
   See [Google Cloud Console setup](#google-cloud-console-setup).

## Deploy

1. In Vercel, open the project (or import the repo) and set **Settings → General → Root Directory** to `client`.
2. Add the environment variables below under **Settings → Environment Variables**.
3. Deploy. Pushing to `main` redeploys automatically when the project is linked to GitHub.

| Variable | Needed for |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in in the browser |
| `GOOGLE_CLIENT_ID` | the server's half of sign-in; same value as `VITE_GOOGLE_CLIENT_ID` (falls back to it if unset) |
| `GOOGLE_CLIENT_SECRET` | swapping Google's sign-in code for a refresh token (server only, never `VITE_`) |
| `SESSION_SECRET` | encrypting the sign-in cookie: 32+ random characters. Changing it signs everyone out |
| `GROQ_API_KEY` | free-tier AI for everyone who is not an owner (and the demo), and the backup for owners |
| `GROQ_MODEL` | optional, defaults to `openai/gpt-oss-120b` |
| `LLM_PROVIDER` | optional: `groq` or `anthropic` forces one provider. Unset = owners on Claude with Groq backup, everyone else on Groq |
| `ASSISTANT_ENGINE` | optional: `agent` (default), `prompt-v1` or `prompt-v0` |
| `ANTHROPIC_API_KEY` | backup AI: used only when Groq is rate limited or failing (or alone if Groq isn't set). Always `claude-haiku-5-5` (set in code, not configurable) |
| `ANTHROPIC_WORKSPACE_ID` | optional: only if the Anthropic key is not created inside a workspace |
| `ANTHROPIC_EFFORT` | optional: how much Claude thinks per step, default `low` (cheapest) |
| `OWNER_EMAILS` | recommended: your Google email(s), comma-separated. Owners get Claude Haiku 5.5 as the primary model with Groq as backup. (`ALLOWED_EMAILS` is the old name and is still read) |
| `PUBLIC_ACCESS` | optional: `false` = owners only (other accounts cannot sign in and the demo chat is off). Default: anyone can sign in and chat on Groq's free tier |
| `DEMO_CHAT_ENABLED` | optional: `false` turns off just the demo chat (`/?demo`). On by default; the demo uses Groq only |
| `PUBLIC_CHAT_LIMIT` | optional: messages per visitor per 10 minutes for non-owners and the demo, default 20 (in memory per server instance, so best effort) |
| `ALLOWED_ORIGINS` | optional: comma-separated origins allowed to call the API cross-origin, e.g. `https://calendar.example.com`. Replaces the built-in list (localhost:5173, 127.0.0.1:5173, the `vercel.app` domain). Same-origin requests always pass; any other origin gets a 403 |

**Access tiers.** The chat route (`/api/assistant/message`) has two tiers. *Owners* (signed in with an email in `OWNER_EMAILS`) get Claude Haiku 5.5 first, with Groq as backup. *Public* users (any other signed-in Google account, and the no-login demo) get Groq's free tier only (`openai/gpt-oss-120b`, then `openai/gpt-oss-20b`), can never trigger a Claude call, and are rate limited per visitor.

Only `VITE_*` variables reach the browser; the rest stay on the server.

Generate a `SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Google Cloud Console setup

1. **APIs & Services → Library**: enable the **Google Calendar API**.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding / Audience / Data access):
   - User type **External**, app name and your email.
   - Scopes: `openid`, `email`, `profile`, `.../auth/calendar.events`, `.../auth/calendar.readonly`.
   - **Publishing status: set it to "In production"** (Audience → Publish app). Read the next section for why.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**:
   - **Authorized JavaScript origins**: `http://localhost:5173`, `http://127.0.0.1:5173` and your production URL
     (e.g. `https://derricks-calendar-ai.vercel.app`, plus any custom domain).
   - **Authorized redirect URIs**: none needed. The sign-in popup returns the code to the page (`redirect_uri=postmessage`).
   - Copy the **Client ID** into `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`, and the **Client secret** into `GOOGLE_CLIENT_SECRET`.

## Staying signed in

Sign-in uses Google's authorization-code flow. The first time, Google shows the full consent screen and returns a
**refresh token**; the server stores it in an AES-256-GCM encrypted cookie (`httpOnly`, `Secure`, `SameSite=Lax`,
scoped to `/api`, 180 days and renewed each visit). The page itself only ever holds a 1-hour access token in
memory and quietly asks `/api/auth/refresh` for a new one before it runs out. Signing out revokes the token at Google.

**Important: "Testing" vs "In production".** While the OAuth consent screen's publishing status is **Testing**,
Google expires every refresh token after **7 days**, so you would be signed out weekly no matter what the app does.
To stay signed in for months, set the status to **In production**. For a personal app you do not need to go through
Google's verification: you will see a "Google hasn't verified this app" warning on the consent screen; click
**Advanced → Go to (app name)** to continue. Unverified apps are limited to 100 users, which is fine for personal use.
After switching, sign out and sign in once so you get a new (non-expiring) refresh token.

A refresh token also stops working if you revoke the app at [myaccount.google.com/permissions](https://myaccount.google.com/permissions),
go 6 months without using it, or if `SESSION_SECRET` changes.
The app then shows the sign-in page again.

## Check your keys

```bash
cd client && npm run check-env
```

`GET /api/health` on the deployment shows configuration booleans only, never any part of a key: `engine`, `provider`, `model`, `hasGroqKey`, `hasAnthropicKey`, `authConfigured` (Google client id + secret + a 32+ character `SESSION_SECRET`), `ownersConfigured` (`OWNER_EMAILS` or `ALLOWED_EMAILS` is set), `publicAccess` (`PUBLIC_ACCESS` is not `false`), `demoChat` (public access on and the demo chat not disabled) and the `commit`.

## First deploy checklist

1. Vercel project root directory is `client`; delete any obsolete second Vercel project named `server` (the API now lives in `client/api/index.js`).
2. Set the Vercel environment variables: `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `GROQ_API_KEY`, optionally `ANTHROPIC_API_KEY` and `OWNER_EMAILS`. Redeploy after changing any of them.
3. Google OAuth consent screen: publishing status **In production**.
4. OAuth client **Authorized JavaScript origins** include `http://localhost:5173`, `http://127.0.0.1:5173` and the production URL (and any custom domain, which also needs `ALLOWED_ORIGINS` if it calls the API cross-origin).
5. Open `/api/health` and confirm `authConfigured: true`, the expected `provider`, and `ownersConfigured: true`.
6. Sign in on the deployment, ask "What's next on my calendar?", then sign out and back in once.

## Troubleshooting

1. **Signed out after about a week**: the OAuth consent screen is still in **Testing**; set it to **In production** (above).
2. **Sign-in says "not set up on the server"**: `GOOGLE_CLIENT_SECRET` or `SESSION_SECRET` (32+ chars) is missing in Vercel; add it and redeploy.
3. **Sign-in popup errors with `redirect_uri_mismatch` / `origin_mismatch`**: add the exact site URL to the client's authorized JavaScript origins.

4. **Chat shows an AI error**: the message includes Groq's reason (bad key, model not available, request too large).
5. **"missing /api/assistant/message"**: the deployment is out of date; redeploy.

## Cost

Vercel and Groq free tiers cost $0/month, and everyone who is not an owner (including the demo) is free because they only ever use Groq. Owner messages run on Claude Haiku 5.5 at about $0.0004 each, so the total stays at cents for personal use.
