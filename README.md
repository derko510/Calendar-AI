### 🛠️ Installation Steps

The app and its API live in one project: `client/` (React app in `src/`, API in `api/` + `server/`).

```bash
cd client
npm install
cp .env.example .env      # fill in your keys
npm run check-env         # tests the Groq key and database
```

Run it locally (two terminals):

```bash
npm run dev:api   # API on http://localhost:3001
npm run dev       # app on http://localhost:5173 (proxies /api to the API)
```
