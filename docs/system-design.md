# Calendar AI: System Design

Chat with your Google Calendar: ask questions ("When was my last dentist appointment?"), add events ("gym friday 6pm"), or remove them. The diagram is in [`architecture.drawio`](../architecture.drawio) / `architecture.png`.

## 1. Goals

- Answer calendar questions correctly. Dates and filtering are done by code, not by the model.
- Never change the calendar without the user clicking Confirm.
- Stay stateless and cheap: no database, free-tier AI first, one serverless function.
- Stay signed in for months without storing tokens on a server.
- Measure accuracy with repeatable evals instead of guessing.

## 2. Architecture

```
Browser (React SPA, Vite)                    Vercel, one project rooted at client/
  Google sign-in popup  ----code---->   POST /api/auth/google    (client/api/index.js, Express)
  access token in memory <--token---    POST /api/auth/refresh        |
  loads events from Google Calendar     POST /api/assistant/message --+--> requireUser gate
  sends message + events + time zone                                       |
  shows answer, cards, Confirm buttons                                      v
                                              agent (server/src/assistant) <--> AI client (services/llm.js)
                                                    |                                  |
                                          events.js + time.js                  Claude (owners) or Groq (public)
                                          (deterministic search)               (backup)
```

- **Frontend**: React (Vite) SPA with Month / Week / Day views and the Ask panel (`RealCalendarBot.jsx`). It holds the 1-hour Google access token in memory and calls Google Calendar directly to list, create and delete events.
- **Backend**: one Express app, `client/api/index.js`, run by Vercel as a serverless function (`vercel.json` rewrites `/api/*` to it, 30 s max). Routes: `/api/auth/*`, `/api/assistant/message`, `/api/health`.
- **Data store**: Google Calendar only. The API keeps nothing between requests.
- **Demo mode**: `/?demo` shows sample events (`src/demo/sampleEvents.js`). The demo chat is on by default (Groq only, rate limited); `DEMO_CHAT_ENABLED=false` turns it off.

## 3. One chat message

1. The browser already has the user's events (loaded from Google with the access token).
2. The user sends "When was my last dentist appointment?". The browser POSTs `{ message, events, timeZone }` to `/api/assistant/message` with the `cal_session` cookie. Body limit is 2 MB, at most 2000 events, message trimmed to 1000 characters.
3. `requireUser` checks the cookie (section 6). Failure gives 401 or 403 and no AI call.
4. `runAssistant` picks the engine (`ASSISTANT_ENGINE`, default `agent`) and builds one LLM object for this request.
5. The agent loops (section 4) and returns `{ intent: 'question' | 'create' | 'delete', answer?, eventIds?, events? }`.
6. The route logs one JSON line (engine, model, intent, latency, token usage) and responds. A rate limit that survives the fallback is a 429, unusable model output a 422, other AI errors a 500.
7. For a question the browser renders the answer plus cards for the cited event ids. For create or delete it shows the proposal; only after Confirm does the browser call Google Calendar itself.

## 4. The agent loop and tools

`server/src/assistant/agent.js` gives the model a short system prompt (current time, time zone, the next 14 days with weekday names, and rules) and four tools. Every reply must be exactly one tool call (`toolChoice: required`), for at most 5 steps. The last step removes `search_events` so the loop always ends.

| Tool | Kind | What it does |
| --- | --- | --- |
| `search_events` | working | keywords (any match, model supplies synonyms), `status` (past / now / upcoming), `from` / `to`, order, limit up to 25. Code runs it and returns only the matches. |
| `answer` | final | `{ text, eventIds }`. Ids are filtered to events search actually returned, so cards always match the text. |
| `create_events` | final | Proposes events (title, date, start, end, location, description). Validated by `cleanCreateEvents`; nothing is saved here. |
| `delete_events` | final | Proposes ids. Only ids the model was shown by search are accepted, so a guessed id cannot target an event. |

Malformed tool calls (invalid JSON, a Groq `tool_use_failed` 400) get a corrective message and another step. A plain-text reply is accepted as an answer without cards. Running out of steps returns a polite "could not work that out".

The older `prompt-v1` and `prompt-v0` engines (every event pasted into one prompt) remain only as eval baselines.

## 5. Deterministic time and search code

The model decides what to look for; code does the date math.

- `time.js`: time-zone-safe conversions (`zonedToUtc`, `zonedParts`, DST-aware), `describeNow`, and `upcomingDays`, which lists the next 14 days so the model never computes "next Friday".
- `events.js`: `normalizeEvents` turns raw Google events (timed, all-day, recurring instances) into one shape; `eventStatus` classifies past / now / upcoming; `searchEvents` filters by keyword, status and an overlap window (a bare `to` date means through the end of that day); `toModelView` is what the model sees.
- Both are unit-tested without any network.

## 6. Sign-in and the session cookie

