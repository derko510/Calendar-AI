import { useEffect, useRef, useState } from 'react';

const SignIn = ({ onLoginSuccess }) => {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isGoogleConfigured = Boolean(googleClientId && googleClientId !== 'your-google-client-id');
  const tokenClientRef = useRef(null);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Load Google Identity Services
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleAuth;
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const initializeGoogleAuth = () => {
    if (window.google && isGoogleConfigured) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        callback: handleTokenResponse,
      });
      setIsGoogleReady(true);
    }
  };

  const handleTokenResponse = async (tokenResponse) => {
    if (tokenResponse?.error) {
      setAuthError(tokenResponse.error_description || tokenResponse.error);
      return;
    }

    if (!tokenResponse?.access_token) {
      setAuthError('Google did not return an access token.');
      return;
    }

    try {
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
        },
      });

      const profile = profileResponse.ok ? await profileResponse.json() : {};
      const expiresAt = Date.now() + Number(tokenResponse.expires_in || 3600) * 1000;
      const userData = {
        accessToken: tokenResponse.access_token,
        expiresAt,
        tokenType: tokenResponse.token_type || 'Bearer',
        scope: tokenResponse.scope,
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        profile,
      };

      localStorage.setItem('googleAuth', JSON.stringify(userData));
      onLoginSuccess(userData);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      setAuthError('Google sign-in worked, but profile loading failed. Try again.');
    }
  };

  const handleGoogleSignIn = () => {
    if (!isGoogleConfigured) {
      alert('Google OAuth is not configured locally. Add VITE_GOOGLE_CLIENT_ID to client/.env, then restart the frontend dev server.');
      return;
    }

    if (!tokenClientRef.current) {
      setAuthError('Google sign-in is still loading. Try again in a moment.');
      return;
    }

    setAuthError('');
    tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
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
                disabled={!isGoogleConfigured || !isGoogleReady}
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
                  ? 'Google client ID missing (VITE_GOOGLE_CLIENT_ID).'
                  : !isGoogleReady
                  ? 'Loading Google sign-in…'
                  : 'Read & write access to your calendar.'}
              </p>
            </div>
            {authError && (
              <p className="mt-4 text-sm text-accent">{authError}</p>
            )}
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
        Secure sign-in through Google. Sign out anytime.
      </footer>
    </div>
  );
};

export default SignIn;
