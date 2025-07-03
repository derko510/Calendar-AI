# 🚀 Vercel Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Groq Account**: Sign up at [groq.com](https://groq.com) for free LLM API
3. **Neon Account**: Sign up at [neon.tech](https://neon.tech) for free PostgreSQL

## Step 1: Set Up Database (Neon)

1. Go to [neon.tech](https://neon.tech) and create account
2. Create new project: "calendar-ai"
3. Copy the connection string (looks like):
   ```
   postgresql://username:password@hostname:5432/dbname
   ```
4. Save this for later

## Step 2: Set Up LLM (Groq - Free)

1. Go to [groq.com](https://groq.com) and create account
2. Go to API Keys section
3. Create new API key
4. Save the key (starts with `gsk_...`)

## Step 3: Deploy Backend to Vercel

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy backend
cd server
vercel

# 3. Set environment variables in Vercel dashboard:
# - DATABASE_URL: your_neon_connection_string
# - GROQ_API_KEY: your_groq_api_key
# - GOOGLE_CLIENT_ID: your_google_client_id
# - GOOGLE_CLIENT_SECRET: your_google_client_secret
# - SESSION_SECRET: random_secure_string
# - NODE_ENV: production
# - LLM_PROVIDER: groq
```

## Step 4: Deploy Frontend to Vercel

```bash
# 1. Update frontend .env
cd ../client
echo "VITE_API_URL=https://your-backend.vercel.app" > .env.production

# 2. Deploy frontend
vercel

# 3. Set environment variables:
# - VITE_API_URL: https://your-backend.vercel.app
# - VITE_GOOGLE_CLIENT_ID: your_google_client_id
```

## Step 5: Run Database Migrations

```bash
# Connect to your deployed backend and run:
cd server
DATABASE_URL="your_neon_connection_string" npm run db:generate
DATABASE_URL="your_neon_connection_string" npm run db:migrate
```

## Step 6: Test Production

1. Visit your frontend Vercel URL
2. Sign in with Google
3. Check if calendar sync works
4. Test RAG queries

## Environment Variables Summary

### Backend (.env)
```
DATABASE_URL=postgresql://user:pass@host:5432/db
GROQ_API_KEY=gsk_your_key_here
GOOGLE_CLIENT_ID=your_id
GOOGLE_CLIENT_SECRET=your_secret
SESSION_SECRET=random_secure_string
NODE_ENV=production
LLM_PROVIDER=groq
```

### Frontend (.env.production)
```
VITE_API_URL=https://your-backend.vercel.app
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## Cost Breakdown

- **Vercel**: Free tier (generous limits)
- **Neon**: Free tier (512MB database)
- **Groq**: Free tier (good for testing)
- **Total**: $0/month for MVP

## Scaling Options

- **Vercel Pro**: $20/month (more bandwidth/builds)
- **Neon Scale**: $19/month (larger database)
- **OpenAI**: Pay-per-use (better quality responses)

## Troubleshooting

1. **Build fails**: Check Node.js version compatibility
2. **Database errors**: Verify connection string format
3. **LLM errors**: Check API key and quota
4. **CORS errors**: Verify frontend/backend URLs match