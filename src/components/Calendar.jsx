import { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import { ChevronLeft, ChevronRight, Clock, MapPin, Users } from 'lucide-react';
import { formatEventTime, formatEventDate, getEventsForDate, groupEventsByDate } from '../utils/dateUtils';
import clsx from 'clsx';
import 'react-calendar/dist/Calendar.css';

const CalendarComponent = ({ events = [], loading = false, onDateSelect, onEventClick }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [groupedEvents, setGroupedEvents] = useState({});

  useEffect(() => {
    setGroupedEvents(groupEventsByDate(events));
  }, [events]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  const selectedDateEvents = getEventsForDate(events, selectedDate);

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;
    
    const dateKey = date.toISOString().split('T')[0];
    const dayEvents = groupedEvents[dateKey] || [];
    
    if (dayEvents.length === 0) return null;
    
    return (
      <div className="flex justify-center mt-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
      </div>
    );
  };

  const tileClassName = ({ date, view }) => {
    if (view !== 'month') return '';
    
    const dateKey = date.toISOString().split('T')[0];
    const dayEvents = groupedEvents[dateKey] || [];
    
    return clsx(
      'hover:bg-blue-50 transition-colors',
      dayEvents.length > 0 && 'font-semibold'
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-7 gap-2 mb-4">
            {Array(35).fill(0).map((_, i) => (
              <div key={i} className="h-10 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Calendar</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setView('month')}
              className={clsx(
                'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                view === 'month'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={clsx(
                'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                view === 'week'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Week
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <Calendar
              onChange={handleDateChange}
              value={selectedDate}
              tileContent={tileContent}
              tileClassName={tileClassName}
              className="react-calendar-custom w-full border-0"
              prevLabel={<ChevronLeft size={20} />}
              nextLabel={<ChevronRight size={20} />}
              prev2Label={null}
              next2Label={null}
            />
          </div>

          {/* Selected Date Events */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {formatEventDate(selectedDate.toISOString())}
            </h3>
            
            {selectedDateEvents.length === 0 ? (
              <p className="text-gray-500 text-sm">No events scheduled</p>
            ) : (
              <div className="space-y-3">
                {selectedDateEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => onEventClick?.(event)}
                    className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <h4 className="font-medium text-gray-800 text-sm mb-1">
                      {event.summary || 'Untitled Event'}
                    </h4>
                    
                    <div className="flex items-center text-xs text-gray-600 mb-1">
                      <Clock size={12} className="mr-1" />
                      {event.start?.dateTime ? (
                        <span>
                          {formatEventTime(event.start.dateTime)}
                          {event.end?.dateTime && ` - ${formatEventTime(event.end.dateTime)}`}
                        </span>
                      ) : (
                        <span>All day</span>
                      )}
                    </div>

                    {event.location && (
                      <div className="flex items-center text-xs text-gray-600 mb-1">
                        <MapPin size={12} className="mr-1" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}

                    {event.attendees && event.attendees.length > 0 && (
                      <div className="flex items-center text-xs text-gray-600">
                        <Users size={12} className="mr-1" />
                        <span>{event.attendees.length} attendees</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarComponent;