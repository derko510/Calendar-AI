import { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import GoogleAuthProvider from './components/GoogleAuthProvider';
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';
import authService from './services/authService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userCredential, setUserCredential] = useState(null);

  useEffect(() => {
    const checkAuthentication = async () => {
      console.log('🔍 Checking authentication on app load...');
      
      // Force authService to reload token from storage
      await authService.loadTokenFromStorage();
      
      // Check for JWT authentication first
      if (authService.isAuthenticated && authService.userSession) {
        console.log('✅ JWT authentication found on app load');
        setIsAuthenticated(true);
        // Create a compatible user credential object for Dashboard
        setUserCredential({
          accessToken: authService.userSession.accessToken || 'jwt-managed',
          expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
          profile: authService.userSession
        });
        return;
      }

      // Fallback: Check for old Google auth
      const savedAuth = localStorage.getItem('googleAuth');
      if (savedAuth) {
        try {
          const userData = JSON.parse(savedAuth);
          // Check if token is still valid
          if (userData.expiresAt && userData.expiresAt > Date.now()) {
            console.log('✅ Legacy Google auth found on app load');
            setIsAuthenticated(true);
            setUserCredential(userData);
          } else {
            // Token expired, remove from storage
            console.log('⚠️ Legacy Google auth expired, clearing...');
            localStorage.removeItem('googleAuth');
          }
        } catch (error) {
          console.error('Error parsing saved auth:', error);
          localStorage.removeItem('googleAuth');
        }
      }
      
      console.log('ℹ️ No valid authentication found, staying on sign-in page');
    };
    
    checkAuthentication();
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