### 🛠️ Installation Steps

One project at the repo root: React app in `src/`, API in `api/index.js` with its code in `server/`.

```bash
npm install
cp .env.example .env      # fill in your keys
npm run check-env         # tests the Groq key and database
```

Run it locally (two terminals):

```bash
npm run dev:api   # API on http://localhost:3001
npm run dev       # app on http://localhost:5173 (proxies /api to the API)
```
