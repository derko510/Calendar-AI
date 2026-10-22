import { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import GoogleAuthProvider from './components/GoogleAuthProvider';
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userCredential, setUserCredential] = useState(null);

  useEffect(() => {
    console.log('🔍 Checking for saved Google authentication...');
    //test
    // Check for Google auth in localStorage
    const savedAuth = localStorage.getItem('googleAuth');
    if (savedAuth) {
      try {
        const userData = JSON.parse(savedAuth);
        // Check if token is still valid (with some buffer time)
        if (userData.expiresAt && userData.expiresAt > Date.now()) {
          console.log('✅ Valid Google auth found on app load for token expiring at:', new Date(userData.expiresAt));
          setIsAuthenticated(true);
          setUserCredential(userData);
        } else {
          // Token expired, remove from storage
          console.log('⚠️ Google auth token expired, clearing...', new Date(userData.expiresAt || 0));
          localStorage.removeItem('googleAuth');
        }
      } catch (error) {
        console.error('Error parsing saved auth:', error);
        localStorage.removeItem('googleAuth');
      }
    } else {
      console.log('ℹ️ No saved Google authentication found');
    }
  }, []);

  const handleLoginSuccess = (credentialResponse) => {
    console.log('🔄 Login success, setting authentication state');
    setIsAuthenticated(true);
    setUserCredential(credentialResponse);
    
    // The JWT token will be saved by the authService during backend initialization
    console.log('✅ App authentication state updated');
  };

  return (
    <GoogleAuthProvider>
      <div className="App">
        {isAuthenticated ? (
          <Dashboard userCredential={userCredential} />
        ) : (
          <SignIn onLoginSuccess={handleLoginSuccess} />
        )}
        <Analytics />
        <SpeedInsights />
      </div>
    </GoogleAuthProvider>
  );
}

export default App;