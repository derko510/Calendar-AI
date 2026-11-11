import { useEffect, useState } from 'react';
import { hasSignedInBefore, signIn } from '../services/auth';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly'
].join(' ');

const SignIn = ({ onLoginSuccess, notice = '' }) => {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isGoogleConfigured = Boolean(googleClientId && googleClientId !== 'your-google-client-id');
  const [isGoogleReady, setIsGoogleReady] = useState(() => Boolean(window.google?.accounts?.oauth2));
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');
  // Google only hands out a refresh token on the full consent screen, so ask for it the first time
  // (or when the server says it has no refresh token for this browser); otherwise just pick the account
  const [needsConsent, setNeedsConsent] = useState(() => !hasSignedInBefore());

  useEffect(() => {
    if (window.google?.accounts?.oauth2) return undefined;
    // Load Google Identity Services
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGoogleReady(Boolean(window.google?.accounts?.oauth2));
    script.onerror = () => setAuthError('Could not load Google sign-in. Check your connection and reload.');
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const handleCodeResponse = async (response) => {
    if (response?.error) {
      setIsSigningIn(false);
      setAuthError(response.error === 'access_denied' ? 'Sign-in was cancelled.' : (response.error_description || response.error));
      return;
    }
    if (!response?.code) {
      setIsSigningIn(false);
      setAuthError('Google did not return an authorization code.');
      return;
    }
    const oauth2 = window.google?.accounts?.oauth2;
    if (oauth2?.hasGrantedAllScopes && !oauth2.hasGrantedAllScopes(response, 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly')) {
      setIsSigningIn(false);
      setNeedsConsent(true);
      setAuthError('Calendar access is needed. Sign in again and tick both calendar boxes.');
      return;
    }

    try {
      const credential = await signIn(response.code);
      onLoginSuccess(credential);
    } catch (error) {
      setIsSigningIn(false);
      if (error?.code === 'consent_required') {
        setNeedsConsent(true);
        setAuthError('Google needs you to approve calendar access once more. Click Continue with Google again.');
      } else if (error?.code === 'not_allowed') {
        setAuthError('This Google account isn’t allowed to use this calendar. Try the demo instead.');
      } else if (error?.code === 'auth_not_configured') {
        setAuthError('Sign-in is not set up on the server (GOOGLE_CLIENT_SECRET / SESSION_SECRET).');
      } else {
        setAuthError('Google sign-in failed. Try again.');
      }
    }
  };

  const handleGoogleSignIn = () => {
    if (!isGoogleConfigured) {
      alert('Google OAuth is not configured locally. Add GOOGLE_CLIENT_ID to client/.env, then restart the frontend dev server.');
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      setAuthError('Google sign-in is still loading. Try again in a moment.');
      return;
    }

    setAuthError('');
    setIsSigningIn(true);
    // Built per click so the prompt matches the current need; requestCode() must run inside the click
    const codeClient = oauth2.initCodeClient({
      client_id: googleClientId,
      scope: SCOPES,
      ux_mode: 'popup',
      ...(needsConsent ? { prompt: 'consent' } : { select_account: true }),
      callback: handleCodeResponse,
      error_callback: (err) => {
        setIsSigningIn(false);
        if (err?.type !== 'popup_closed') setAuthError('The Google sign-in window could not open. Allow pop-ups and try again.');
      },
    });
    codeClient.requestCode();
  };

  const today = new Date();

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="px-6 sm:px-10 py-6 flex items-center justify-between text-sm text-muted">
        <span className="font-medium text-ink">Calendar</span>
        <span>{today.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </header>

      <main className="flex-1 flex items-center px-6 sm:px-10">
        <div className="w-full max-w-5xl mx-auto grid lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-20 items-center">
          <div>
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.02] tracking-tight">
              Your week,<br />
              <span className="italic text-accent">in plain words.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted leading-relaxed">
              See your Google Calendar at a glance, ask when things happened,
              and add plans by just typing them out.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                onClick={handleGoogleSignIn}
                disabled={!isGoogleConfigured || !isGoogleReady || isSigningIn}
                className="inline-flex shrink-0 whitespace-nowrap items-center justify-center gap-3 rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-paper hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-[18px] h-[18px] rounded-full bg-white p-[2px]" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              <p className="text-sm text-muted">
                {!isGoogleConfigured
                  ? 'Google client ID missing (set GOOGLE_CLIENT_ID).'
                  : !isGoogleReady
                  ? 'Loading Google sign-in…'
                  : isSigningIn
                  ? 'Signing you in…'
                  : 'Read & write access to your calendar.'}
              </p>
            </div>
            {(authError || notice) && (
              <p className="mt-4 text-sm text-accent" role="alert">{authError || notice}</p>
            )}
            <p className="mt-6 text-sm text-muted">
              Just looking?{' '}
              <a href="/?demo" className="text-ink underline underline-offset-4 decoration-line hover:decoration-ink transition-colors">
                Try the demo
              </a>
            </p>
          </div>

          {/* A quiet preview of what the app does */}
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_0_#E6E1D7,0_20px_40px_-24px_rgba(29,28,26,0.25)] rotate-[1.2deg]">
              <div className="flex items-baseline justify-between border-b border-line pb-4">
                <span className="font-serif text-3xl">{today.toLocaleDateString([], { weekday: 'long' })}</span>
                <span className="text-sm text-muted">{today.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex gap-3 rounded-md border-l-[3px] border-[#6E8F68] bg-[#E7EEE4] px-3 py-2 text-[#2E4A2A]"><span className="w-16 text-[#2E4A2A]/70">9:00 am</span>Morning run</li>
                <li className="flex gap-3 rounded-md border-l-[3px] border-[#5873A0] bg-[#E3E8F0] px-3 py-2 text-[#22324D]"><span className="w-16 text-[#22324D]/70">11:30 am</span>Design review</li>
                <li className="flex gap-3 rounded-md border-l-[3px] border-[#C4502B] bg-[#F4E4DA] px-3 py-2 text-[#6B2E17]"><span className="w-16 text-[#6B2E17]/70">7:00 pm</span>Dinner with John</li>
              </ul>
              <div className="mt-5 border-t border-line pt-4 space-y-2 text-sm">
                <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-paper">When was my last dentist visit?</p>
                <p className="w-fit rounded-2xl rounded-bl-md bg-paper px-3.5 py-2 text-ink-soft">March 1, at 3:00 PM — Dental checkup.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 sm:px-10 py-6 text-xs text-muted">
        Secure sign-in through Google. You stay signed in on this device until you sign out.
      </footer>
    </div>
  );
};

export default SignIn;
