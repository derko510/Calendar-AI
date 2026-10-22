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
        
        const calendarEvents = await googleCalendarService.getAllCalendarEvents(
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

  const handleEventsDeleted = (deletedIds) => {
    const deletedIdSet = new Set(deletedIds);
    setEvents(prevEvents => prevEvents.filter(event => !deletedIdSet.has(event.id)));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <p className="font-serif italic text-3xl text-muted animate-pulse">Opening your calendar…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper p-3 sm:p-4 lg:p-5 flex flex-col">
      {/* Error Display */}
      {error && (
        <div className="mb-4 w-full max-w-3xl mx-auto rounded-xl border border-accent/30 bg-accent-soft px-5 py-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <p className="text-sm text-[#6B2E17] text-center">{error}</p>
          {error.includes('expired') && (
            <div>
              <button
                onClick={handleTokenExpiredRetry}
                className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft transition-colors"
              >
                Sign In Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Grid - Calendar + Future Chatbot Space */}
      <div className="w-full max-w-[120rem] mx-auto flex-1 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] gap-3 lg:gap-4 lg:h-[calc(100vh-2.5rem)]">
          {/* Calendar Section */}
          <div className="h-[78vh] lg:h-full min-h-0">
            <GoogleCalendar
              events={events}
              loading={loading}
              onDateSelect={(date) => console.log('Selected date:', date)}
              onEventClick={(event) => console.log('Clicked event:', event)}
              onSignOut={handleSignOut}
              userCredential={userCredential}
              onDeleteEvent={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
            />
          </div>

          {/* Chatbot/Sidebar Space */}
          <div className="h-[78vh] lg:h-full min-h-0">
            <div className="h-full">
              {authLoading ? (
                <div className="bg-surface rounded-2xl border border-line h-full" />
              ) : backendAuth ? (
                <RAGChatBot backendAuth={backendAuth} />
              ) : (
                <RealCalendarBot
                  userCredential={userCredential}
                  events={events}
                  onEventsDeleted={handleEventsDeleted}
                  onEventsCreated={(newEvents) => setEvents(prev => [...prev, ...newEvents])}
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
