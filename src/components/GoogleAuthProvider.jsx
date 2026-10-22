import { GoogleOAuthProvider } from '@react-oauth/google';

const GoogleAuthProvider = ({ children }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id';
  
  console.log('Google Client ID:', clientId); // Debug log
  
  return (
    <GoogleOAuthProvider 
      clientId={clientId}
      onScriptLoadError={() => console.log('Script load error')}
      onScriptLoadSuccess={() => console.log('Script loaded successfully')}
    >
      {children}
    </GoogleOAuthProvider>
  );
};

export default GoogleAuthProvider;