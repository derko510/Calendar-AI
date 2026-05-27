# Graph Report - c:/Users/derri/OneDrive/Desktop/github/Calendar-AI  (2026-05-27)

## Corpus Check
- Corpus is ~25,027 words - fits in a single context window. You may not need a graph.

## Summary
- 394 nodes · 534 edges · 36 communities (26 shown, 10 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Express API Core|Express API Core]]
- [[_COMMUNITY_Database & Drizzle ORM|Database & Drizzle ORM]]
- [[_COMMUNITY_Server Package Dependencies|Server Package Dependencies]]
- [[_COMMUNITY_Chatbot API Endpoints|Chatbot API Endpoints]]
- [[_COMMUNITY_AI & LLM Concepts|AI & LLM Concepts]]
- [[_COMMUNITY_React App Shell & Auth|React App Shell & Auth]]
- [[_COMMUNITY_Client Package Dependencies|Client Package Dependencies]]
- [[_COMMUNITY_Client Services & Data Models|Client Services & Data Models]]
- [[_COMMUNITY_RAG Service Engine|RAG Service Engine]]
- [[_COMMUNITY_Calendar View Components|Calendar View Components]]
- [[_COMMUNITY_Real Calendar Route Logic|Real Calendar Route Logic]]
- [[_COMMUNITY_Frontend Dev Dependencies|Frontend Dev Dependencies]]
- [[_COMMUNITY_Client Auth Service|Client Auth Service]]
- [[_COMMUNITY_Client Vercel Deployment|Client Vercel Deployment]]
- [[_COMMUNITY_Server Vercel Deployment|Server Vercel Deployment]]
- [[_COMMUNITY_Legacy ChatBot Component|Legacy ChatBot Component]]
- [[_COMMUNITY_Cloud LLM Service|Cloud LLM Service]]
- [[_COMMUNITY_Error Boundary|Error Boundary]]
- [[_COMMUNITY_Branding & Assets|Branding & Assets]]
- [[_COMMUNITY_Build Configuration|Build Configuration]]
- [[_COMMUNITY_Root Package Config|Root Package Config]]
- [[_COMMUNITY_Claude Dev Settings|Claude Dev Settings]]
- [[_COMMUNITY_CSS Build Config|CSS Build Config]]
- [[_COMMUNITY_Misc Singleton K|Misc Singleton K]]
- [[_COMMUNITY_Misc Singleton M|Misc Singleton M]]

## God Nodes (most connected - your core abstractions)
1. `RAGService` - 21 edges
2. `AuthService` - 12 edges
3. `CalendarSyncService` - 10 edges
4. `OllamaService` - 10 edges
5. `GoogleCalendarService` - 9 edges
6. `CloudLLMService` - 9 edges
7. `RAGService` - 9 edges
8. `OllamaService` - 8 edges
9. `getEventsForDate()` - 7 edges
10. `db` - 7 edges

## Surprising Connections (you probably didn't know these)
- `RAGService` --implements--> `RAG Pipeline Concept`  [INFERRED]
  server/src/services/ragService.js → CLAUDE.md
- `RAGService` --references--> `Natural Language Event Creation`  [INFERRED]
  server/src/services/ragService.js → CLAUDE.md
- `setup.md Setup Guide` --references--> `OllamaService`  [EXTRACTED]
  setup.md → server/src/services/ollamaService.js
- `DEPLOYMENT.md Vercel Deployment Guide` --references--> `Gemini API Integration`  [INFERRED]
  DEPLOYMENT.md → server/src/services/cloudLLM.js
- `setup.md Setup Guide` --references--> `JWT Authentication`  [INFERRED]
  setup.md → server/src/utils/jwt.js

## Hyperedges (group relationships)
- **Chatbot Component Variants** — chatbot, rag_chatbot, real_calendar_bot, simple_chatbot, test_rag_bot [INFERRED 0.95]
- **Calendar View Components** — google_calendar, month_view, week_view, day_view [INFERRED 0.95]
- **Authentication Flow** — app_jsx, google_auth_provider, page_signin, localstorage_auth, svc_auth [INFERRED 0.85]
- **Frontend Build System** — vite_config, tailwind_config, postcss_config, vercel_config, pkg_client [INFERRED 0.95]
- **Event Mutation (Create/Delete) Flow** — real_calendar_bot, concept_event_create, concept_event_delete, svc_google_calendar, api_real_calendar [EXTRACTED 1.00]
- **Full Authentication Flow (Google OAuth -> JWT -> Session)** — signin_signin, authservice_authservice, routes_auth, middleware_jwtauth, middleware_auth, concept_dual_auth [EXTRACTED 0.95]
- **Calendar Data Pipeline (Frontend -> Google API -> Backend DB)** — googlecalendarservice_googlecalendarservice, dashboard_dashboard, dbconnection_dbconnection, dbschema_dbschema, concept_calendar_event_model [INFERRED 0.85]
- **Server Entry Points (local + Vercel)** — serverjs_serverjs, serverapi_indexjs, vercel_vercel [EXTRACTED 0.95]
- **LLM Provider Abstraction Layer** — service_ollama, service_cloudllm, service_rag, service_simplechat [INFERRED 0.90]
- **RAG Chat API Routes** — route_chatbot, route_ragchatbot, route_realcalendar, route_testrag [INFERRED 0.85]
- **Calendar Sync Pipeline** — service_calendarsync, route_calendar, route_ragchatbot, route_realcalendar [INFERRED 0.85]
- **Cloud LLM Providers** — concept_gemini, concept_groq, concept_openai, service_cloudllm [EXTRACTED 1.00]

