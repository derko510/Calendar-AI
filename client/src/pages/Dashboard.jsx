import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import GoogleCalendar from '../components/GoogleCalendar';
import RAGChatBot from '../components/RAGChatBot';
import RealCalendarBot from '../components/RealCalendarBot';
import googleCalendarService from '../services/googleCalendar';
import authService from '../services/authService';
import '../styles/calendar.css';

const Dashboard = ({ userCredential }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backendAuth, setBackendAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    initializeCalendar();
  }, []);

  useEffect(() => {
    // Skip backend authentication for now - just use direct Google token access
    console.log('ℹ️ Skipping backend authentication - using direct Google token access');
    setAuthLoading(false);
    setBackendAuth(false); // Use RealCalendarBot instead of RAGChatBot
  }, [userCredential]);

  const initializeBackendAuth = async (credentialOverride = null) => {
    try {
      setAuthLoading(true);
      const credential = credentialOverride || userCredential;
      
      console.log('🔄 Establishing backend session...');
      console.log('📝 User credential data:', {
        hasAccessToken: !!credential?.accessToken,
        tokenLength: credential?.accessToken?.length,
        hasExpiresAt: !!credential?.expiresAt,
        isExpired: credential?.expiresAt ? Date.now() > credential.expiresAt : 'unknown',
        timeUntilExpiry: credential?.expiresAt ? Math.max(0, credential.expiresAt - Date.now()) : 'unknown',
        isJWTManaged: credential?.accessToken === 'jwt-managed'
      });
      
      // If we already have a JWT token, just set backend auth to true
      if (authService.isAuthenticated && authService.jwtToken) {
        console.log('✅ Using existing JWT authentication');
        setBackendAuth(true);
        return;
      }
      
      const result = await authService.initializeBackendSession(credential);
      console.log('✅ Backend authentication established:', result);
      setBackendAuth(true);
    } catch (error) {
      console.error('❌ Backend authentication failed:', error);
      setBackendAuth(false);
      
      // If token is expired, show a helpful message
      if (error.message.includes('expired') || error.message.includes('invalid')) {
        setError('Your Google access token has expired. Please sign out and sign in again to continue.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const initializeCalendar = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading Google Calendar data...');
      
      if (userCredential && userCredential.accessToken) {
        console.log('✅ Access token found, fetching calendar events');
        googleCalendarService.setAccessToken(userCredential.accessToken);
        
        // Get events from the past 3 months to next 3 months
        const timeMin = new Date();
        timeMin.setMonth(timeMin.getMonth() - 3);
        const timeMax = new Date();
        timeMax.setMonth(timeMax.getMonth() + 3);
        
        const calendarEvents = await googleCalendarService.getEvents(
          'primary',
          timeMin.toISOString(),
          timeMax.toISOString(),
          250
        );
        
        console.log('📅 Google Calendar events loaded:', calendarEvents.length, 'events');
        setEvents(calendarEvents);
        setError(null);

        // Note: Backend sync removed for simple mode
      } else {
        console.error('❌ No access token available');
        setError('No access token available. Please sign in again.');
      }
      
      setLoading(false);
    } catch (err) {
      console.error('❌ Failed to load calendar events:', err);
      
      // Check if it's a token expiration error
      if (err.message.includes('401') || err.message.includes('Unauthorized') || err.message.includes('invalid_token')) {
        setError('Your Google access token has expired. Please sign out and sign in again to continue.');
        // Clear expired token
        localStorage.removeItem('googleAuth');
      } else {
        setError(`Failed to load calendar: ${err.message}`);
      }
      
      setLoading(false);
    }
  };

  // Removed sync function for simple mode


  const handleSignOut = () => {
    // Clear all authentication data
    localStorage.removeItem('googleAuth');
    localStorage.removeItem('googleCredential');
    console.log('🔄 Signing out - cleared all localStorage data');
    window.location.reload();
  };

  const handleTokenExpiredRetry = () => {
    // Clear expired tokens and force re-authentication
    localStorage.removeItem('googleAuth');
    localStorage.removeItem('googleCredential');
    console.log('🔄 Retrying authentication - cleared all localStorage data');
    setError(null);
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 text-lg">Loading your Google Calendar...</p>
        </div>
      </div>
    );
  }

  const handleEventsCreated = (newEvents = []) => {
    if (!Array.isArray(newEvents) || newEvents.length === 0) return;
    setEvents((prev) => [...prev, ...newEvents]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-12">
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 mb-12 max-w-6xl mx-auto">
          <p className="text-red-600 text-center text-xl">{error}</p>
          {error.includes('expired') && (
            <div className="mt-4 text-center">
              <button
                onClick={handleTokenExpiredRetry}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Grid - Calendar + Future Chatbot Space */}
      <div className="max-w-[120rem] mx-auto h-[calc(100vh-6rem)]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 h-full">
          {/* Calendar Section */}
          <div className="lg:col-span-2 h-full">
            <GoogleCalendar
              events={events}
              loading={loading}
              onDateSelect={(date) => console.log('Selected date:', date)}
              onEventClick={(event) => console.log('Clicked event:', event)}
              onSignOut={handleSignOut}
            />
          </div>

          {/* Chatbot/Sidebar Space */}
          <div className="lg:col-span-1 h-full">
            <div className="sticky top-12 h-[calc(100vh-6rem)]">
              {authLoading ? (
                <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-gray-600">Setting up chatbot...</p>
                  </div>
                </div>
              ) : backendAuth ? (
                <RAGChatBot backendAuth={backendAuth} />
              ) : (
                <RealCalendarBot
                  userCredential={userCredential}
                  events={events}
                  onEventsCreated={handleEventsCreated}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;