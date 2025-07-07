# Security Guide

## 🚨 IMPORTANT: Google Client ID Compromised

The original Google Client ID was accidentally committed to GitHub and is now public. **It has been invalidated and replaced.**

## New Security Measures

### 1. New Google OAuth Credentials
- ✅ **Old Client ID deleted**: `953891884677-arh7viohrt7qi1kcadvivd3oisnefkt8.apps.googleusercontent.com`
- ✅ **New Client ID created**: Set in Vercel environment variables only
- ✅ **Never commit real credentials** to Git

### 2. Environment Variable Security

#### ❌ NEVER commit these files with real values:
```
.env
.env.production
.env.development
.env.preview
```

#### ✅ Safe to commit (with placeholder values):
- Template files with `your-new-google-client-id-here`
- Documentation with `[YOUR_NEW_GOOGLE_CLIENT_ID]`

### 3. Setting Environment Variables in Vercel

1. **Go to**: [Vercel Dashboard](https://vercel.com/dashboard)
2. **Select your project**
3. **Settings → Environment Variables**
4. **Add**:
   ```
   Name: VITE_GOOGLE_CLIENT_ID
   Value: [Your actual new Google Client ID]
   Environment: Production (for main branch)
   
   Name: VITE_GOOGLE_CLIENT_ID  
   Value: [Your actual new Google Client ID]
   Environment: Preview (for all other branches)
   ```

### 4. Local Development

For local development, create a `.env.local` file (not tracked by Git):

```bash
# .env.local (NOT tracked by Git)
VITE_GOOGLE_CLIENT_ID=your-actual-client-id-here
VITE_API_URL=http://localhost:3001
```

### 5. Backend Security

Also check your backend environment variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL`
- `SESSION_SECRET`
- `JWT_SECRET`

**Never commit these to Git!**

### 6. Git History Cleanup (Optional)

If you want to remove the exposed credentials from Git history:

```bash
# WARNING: This rewrites Git history - coordinate with team
git filter-branch --force --index-filter \
'git rm --cached --ignore-unmatch client/.env' \
--prune-empty --tag-name-filter cat -- --all

git push origin --force --all
```

### 7. Monitoring

- ✅ Monitor Google Cloud Console for unauthorized usage
- ✅ Check Vercel analytics for unexpected traffic
- ✅ Review Google OAuth scopes and permissions

## Best Practices

1. **Never commit secrets** to any branch
2. **Use environment variables** for all sensitive data
3. **Rotate credentials** if compromised
4. **Limit OAuth scopes** to minimum required
5. **Regular security audits** of dependencies

## What to do if credentials are compromised again

1. **Immediately delete** the compromised credentials in Google Cloud Console
2. **Create new credentials** with different client ID
3. **Update environment variables** in Vercel
4. **Test all deployments** with new credentials
5. **Monitor for unauthorized usage**