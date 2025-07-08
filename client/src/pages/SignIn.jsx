import { useEffect } from 'react';

const SignIn = ({ onLoginSuccess }) => {
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
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: () => {}, // Not used for auth code flow
      });
    }
  };

  const handleGoogleSignIn = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    
    // Try different redirect URI formats to match Google Console
    const currentOrigin = window.location.origin;
    const redirectUri = currentOrigin.endsWith('/') ? currentOrigin.slice(0, -1) : currentOrigin;
    
    const scope = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
    
    // Use authorization code flow
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `response_type=token&` +
      `include_granted_scopes=true&` +
      `state=calendar_auth`;
    
    window.location.href = authUrl;
  };

  // Check for OAuth callback in URL
  useEffect(() => {
    // Check for error in URL first
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    
    if (error) {
      console.error('OAuth Error:', error);
      console.error('Error Description:', errorDescription);
      alert(`Authentication failed: ${error}\n${errorDescription}`);
      return;
    }
    
    // Check for success callback in hash
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const expiresIn = hashParams.get('expires_in');
    const state = hashParams.get('state');
    const tokenType = hashParams.get('token_type');
    const scope = hashParams.get('scope');
    
    if (accessToken && state === 'calendar_auth') {
      const expiresAt = Date.now() + (parseInt(expiresIn) * 1000);
      
      const userData = {
        accessToken,
        expiresAt,
        tokenType,
        scope,
        profile: {
          // We'll get profile info after successful auth
        }
      };

      localStorage.setItem('googleAuth', JSON.stringify(userData));
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      onLoginSuccess(userData);
    }
  }, [onLoginSuccess]);



  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="flex items-center justify-center w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center max-w-md w-full mx-4">
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-gray-800 mb-4">
              Login
            </h1>
            <p className="text-gray-500 text-base">
              Access your calendar with Google
            </p>
          </div>
          
          <div className="flex justify-center items-center mb-8">
            <button
              onClick={handleGoogleSignIn}
              className="inline-flex items-center px-6 py-3 border border-gray-300 rounded-lg shadow-sm bg-white text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
          
          <div>
            <p className="text-sm text-gray-400">
              Secure authentication via Google OAuth
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;