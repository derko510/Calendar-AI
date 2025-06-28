import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import GoogleCalendar from '../components/GoogleCalendar';
import googleCalendarService from '../services/googleCalendar';
import '../styles/calendar.css';

const Dashboard = ({ userCredential }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    initializeCalendar();
  }, []);

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
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12 w-full h-full flex flex-col">
              <h3 className="text-2xl font-semibold text-gray-800 mb-8">
                Calendar Assistant
              </h3>
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="w-32 h-32 bg-gray-100 rounded-full mx-auto mb-8 flex items-center justify-center">
                    <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-lg">
                    Chat assistant coming soon
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;