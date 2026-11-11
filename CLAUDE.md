# Calendar-AI

Chat with your Google Calendar: ask questions ("when was my last dentist appointment?") and give commands
("gym Friday at 6pm") in plain English. A tool-calling AI agent answers from the user's real Google Calendar,
and every change waits for the user's confirmation.

See `documentation.md` for the full walkthrough and `docs/system-design.md` for the design.

## Layout

Everything lives in `client/` and deploys as ONE Vercel project (root directory `client`).

```
client/
├── src/                      React 19 + Vite + Tailwind single-page app
│   ├── pages/                SignIn, Dashboard
│   ├── components/           calendar views, event details/forms, RealCalendarBot (chat panel)
│   ├── services/             auth.js (session), googleCalendar.js (Google API), demoCalendar.js (/?demo)
│   └── utils/, hooks/, demo/
├── api/index.js              the whole backend: one Express app run as a serverless function
├── server/src/
│   ├── routes/               auth.js (/api/auth/*), assistant.js (/api/assistant/message)
│   ├── auth/                 session.js (encrypted cookie), requireUser.js (who gets which AI)
│   ├── assistant/            agent.js (tool loop), events.js + time.js (search and time logic),
│   │                         contract.js (validation), promptEngine.js (single-prompt baselines)
│   └── services/llm.js       Groq and Claude clients behind one interface
├── server/test/              unit tests (node:test, fake LLM, no network)
└── evals/                    accuracy evals: fixed fake calendar, frozen clock, graded by code
```

## How it works

- **No database.** Google Calendar is the only data store. The browser loads events straight from Google and
  sends the relevant fields with each chat message. The server keeps nothing between requests.
- **Sign-in:** Google authorization-code flow. The refresh token lives in an AES-256-GCM encrypted, httpOnly
  cookie (`SESSION_SECRET`); the page holds only a 1-hour access token in memory.
- **Chat:** `POST /api/assistant/message` runs the agent: `search_events` (code filters by keyword, date and
  past/now/upcoming) then one final tool: `answer`, `create_events` or `delete_events`. Creates and deletes
  are proposals; the browser asks the user to confirm and then calls Google itself.
- **Date and time logic is code, not AI** (`events.js`, `time.js`), in the user's time zone.
- **Who gets which AI:** emails in `OWNER_EMAILS` get Claude Haiku 5.5 (Groq as backup). Everyone else who
  signs in, and the demo (`/?demo`), get Groq's free tier only and are rate limited.

## Commands (run in `client/`)

```bash
npm run dev:api      # API on http://localhost:3001
npm run dev          # app on http://127.0.0.1:5173 (proxies /api)
npm test             # unit tests, no network
npm run lint
npm run eval         # live accuracy evals (needs an AI key in client/.env); --dry and --self-test are offline
npm run check-env    # checks keys and settings without printing them
```

## Rules for changes

- Keep time/date decisions in code with tests; the model only chooses what to search for and how to phrase it.
- The model never changes the calendar directly. Proposals only; ids must come from its own search results.
- Any change to prompts, tools or models gets an eval run before and after (`npm run eval`).
- Never log message text, event text, emails, tokens or keys.
- Calendar text (titles, descriptions, locations) is untrusted: links must pass `safeHref`; never inject HTML.
- Secrets stay in `client/.env` (gitignored) and Vercel env vars. Nothing with a `VITE_` prefix may be secret.
