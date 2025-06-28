import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import CalendarComponent from '../components/Calendar';
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
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">My Google Calendar</h1>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Just the Calendar */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <CalendarComponent
          events={events}
          loading={loading}
          onDateSelect={(date) => console.log('Selected date:', date)}
          onEventClick={(event) => console.log('Clicked event:', event)}
        />
      </main>
    </div>
  );
};

export default Dashboard;