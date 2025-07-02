import { format, startOfWeek, addDays, isSameDay, setHours, startOfDay } from 'date-fns';
import { getEventsForDate } from '../utils/dateUtils';

const WeekView = ({ 
  currentDate, 
  events, 
  handleDateClick, 
  handleEventClick 
}) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Calculate current time position
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTimePosition = (currentHour * 64) + (currentMinutes / 60 * 64);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Fixed header with weekdays - completely static */}
      <div className="flex border-b border-gray-300 bg-white z-30 flex-shrink-0">
        <div className="w-16 flex-shrink-0 border-r border-gray-300 bg-gray-50 flex items-center justify-center">
          <span className="text-xs text-gray-500 font-medium">Time</span>
        </div>
        {weekdays.map((weekday, index) => (
          <div key={weekday} className="flex-1 border-r border-gray-200 last:border-r-0 relative">
            <div className="p-3 text-center">
              <div className="text-sm font-semibold text-gray-900">{weekday}</div>
              <div className="text-xs text-gray-500 mt-1">
                {format(days[index], 'MMM d')}
              </div>
            </div>
            
            {/* All-day events in header */}
            <div className="px-1 pb-2 space-y-1">
              {getEventsForDate(events, days[index])
                .filter(event => !event.start?.dateTime)
                .map((event, eventIndex) => (
                  <div
                    key={`${event.id}-${eventIndex}`}
                    className="bg-blue-500 text-white text-xs p-1 rounded truncate cursor-pointer hover:bg-blue-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEventClick(event, e);
                    }}
                  >
                    {event.summary}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Single scrollable time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex">
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

          {/* Day columns */}
          {days.map((day) => (
            <div
              key={day}
              className="flex-1 border-r border-gray-200 last:border-r-0 relative bg-white"
            >
              {hours.map(h => (
                <div
                  key={h}
                  className="h-16 border-b border-gray-200 cursor-pointer hover:bg-blue-50 relative bg-white"
                  onClick={() => handleDateClick(setHours(day, h))}
                />
              ))}
              
              {/* Current time line - only show for today */}
              {isSameDay(day, now) && (
                <div
                  className="absolute left-0 right-0 h-0.5 bg-red-500 z-20"
                  style={{ top: `${currentTimePosition}px` }}
                >
                  <div className="absolute left-0 w-2 h-2 bg-red-500 rounded-full -mt-0.75"></div>
                </div>
              )}
              
              {/* Render timed events for this day */}
              {getEventsForDate(events, day)
                .filter(event => event.start?.dateTime)
                .map((event, eventIndex) => {
                  // Timed events - position by hour
                  const startTime = new Date(event.start.dateTime);
                  const endTime = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(startTime.getTime() + 60 * 60 * 1000);
                  const startHour = startTime.getHours();
                  const startMinutes = startTime.getMinutes();
                  const duration = (endTime - startTime) / (1000 * 60 * 60); // duration in hours
                  
                  const topPosition = (startHour * 64) + (startMinutes / 60 * 64); // 64px per hour
                  const height = Math.max(duration * 64, 20); // minimum 20px height
                  
                  return (
                    <div
                      key={`${event.id}-${eventIndex}`}
                      className="absolute left-1 right-1 bg-blue-500 text-white text-xs p-1 rounded z-10 cursor-pointer hover:bg-blue-600 transition-colors"
                      style={{
                        top: `${topPosition}px`,
                        height: `${height}px`
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event, e);
                      }}
                    >
                      <div className="font-medium truncate">{event.summary}</div>
                      <div className="text-xs opacity-90">
                        {format(startTime, 'HH:mm')}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekView;