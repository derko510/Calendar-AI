# Development Workflow

## Branch Structure

- **`main`** - Production branch (deployed to derricks-calendar-ai.vercel.app)
- **`dev`** - Development branch (deployed to calendar-ai-dev.vercel.app)

## Development Process

1. **Work on dev branch**:
   ```bash
   git checkout dev
   git pull origin dev
   # Make your changes
   git add .
   git commit -m "your changes"
   git push origin dev
   ```

2. **Test on dev deployment**: 
   - Dev URL: https://calendar-ai-dev.vercel.app (or similar)
   - Test all functionality thoroughly

3. **Merge to production**:
   ```bash
   git checkout main
   git merge dev
   git push origin main
   ```

## Vercel Deployments

### Frontend
- **Production**: `derricks-calendar-ai.vercel.app` (main branch)
- **Development**: `calendar-ai-dev.vercel.app` (dev branch)

### Backend  
- **Production**: `server-nu-eight-16.vercel.app` (main branch)
- **Development**: `server-dev-calendar-ai.vercel.app` (dev branch)

## Environment Variables

### Development (.env.development)
```
VITE_API_URL=https://server-dev-calendar-ai.vercel.app
VITE_GOOGLE_CLIENT_ID=953891884677-arh7viohrt7qi1kcadvivd3oisnefkt8.apps.googleusercontent.com
```

### Production (.env.production)
```
VITE_API_URL=https://server-nu-eight-16.vercel.app
VITE_GOOGLE_CLIENT_ID=953891884677-arh7viohrt7qi1kcadvivd3oisnefkt8.apps.googleusercontent.com
```

## Testing Checklist

Before merging to main:
- [ ] Authentication works (sign in/out)
- [ ] Calendar loading works
- [ ] Page refresh maintains authentication
- [ ] All features work as expected
- [ ] No console errors
- [ ] Mobile responsive