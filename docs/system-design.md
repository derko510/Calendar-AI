# Calendar AI — System Design (UML)

All diagrams are Mermaid and render on GitHub.

## 1. Component Diagram

```mermaid
flowchart LR
  subgraph Client["React Client (Vite + Tailwind, Vercel)"]
    SignIn[SignIn page]
    Dash[Dashboard page]
    GCal[GoogleCalendar<br/>Month / Week / Day views]
    RAGBot[RAGChatBot]
    RealBot[RealCalendarBot]
    AuthSvc[authService]
    GCalSvc[googleCalendar service]
    ChatSvc[chatbotService]
  end

  subgraph Server["Express API (Node.js, Vercel)"]
    Auth["/api/auth<br/>google-token · user · logout"]
    Cal["/api/calendar<br/>sync · events"]
    RagRoute["/api/rag-chat<br/>message · sync"]
    RealRoute["/api/real-calendar<br/>sync-frontend-data · interpret"]
    MW[jwtAuth / session middleware]
    RAG[RAGService]
    Sync[CalendarSyncService]
    LLM[CloudLLMService / OllamaService]
    Cron[node-cron<br/>sync every 30 min]
  end

  DB[(PostgreSQL<br/>Drizzle ORM)]
  GoogleOAuth[[Google OAuth2]]
  GoogleAPI[[Google Calendar API]]
  CloudLLM[[Gemini / Groq / OpenAI]]
  Ollama[[Local Ollama]]

  SignIn --> AuthSvc --> Auth
  AuthSvc --> GoogleOAuth
  Dash --> GCal & RAGBot & RealBot
  GCal --> GCalSvc --> GoogleAPI
  RAGBot --> ChatSvc --> RagRoute
  RealBot --> RealRoute
  Auth --> MW
  RagRoute --> MW --> RAG
  Cal --> Sync
  RealRoute --> LLM
  RealRoute --> DB
  RAG --> LLM & Sync & DB
  Sync --> GoogleAPI
  Sync --> DB
  Cron --> Sync
  LLM --> CloudLLM
  LLM -.fallback.-> Ollama
```

## 2. Class Diagram

```mermaid
classDiagram
  class RAGService {
    -llm : CloudLLMService | OllamaService
    -calendarSync : CalendarSyncService
    +processQuery(userId, message)
    +parseIntent(message)
    +handleQueryEvents(userId, message, intent)
    +searchEvents(userId, intent)
    +generateResponse(message, context, events)
    +handleCreateEvent(userId, message, intent)
  }
  class CalendarSyncService {
    +syncUserCalendar(userId, accessToken)
    +upsertEvent(userId, googleEvent)
    +getUserEvents(userId, options)
  }
  class CloudLLMService {
    +generate(prompt, options)
    -generateGemini()
    -generateGroq()
    -generateOpenAI()
    +isModelAvailable()
  }
  class OllamaService {
    +generate(prompt, options)
  }
  class User {
    +id : serial PK
    +googleId : varchar unique
    +email : varchar
    +name : varchar
    +createdAt : timestamp
  }
  class CalendarEvent {
    +id : serial PK
    +userId : FK users.id
    +googleEventId : varchar
    +title, description, location
    +startDatetime, endDatetime
    +attendees : text[]
    +recurrence : text
    +isAllDay : boolean
  }

  RAGService --> CalendarSyncService
  RAGService --> CloudLLMService
  RAGService ..> OllamaService : fallback
  CalendarSyncService ..> CalendarEvent : upserts
  User "1" --> "*" CalendarEvent : owns
```

## 3. Sequence — Login

```mermaid
sequenceDiagram
  actor U as User
  participant C as React Client
  participant G as Google OAuth2
  participant A as /api/auth
  participant DB as PostgreSQL
  U->>C: Click "Sign in with Google"
  C->>G: OAuth consent (@react-oauth/google)
  G-->>C: credential + access token
  C->>A: POST /google-token
  A->>G: verify token, fetch profile
  A->>DB: upsert user
  A-->>C: JWT
  C->>C: store JWT (authService)
```

## 4. Sequence — Ask a question (RAG)

```mermaid
sequenceDiagram
  actor U as User
  participant C as RAGChatBot
  participant R as /api/rag-chat/message
  participant S as RAGService
  participant L as LLM
  participant DB as PostgreSQL
  U->>C: "When was my last dentist appointment?"
  C->>R: POST {message} + JWT
  R->>S: processQuery(userId, message)
  S->>L: parseIntent(message)
  L-->>S: {type: QUERY_EVENTS, keywords, timeframe}
  S->>DB: searchEvents (ilike keywords, date range)
  DB-->>S: matching events
  S->>L: RAG prompt (question + event context)
  L-->>S: natural-language answer
  S-->>R: {response, events}
  R-->>C: JSON
  C-->>U: "Your last dentist appointment was Mar 1, 2025 at 3 PM"
```

## 5. Sequence — Create an event

```mermaid
sequenceDiagram
  actor U as User
  participant C as Client
  participant S as RAGService
  participant L as LLM
  participant G as Google Calendar API
  participant DB as PostgreSQL
  U->>C: "Schedule gym at 6 PM Friday, repeat weekly"
  C->>S: POST message
  S->>L: parseIntent → CREATE_EVENT
  S->>L: extract {title, start, end(+1h), RRULE}
  L-->>S: event JSON
  S->>G: events.insert
  G-->>S: created event
  S->>DB: upsertEvent
  S-->>C: confirmation
```

## 6. Deployment

```mermaid
flowchart LR
  Browser --> V["Vercel project (client/)"]
  V --> VC[Static React build]
  V --> VS["/api/* → api/index.js function"]
  VS --> PG[(Hosted PostgreSQL)]
  VS --> GAPI[Google APIs]
  VS --> LLMs[Gemini / Groq / OpenAI]
```
