# 🚀 Vercel Environment Variables Setup

## Required Environment Variables for Groq API

To fix the 401 Unauthorized errors, add these environment variables in your Vercel dashboard:

### 1. Go to Vercel Dashboard
- Visit: https://vercel.com/dashboard
- Select your `server` project
- Go to **Settings** → **Environment Variables**

### 2. Add Required Variables

| Variable Name | Value | Environment |
|---------------|--------|-------------|
| `GROQ_API_KEY` | `[Your Groq API Key from .env file]` | All |
| `DATABASE_URL` | `[Your Database URL from .env file]` | All |
| `GOOGLE_CLIENT_ID` | `[Your Google Client ID from .env file]` | All |
| `GOOGLE_CLIENT_SECRET` | `[Your Google Client Secret from .env file]` | All |

### 3. Trigger Redeploy
After adding the environment variables:
- Go to **Deployments**
- Click the **...** menu on the latest deployment
- Select **Redeploy**

### 4. Verify Fix
Once redeployed, test the chatbot:
- Try: "create studying on 16th at 1pm"
- Should work without 401 errors

## Security Note
Environment variables are now properly secured in Vercel dashboard instead of being committed to the repository.