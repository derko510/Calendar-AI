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
    // Initialize backend session when user credential is available
    if (userCredential && userCredential.accessToken) {
      initializeBackendAuth();
    } else {
      setAuthLoading(false);
    }
  }, [userCredential]);

  const initializeBackendAuth = async () => {
    try {
      setAuthLoading(true);
      console.log('🔄 Establishing backend session...');
      await authService.initializeBackendSession(userCredential);
      console.log('✅ Backend authentication established');
      setBackendAuth(true);
    } catch (error) {
      console.error('❌ Backend authentication failed:', error);
      setBackendAuth(false);
      // Don't show error to user for now, RAG features just won't work
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
      setError(`Failed to load calendar: ${err.message}`);
      setLoading(false);
    }
  };

  // Removed sync function for simple mode


  const handleSignOut = () => {
    localStorage.removeItem('googleAuth');
    localStorage.removeItem('googleCredential');
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

  return (
    <div className="min-h-screen bg-gray-50 p-12">
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 mb-12 max-w-6xl mx-auto">
          <p className="text-red-600 text-center text-xl">{error}</p>
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
                <RealCalendarBot userCredential={userCredential} events={events} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;