1. The SPA opens Google Identity Services' auth-code popup (`@react-oauth/google`) and receives a one-time code.
2. `POST /api/auth/google { code }`: the server swaps the code (`redirect_uri=postmessage`) for tokens using the client secret, reads the profile from the id token (or userinfo), checks `PUBLIC_ACCESS` / `OWNER_EMAILS` (with `PUBLIC_ACCESS=false` only owners may sign in), and stores the **refresh token** in an AES-256-GCM encrypted cookie `cal_session` (httpOnly, Secure, SameSite=Lax, `Path=/api`, 180 days). The key is SHA-256 of `SESSION_SECRET`; each cookie has a random IV and an auth tag, so edits or a different secret fail to decrypt. It returns a 1-hour access token, which the page keeps in memory only.
3. `POST /api/auth/refresh`: decrypts the cookie, gets a new access token from Google, and re-issues the cookie (sliding window). A revoked or expired grant clears the cookie and returns 401.
4. `POST /api/auth/logout`: revokes the refresh token at Google (best effort) and clears the cookie.

If Google sends no refresh token on a repeat sign-in, the one in the existing cookie is reused when it belongs to the same Google account; otherwise the server answers `consent_required`. While the OAuth consent screen is in Testing, Google expires refresh tokens after 7 days, so the screen should be In production (see `DEPLOYMENT.md`).

## 7. Security model

- **Gate and tiers**: `/api/assistant/message` needs a valid cookie or a demo request. *Owner* (email in `OWNER_EMAILS`, legacy `ALLOWED_EMAILS`) gets Claude Haiku 5.5 first, Groq as backup. *Public* (any other signed-in account, and the demo) gets Groq's free tier only and can never cause a Claude call. Public requests are limited per visitor (`PUBLIC_CHAT_LIMIT`, default 20 per 10 minutes, in memory so best effort). `PUBLIC_ACCESS=false` makes it owners only and turns the demo chat off.
- **Secrets**: the Google client secret, `SESSION_SECRET` and AI keys exist only in server env vars. Only `VITE_*` values reach the browser. `/api/health` returns booleans and labels, never any part of a key.
- **CSRF**: `/api/auth/*` requires the header `X-Requested-With: calendar-ai`, which cross-site pages cannot send without a CORS preflight that the policy refuses.
- **CORS**: same-origin always passes; otherwise only the allowed origins (`ALLOWED_ORIGINS`, default localhost:5173, 127.0.0.1:5173 and the production domain). Anything else, including `Origin: null`, gets a clean 403.
- **Errors**: body-parser errors map to 413 `payload_too_large` and 400 `bad_json`; everything else is a generic 500 with the stack only in server logs. Tokens, codes and emails are never logged.
- **Least privilege**: the model can only call the four tools, cannot touch the calendar, and cannot name events it did not see. `helmet` sets security headers.

## 8. AI providers and fallback

`services/llm.js` hides both providers behind one interface (`chat(messages, { tools })`, usage tracking).

- **Groq** (free tier): OpenAI-compatible tool calling, default model `openai/gpt-oss-120b` (`GROQ_MODEL`), then `openai/gpt-oss-20b`. It serves all public traffic and backs up owners.
- **Claude Haiku 5.5** (paid, roughly $0.0004 per message, owners only): model fixed in code as `claude-haiku-5-5`; `ANTHROPIC_EFFORT` (default `low`) and `ANTHROPIC_WORKSPACE_ID` are optional.
- Owners start on Claude and fall back to Groq if Claude fails; public users and the demo use Groq only. A request never bounces between providers mid-conversation. With one key that provider is used alone; `LLM_PROVIDER=groq|anthropic` forces one.

## 9. Evals and tests

- **Unit tests** (`npm test`, no network, run in CI): time, events, agent loop with a fake LLM, contract, fallback, Anthropic adapter, auth cookie, `requireUser`, and the API entry point (health shape, CORS, 400 / 413 / 404).
- **Evals** (`npm run eval`): 37 base cases (plus an extended suite) run against a frozen fake calendar with "now" fixed at Tue 2026-11-10 17:27, graded on structured results (cited event ids, created dates and times, deleted ids), not on wording. They run on the configured provider, or `--model claude-haiku-5-5` / a Groq model id. CI runs `--dry` and `--self-test` offline. See `client/evals/README.md`.

## 10. Limitations

- The browser sends all loaded events with every message (up to 2000, 2 MB); very large calendars are truncated by those limits.
- Keyword search depends on the model supplying synonyms; vague questions can miss events.
- No persistence: no chat history on the server and no background sync.
- Serverless limits: 30 s per request, so a slow provider surfaces as an error.
- Unverified Google apps are capped at 100 users, and refresh tokens last 7 days if the consent screen stays in Testing.
- Recurring events are handled as expanded instances; editing a series is out of scope.
