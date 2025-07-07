# Vercel Branch Deployment Setup

## How It Works

Vercel automatically deploys every branch to a unique URL:

- **Production (main)**: `derricks-calendar-ai.vercel.app`
- **Dev branch**: `derricks-calendar-ai-git-dev.vercel.app`  
- **Feature branches**: `derricks-calendar-ai-git-[branch-name].vercel.app`

## Setup Instructions

### Frontend Deployment

1. **Go to your existing Vercel project** (derricks-calendar-ai)
2. **Settings → Environment Variables**
3. **Add these variables**:

#### Production Environment (main branch):
```
VITE_API_URL = https://server-nu-eight-16.vercel.app
VITE_GOOGLE_CLIENT_ID = [YOUR_NEW_GOOGLE_CLIENT_ID]
```
**Environment**: Production
**Git Branch**: main

#### Preview Environment (dev + other branches):
```
VITE_API_URL = https://server-nu-eight-16-git-dev.vercel.app
VITE_GOOGLE_CLIENT_ID = [YOUR_NEW_GOOGLE_CLIENT_ID]
```
**Environment**: Preview
**Git Branch**: (leave empty for all preview branches)

### Backend Deployment

#### Option A: Same Project with Branch URLs
Your backend will automatically get:
- **Production**: `server-nu-eight-16.vercel.app`
- **Dev**: `server-nu-eight-16-git-dev.vercel.app`

#### Option B: Separate Backend Project
1. **Import the repo again** in Vercel
2. **Project name**: `calendar-ai-backend-dev`
3. **Root Directory**: `server`
4. **Connect to dev branch only**

### Google OAuth Setup

Add these URLs to your Google Cloud Console OAuth settings:

1. **Go to**: [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services → Credentials**
3. **Edit your OAuth 2.0 Client ID**
4. **Add to Authorized redirect URIs**:
   ```
   https://derricks-calendar-ai.vercel.app
   https://derricks-calendar-ai-git-dev.vercel.app
   https://server-nu-eight-16.vercel.app
   https://server-nu-eight-16-git-dev.vercel.app
   ```

## Development Workflow

### Working on Dev Branch:
```bash
git checkout dev
# Make changes
git add .
git commit -m "feature: add new functionality"
git push origin dev
```
→ **Automatically deploys to**: `derricks-calendar-ai-git-dev.vercel.app`

### Creating Feature Branch:
```bash
git checkout -b feature/new-feature
# Make changes
git push origin feature/new-feature
```
→ **Automatically deploys to**: `derricks-calendar-ai-git-feature-new-feature.vercel.app`

### Promoting to Production:
```bash
git checkout main
git merge dev
git push origin main
```
→ **Deploys to**: `derricks-calendar-ai.vercel.app`

## Branch Protection (Optional)

Set up branch protection in GitHub:
1. **Go to**: Repository → Settings → Branches
2. **Add rule for main branch**:
   - Require pull request reviews
   - Require status checks to pass
   - Require branches to be up to date

## Vercel Preview Comments

Vercel will automatically comment on PRs with preview URLs:
- ✅ Preview deployment ready
- 🔗 Preview URL: `derricks-calendar-ai-git-feature-branch.vercel.app`

## Environment Variables Reference

| Variable | Production Value | Preview Value |
|----------|------------------|---------------|
| `VITE_API_URL` | `https://server-nu-eight-16.vercel.app` | `https://server-nu-eight-16-git-dev.vercel.app` |
| `VITE_GOOGLE_CLIENT_ID` | `[YOUR_NEW_GOOGLE_CLIENT_ID]` | Same |