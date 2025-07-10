import { format, isToday, startOfDay, setHours } from 'date-fns';

const DayView = ({ 
  currentDate, 
  events, 
  handleEventClick,
  handleEventMouseEnter,
  handleEventMouseLeave
}) => {
  const isTodayDate = isToday(currentDate);

  /**
   * Filters events that occur on the specified date.
   * @param {Date} date - The date to filter events for.
   * @returns {Object[]} Array of events occurring on the given date.
   */
  const getEventsForDate = (date) => {
    return events.filter(event => {
      let eventDate;
      if (event.start?.dateTime) {
        eventDate = new Date(event.start.dateTime);
      } else if (event.start?.date) {
        eventDate = new Date(event.start.date);
      } else if (event.start) {
        eventDate = new Date(event.start);
      } else {
        return false;
      }
      return eventDate.toDateString() === date.toDateString();
    });
  };

  /**
   * Calculates pixel position and height for event positioning.
   * @param {Date} startTime - Event start time.
   * @param {Date} endTime - Event end time.
   * @returns {Object} Object with top position and height in pixels.
   */
  const calculateEventPosition = (startTime, endTime) => {
    const cellHeight = 64; // h-16 = 4rem = 64px
    const startHour = startTime.getHours();
    const startMinute = startTime.getMinutes();
    const endHour = endTime.getHours();
    const endMinute = endTime.getMinutes();
    
    const startPosition = (startHour + startMinute / 60) * cellHeight;
    const endPosition = (endHour + endMinute / 60) * cellHeight;
    const duration = Math.max(endPosition - startPosition, 20);
    
    return {top: startPosition, height: duration};
  };

  /**
   * Determines background color for event based on its ID hash.
   * @param {string} eventId - The unique identifier for the event.
   * @returns {string} CSS background color class name.
   */
  const getEventColor = (eventId) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500',
      'bg-yellow-500', 'bg-indigo-500', 'bg-pink-500', 'bg-gray-500'
    ];
    const hash = eventId.charCodeAt(eventId.length - 1) || 0;
    return colors[hash % colors.length];
  };

  const dayEvents = getEventsForDate(currentDate);
  const hours = Array.from({length: 24}, (_, i) => i);

  // Calculate current time position for red line
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTimePosition = (currentHour * 64) + (currentMinutes / 60 * 64);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Fixed header with date */}
      <div className="flex border-b border-gray-300 bg-gray-50 sticky top-0 z-30">
        <div className="w-16 flex-shrink-0 border-r border-gray-300 bg-gray-50 flex items-center justify-center">
          <span className="text-xs text-gray-500 font-medium">Time</span>
        </div>
        <div className="flex-1 relative">
          <div className="p-6 text-center">
            <div className="text-sm font-semibold text-gray-900">
              {format(currentDate, 'EEEE')}
            </div>
            <div className={`text-lg mt-2 ${
              isTodayDate
                ? 'bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto font-medium'
                : 'text-gray-900 font-normal'
            }`}>
              {format(currentDate, 'd')}
            </div>
          </div>
          
          {/* All-day events in header */}
          <div className="px-4 pb-2 space-y-1">
            {dayEvents
              .filter(event => !event.start?.dateTime)
              .map((event, eventIndex) => (
                <div
                  key={`${event.id}-${eventIndex}`}
                  className="bg-blue-500 text-white text-xs p-2 rounded truncate cursor-pointer hover:bg-blue-600 transition-colors"
                  onClick={(e) => handleEventClick?.(event, e)}
                  onMouseEnter={(e) => handleEventMouseEnter?.(event, e)}
                  onMouseLeave={handleEventMouseLeave}
                >
                  {event.summary}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Time grid */}
      <div className="flex-1 bg-gray-50">
        <div className="flex bg-gray-50">
          {/* Time labels column */}
          <div className="w-16 flex-shrink-0 border-r border-gray-300 bg-gray-50">
            {hours.map(h => (
              <div
                key={h}
                className="h-16 flex items-center justify-center border-b border-gray-200 text-xs text-gray-600 font-medium"
              >
                {format(setHours(startOfDay(currentDate), h), 'ha')}
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className="flex-1 relative bg-gray-50">
            {hours.map(h => (
              <div
                key={h}
                className="h-16 border-b border-gray-200 cursor-pointer hover:bg-gray-100 relative bg-gray-50"
                title={format(setHours(currentDate, h), 'EEEE, MMM d yyyy HH:mm')}
              />
            ))}
            
            {/* Current time line - only show for today */}
            {isTodayDate && (
              <div
                className="absolute left-0 right-0 h-0.5 bg-red-500 z-20"
                style={{top: `${currentTimePosition}px`}}
              >
                <div className="absolute left-0 w-2 h-2 bg-red-500 rounded-full -mt-0.75"></div>
              </div>
            )}
            
            {/* Render timed events for this day */}
            {dayEvents
              .filter(event => event.start?.dateTime)
              .map((event, eventIndex) => {
                const eventStart = new Date(event.start.dateTime);
                const eventEnd = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(eventStart.getTime() + 60 * 60 * 1000);
                const position = calculateEventPosition(eventStart, eventEnd);
                const colorClass = getEventColor(event.id);
                
                return (
                  <div
                    key={`${event.id}-${eventIndex}`}
                    className={`absolute left-2 right-2 ${colorClass} text-white text-sm p-2 rounded z-10 cursor-pointer hover:opacity-90 transition-opacity`}
                    style={{
                      top: `${position.top}px`,
                      height: `${position.height}px`
                    }}
                    onClick={(e) => handleEventClick?.(event, e)}
                    onMouseEnter={(e) => handleEventMouseEnter?.(event, e)}
                    onMouseLeave={handleEventMouseLeave}
                    aria-label={`${event.summary} from ${format(eventStart, 'HH:mm')} to ${format(eventEnd, 'HH:mm')}`}
                  >
                    <div className="font-medium truncate">
                      {event.summary}
                    </div>
                    <div className="opacity-90 text-xs">
                      {format(eventStart, 'HH:mm')} - {format(eventEnd, 'HH:mm')}
                    </div>
                    {event.location && (
                      <div className="opacity-90 text-xs truncate">
                        📍 {event.location}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayView;