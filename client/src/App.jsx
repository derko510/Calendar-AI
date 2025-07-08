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
    // Check for Google auth in localStorage
    const savedAuth = localStorage.getItem('googleAuth');
    if (savedAuth) {
      try {
        const userData = JSON.parse(savedAuth);
        // Check if token is still valid (with some buffer time)
        if (userData.expiresAt && userData.expiresAt > Date.now()) {
          setIsAuthenticated(true);
          setUserCredential(userData);
        } else {
          // Token expired, remove from storage
          localStorage.removeItem('googleAuth');
        }
      } catch (error) {
        console.error('Error parsing saved auth:', error);
        localStorage.removeItem('googleAuth');
      }
    }
  }, []);

  const handleLoginSuccess = (credentialResponse) => {
    setIsAuthenticated(true);
    setUserCredential(credentialResponse);
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