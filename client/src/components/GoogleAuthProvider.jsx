import { GoogleOAuthProvider } from '@react-oauth/google';

const GoogleAuthProvider = ({ children }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id';
  
  return (
    <GoogleOAuthProvider 
      clientId={clientId}
      onScriptLoadError={() => console.error('Google sign-in script failed to load')}
    >
      {children}
    </GoogleOAuthProvider>
  );
};

export default GoogleAuthProvider;