import { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import GoogleAuthProvider from './components/GoogleAuthProvider';
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';
import * as auth from './services/auth';

// ?demo opens the app on a built-in sample calendar with no Google sign-in
const isDemo = new URLSearchParams(window.location.search).has('demo');

function App() {
  if (isDemo) {
    return (
      <div className="App">
        <Dashboard demo userCredential={null} onSignOut={() => { window.location.href = '/'; }} />
      </div>
    );
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  // 'loading' while the session cookie is checked, then 'signedIn' or 'signedOut'
  const [status, setStatus] = useState('loading');
  const [userCredential, setUserCredential] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    auth.restoreSession()
      .then(cred => {
        if (!active) return;
        setUserCredential(cred);
        setStatus(cred ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (!active) return;
        setNotice('Could not reach the server to restore your session. Try signing in again.');
        setStatus('signedOut');
      });
    // The refresh token was revoked or expired mid-session: back to the sign-in page
    const unsubscribe = auth.onSignedOut(() => {
      setUserCredential(null);
      setNotice('Your Google session ended. Please sign in again.');
      setStatus('signedOut');
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleLoginSuccess = (cred) => {
    setNotice('');
    setUserCredential(cred);
    setStatus('signedIn');
  };

  const handleSignOut = async () => {
    await auth.signOut();
    setUserCredential(null);
    setNotice('');
    setStatus('signedOut');
  };

  return (
    <GoogleAuthProvider>
      <div className="App">
        {status === 'loading' ? (
          <div className="min-h-screen bg-paper flex items-center justify-center" aria-busy="true">
            <p className="font-serif italic text-3xl text-muted animate-pulse">Opening your calendar…</p>
          </div>
        ) : status === 'signedIn' ? (
          <Dashboard userCredential={userCredential} onSignOut={handleSignOut} />
        ) : (
          <SignIn onLoginSuccess={handleLoginSuccess} notice={notice} />
        )}
        <Analytics />
        <SpeedInsights />
      </div>
    </GoogleAuthProvider>
  );
}

export default App;