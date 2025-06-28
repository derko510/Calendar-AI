import { useState, useEffect } from 'react';
import GoogleAuthProvider from './components/GoogleAuthProvider';
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userCredential, setUserCredential] = useState(null);

  useEffect(() => {
    const savedCredential = localStorage.getItem('googleCredential');
    if (savedCredential) {
      setIsAuthenticated(true);
      setUserCredential(savedCredential);
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