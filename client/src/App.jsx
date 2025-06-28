import { useState, useEffect } from 'react';
import GoogleAuthProvider from './components/GoogleAuthProvider';
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userCredential, setUserCredential] = useState(null);

  useEffect(() => {
    const savedAuth = localStorage.getItem('googleAuth');
    if (savedAuth) {
      try {
        const userData = JSON.parse(savedAuth);
        // Check if token is still valid
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
      </div>
    </GoogleAuthProvider>
  );
}

export default App;