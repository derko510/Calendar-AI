## **🧠 Project Title:**

**Smart Calendar Chatbot Web App (MVP)**

A full-stack assistant that lets users chat with their Google Calendar:

create events, retrieve past/future events, and answer questions about them using AI + Google Calendar API.

---

## **🎯 MVP Goals**

1. 🔐 Allow Google Calendar login (OAuth2)
2. 💬 Let users create events via chat in natural language
3. 🔍 Let users ask questions like:
    - “When is my next meeting?”
    - “When was my last dentist appointment?”
    - “What did I do last weekend?”
4. 🗓️ Optionally display calendar in a visual component (viewer)

---

## **🧱 Tech Stack**

| **Layer** | **Tech Stack** |
| --- | --- |
| **Frontend** | React (Vite), TailwindCSS, shadcn/ui, react-chat-ui |
| **Backend** | Node.js (Express), Google Calendar API, OpenAI API |
| **LLM** | OpenAI (or Claude), used to process event queries |
| **OAuth** | Google OAuth2 (with googleapis Node.js package) |
| **Storage** | Optional: PostgreSQL or in-memory cache for event data |

## **📦 Directory Structure**

`/calendar-chatbot`

`├── /client                # React frontend`

`│   ├── /components        # Chat UI, Calendar Viewer`

`│   ├── /pages             # Auth, Home`

`│   └── App.jsx`

`├── /server                # Node.js backend`

`│   ├── /routes`

`│   │   ├── /auth.js`

`│   │   ├── /calendar.js`

`│   │   └── /chatbot.js`

`│   ├── /utils`

`│   │   ├── parseMessage.js       # Parses chat to intent`

`│   │   └── generatePrompt.js     # Formats RAG prompt`

`│   └── server.js`

`├── .env`

`└── README.md`

## **✅ Feature Breakdown**

### **1. 🔐 Google OAuth2 Login**

- Use @react-oauth/google for frontend login.
- Backend uses access tokens with Google Calendar API.
- Store session securely (JWT or express-session).

---

### **2. 💬 Chatbot Message Flow**

- User types:
    
    *"Create a calendar event for 5 PM on July 30 titled 'Eat dinner' and repeat every day"*
    
- Frontend sends message to /api/chatbot/message
- Backend does:
    1. Uses LLM to parse the message → structured event data
    2. Calls Google Calendar API to create event
    3. Returns confirmation

---

### **3. 🧠 LLM-Based Event Parsing**

**LLM Input Prompt Example:**

`User said: "Schedule dinner with John at 7 PM next Friday and repeat weekly."`

`Extract:`

- `title`
- `start datetime`
- `end datetime (assume +1 hr if missing)`
- `recurrence rule`

`Respond as JSON:
{
"title": "...",
"start": "...",
"end": "...",
"recurrence": "RRULE:FREQ=WEEKLY"
}`

### 4. 📅 Calendar Event Creation API

**`POST /api/calendar/create`**

```jsx
{
"title": "Dinner with John",
"start": "2025-08-01T19:00:00",
"end": "2025-08-01T20:00:00",
"recurrence": "RRULE:FREQ=WEEKLY"
}
```

Inserts into Google Calendar using authenticated user’s token.

### 5. 🔍 Natural Language Event Retrieval via RAG

**User asks:**

*“When was my last dentist appointment?”*

**Backend Flow:**

1. Fetch user’s **past calendar events** using Google Calendar API
2. Filter or chunk into short summaries like:
    
    ```
    - Dentist Checkup - 2025-03-01 at 10:00
    - Meeting - 2025-03-03 at 14:00
    - Dinner - 2025-03-04 at 19:00
    ```
    
3. Create RAG prompt:

```
Question: "When was my last dentist appointment?"
Context:
- Dentist Cleaning - 2024-09-10 10:00
- Dental Checkup - 2025-03-01 15:00
- Staff Meeting - 2025-03-05 09:00
```

1. LLM returns:

*"Your last dentist appointment was on March 1, 2025 at 3:00 PM."*

### 6. 📤 API Endpoint: Get Past Events

**`GET /api/calendar/past`**

- Returns last 100 events from user’s calendar before today.

**Optional Enhancements:**

- Filter by keywords (`dentist`, `doctor`, etc.)
- Store to local DB to reduce repeat calls

---

### 7. 📤 API Endpoint: Chat Message Handler

**`POST /api/chatbot/message`**

Request:

```jsx
{
  "message": "When was my last dentist appointment?"
}
```

Response:

```jsx
{
"response": "Your last dentist appointment was on March 1, 2025 at 3:00 PM."
}
```

## 🧪 Test Cases
| Scenario | Input | Expected |
| --- | --- | --- |
| Create event | "Schedule gym at 6 PM Friday" | Event is created for correct time |
| View next event | "What’s next on my calendar?" | Returns next calendar item |
| Past query | "When was my last dentist visit?" | Returns last event with 'dentist' |
| No match | "When did I go to Mars?" | Returns fallback "No match found" |