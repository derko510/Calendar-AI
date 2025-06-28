import { useState, useEffect } from 'react';
import axios from 'axios';

const Dashboard = ({ userCredential }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCalendarEvents();
  }, []);

  const fetchCalendarEvents = async () => {
    try {
      setLoading(true);
      // For now, we'll create mock data until backend is set up
      const mockEvents = [
        {
          id: '1',
          summary: 'Team Meeting',
          start: { dateTime: '2025-06-28T10:00:00Z' },
          end: { dateTime: '2025-06-28T11:00:00Z' },
          description: 'Weekly team sync meeting'
        },
        {
          id: '2',
          summary: 'Doctor Appointment',
          start: { dateTime: '2025-06-29T14:00:00Z' },
          end: { dateTime: '2025-06-29T15:00:00Z' },
          description: 'Annual checkup'
        },
        {
          id: '3',
          summary: 'Lunch with Sarah',
          start: { dateTime: '2025-06-30T12:00:00Z' },
          end: { dateTime: '2025-06-30T13:30:00Z' },
          description: 'Catch up lunch'
        }
      ];
      
      setTimeout(() => {
        setEvents(mockEvents);
        setLoading(false);
      }, 1000);
    } catch (err) {
      setError('Failed to fetch calendar events');
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('googleCredential');
    window.location.reload();
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading your calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Calendar AI</h1>
              <p className="text-gray-600">Your intelligent calendar assistant</p>
            </div>
            <button
              onClick={handleSignOut}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition duration-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Calendar Events List */}
            <div className="lg:col-span-2">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Upcoming Events</h2>
                  
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                      <p className="text-red-600">{error}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {events.map((event) => (
                      <div key={event.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition duration-200">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-medium text-gray-900">{event.summary}</h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {formatDate(event.start.dateTime)} - {formatDate(event.end.dateTime)}
                            </p>
                            {event.description && (
                              <p className="text-sm text-gray-500 mt-2">{event.description}</p>
                            )}
                          </div>
                          <div className="ml-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              Event
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {events.length === 0 && !error && (
                    <div className="text-center py-8">
                      <p className="text-gray-500">No upcoming events found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Calendar Preview/Chat Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
                  
                  <div className="space-y-3">
                    <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition duration-200">
                      Create New Event
                    </button>
                    <button className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md transition duration-200">
                      View Full Calendar
                    </button>
                    <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition duration-200">
                      Chat with AI
                    </button>
                  </div>

                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h3 className="text-sm font-medium text-blue-900 mb-2">Calendar Stats</h3>
                    <div className="space-y-1 text-sm text-blue-700">
                      <p>Total Events: {events.length}</p>
                      <p>This Week: {events.length}</p>
                      <p>Next Event: {events.length > 0 ? 'Today' : 'None'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;