## Communities (36 total, 10 thin omitted)

### Community 0 - "Express API Core"
Cohesion: 0.06
Nodes (31): allowedOrigins, app, calendarSync, envCheck, eventData, jwtToken, syncService, tokenPayload (+23 more)

### Community 1 - "Database & Drizzle ORM"
Cohesion: 0.09
Nodes (17): handler(), db, pool, calendarEvents, users, authUrl, oauth2, oauth2Client (+9 more)

### Community 2 - "Server Package Dependencies"
Cohesion: 0.06
Nodes (32): author, dependencies, axios, body-parser, cors, dotenv, drizzle-orm, express (+24 more)

### Community 3 - "Chatbot API Endpoints"
Cohesion: 0.09
Nodes (30): API: /api/chat (health + message), API: /api/rag-chat (sync + message), API: /api/real-calendar (sync-frontend-data + ask + parse-events), API: /api/test-rag/chat, App Authentication State (isAuthenticated, userCredential), App Root Component, Calendar Component (react-calendar wrapper), ChatBot Component (+22 more)

### Community 4 - "AI & LLM Concepts"
Cohesion: 0.11
Nodes (26): Natural Language Event Creation, Frontend-Driven Calendar Sync Pattern, Gemini API Integration, Groq API Integration, Natural Language Intent Parsing, JWT Authentication, LLM Provider Abstraction, In-Memory Calendar Fallback (+18 more)

### Community 6 - "Client Package Dependencies"
Cohesion: 0.09
Nodes (22): dependencies, axios, clsx, date-fns, lucide-react, react, react-calendar, react-dom (+14 more)

### Community 7 - "Client Services & Data Models"
Cohesion: 0.15
Nodes (22): AuthService (Client), ChatbotService (Client), Calendar Event Data Model, Dual Auth (Session + JWT) Pattern, Google OAuth2 Token Flow, JWT Authentication Pattern, Session-Based Authentication, Dashboard Page (+14 more)

### Community 9 - "Calendar View Components"
Cohesion: 0.20
Nodes (8): CalendarComponent(), DayView(), MonthView(), formatEventDate(), formatEventTime(), getEventsForDate(), groupEventsByDate(), isToday()

### Community 10 - "Real Calendar Route Logic"
Cohesion: 0.12
Nodes (15): eventLines, eventsToInsert, jsonMatch, memoryCalendarStore, memoryKey, normalizedMemoryEvents, normalizeFrontendEvent(), ollama (+7 more)

### Community 11 - "Frontend Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+5 more)

### Community 13 - "Client Vercel Deployment"
Cohesion: 0.25
Nodes (7): buildCommand, devCommand, framework, installCommand, name, outputDirectory, rewrites

### Community 14 - "Server Vercel Deployment"
Cohesion: 0.29
Nodes (6): maxDuration, functions, api/*.js, name, routes, version

### Community 18 - "Branding & Assets"
Cohesion: 1.00
Nodes (4): App Logo (assets/logo.png), App Logo (client/public/logo.png), Calendar AI Branding Concept, Calendar Icon with Checkmark

### Community 19 - "Build Configuration"
Cohesion: 0.50
Nodes (4): Client Package (calendar-ai-client), Root Package (date-fns), Vercel Deployment Config, Vite Config

### Community 22 - "CSS Build Config"
Cohesion: 0.67
Nodes (3): PostCSS Config, Tailwind CSS Config, TestStyles Component (Tailwind debug)

## Knowledge Gaps
- **139 isolated node(s):** `date-fns`, `allow`, `name`, `private`, `version` (+134 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RAGService` connect `RAG Service Engine` to `Express API Core`, `Database & Drizzle ORM`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `CloudLLMService` connect `Cloud LLM Service` to `Database & Drizzle ORM`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `CalendarSyncService` connect `Express API Core` to `Database & Drizzle ORM`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `date-fns`, `allow`, `name` to the rest of the system?**
  _145 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Express API Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06462585034013606 - nodes in this community are weakly interconnected._
- **Should `Database & Drizzle ORM` be split into smaller, more focused modules?**
  _Cohesion score 0.09009009009009009 - nodes in this community are weakly interconnected._
- **Should `Server Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._