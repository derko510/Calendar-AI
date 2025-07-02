import React, {useState} from 'react';
import {format,startOfWeek,addDays,startOfDay,setHours,isToday} from 'date-fns';

/**
 * WeekView displays a 7-day week grid with time slots from 0-23.
 * Replicates Google Calendar's week view with precise positioning and styling.
 * @param {Object} props - Component props.
 * @param {Date} props.currentDate - The date to display the week for.
 * @param {Object[]} props.events - Array of event objects with id, summary, start, end.
 * @param {Function} props.handleDateClick - Callback when a time slot cell is clicked.
 * @param {Function} [props.handleEventClick] - Optional callback when event is clicked.
 * @returns {Element} The week view calendar grid component.
 */
const WeekView = ({
  currentDate,
  events = [],
  handleDateClick,
  handleEventClick
}) => {
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: ''
  });
  /**
   * Gets the start of the current week (Sunday) based on currentDate.
   * @returns {Date} The Sunday date that starts the current week.
   */
  const getWeekStart = () => {
    return startOfWeek(currentDate, {weekStartsOn: 0});
  };

  /**
   * Generates array of 7 consecutive days starting from week start.
   * @returns {Date[]} Array of Date objects for each day of the week.
   */
  const getWeekDays = () => {
    const weekStart = getWeekStart();
    return Array.from({length: 7}, (_, i) => addDays(weekStart, i));
  };

  /**
   * Generates array of 24 hours (0-23) for time grid rows.
   * @returns {number[]} Array of hour numbers from 0 to 23.
   */
  const getHours = () => {
    return Array.from({length: 24}, (_, i) => i);
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

  /**
   * Filters events that occur on the specified date.
   * @param {Date} date - The date to filter events for.
   * @returns {Object[]} Array of events occurring on the given date.
   */
  const getEventsForDate = (date) => {
    return events.filter(event => {
      let eventDate;
      if (event.start?.dateTime) {
        // Timed events
        eventDate = new Date(event.start.dateTime);
      } else if (event.start?.date) {
        // All-day events
        eventDate = new Date(event.start.date);
      } else if (event.start) {
        // Fallback for direct Date objects
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
   * Formats cell title for accessibility with full date and time.
   * @param {Date} date - The date for the cell.
   * @param {number} hour - The hour for the cell.
   * @returns {string} Formatted title string for accessibility.
   */
  const getCellTitle = (date, hour) => {
    const dateTime = setHours(date, hour);
    return format(dateTime, 'EEEE, MMM d yyyy HH:mm');
  };

  /**
   * Handles click on event block, prevents propagation and calls callback.
   * @param {Object} event - The event object that was clicked.
   * @param {Event} e - The DOM click event.
   */
  const handleEventClickInternal = (event, e) => {
    e.stopPropagation();
    if (handleEventClick) {
      handleEventClick(event, e);
    }
  };

  /**
   * Shows tooltip on event hover with time and description.
   * @param {Object} event - The event object being hovered.
   * @param {Event} e - The DOM mouse event.
   */
  const handleEventMouseEnter = (event, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const eventStart = new Date(event.start?.dateTime || event.start?.date || event.start);
    const eventEnd = event.end?.dateTime 
      ? new Date(event.end.dateTime) 
      : new Date(eventStart.getTime() + 60 * 60 * 1000);
    
    const timeRange = `${format(eventStart, 'h:mm a')} - ${format(eventEnd, 'h:mm a')}`;
    const description = event.description || 'No description';
    
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      content: `${timeRange}\n${description}`
    });
  };

  /**
   * Hides tooltip when mouse leaves event.
   */
  const handleEventMouseLeave = () => {
    setTooltip({ visible: false, x: 0, y: 0, content: '' });
  };

  // Calculate current time position for red line
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTimePosition = (currentHour * 64) + (currentMinutes / 60 * 64);

  const weekDays = getWeekDays();
  const hours = getHours();
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Fixed header with weekdays */}
      <div className="flex border-b border-gray-300 bg-gray-50 sticky top-0 z-30">
        <div className="w-16 flex-shrink-0 border-r border-gray-300 bg-gray-50 flex items-center justify-center">
          <span className="text-xs text-gray-500 font-medium">Time</span>
        </div>
        {weekdays.map((weekday, index) => (
          <div key={weekday} className="flex-1 border-r border-gray-200 last:border-r-0 relative">
            <div className="p-3 text-center">
              <div className="text-sm font-semibold text-gray-900">{weekday}</div>
              <div className="text-xs text-gray-500 mt-1">
                {format(weekDays[index], 'MMM d')}
              </div>
            </div>
            
            {/* All-day events in header */}
            <div className="px-1 pb-2 space-y-1">
              {getEventsForDate(weekDays[index])
                .filter(event => !event.start?.dateTime)
                .map((event, eventIndex) => (
                  <div
                    key={`${event.id}-${eventIndex}`}
                    className="bg-blue-500 text-white text-xs p-1 rounded truncate cursor-pointer hover:bg-blue-600 transition-colors"
                    onClick={(e) => handleEventClickInternal(event, e)}
                    onMouseEnter={(e) => handleEventMouseEnter(event, e)}
                    onMouseLeave={handleEventMouseLeave}
                  >
                    {event.summary}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid with full page scroll */}
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

          {/* Day columns */}
          {weekDays.map((date, dayIndex) => {
            const dayEvents = getEventsForDate(date);
            const isTodayDate = isToday(date);
            
            return (
              <div
                key={`day-${dayIndex}`}
                className="flex-1 border-r border-gray-200 last:border-r-0 relative bg-gray-50"
              >
                {hours.map(h => (
                  <div
                    key={h}
                    className="h-16 border-b border-gray-200 cursor-pointer hover:bg-gray-100 relative bg-gray-50"
                    onClick={() => handleDateClick(setHours(date, h))}
                    title={getCellTitle(date, h)}
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
                        className={`absolute left-1 right-1 ${colorClass} text-white text-xs p-1 rounded z-10 cursor-pointer hover:opacity-90 transition-opacity`}
                        style={{
                          top: `${position.top}px`,
                          height: `${position.height}px`
                        }}
                        onClick={(e) => handleEventClickInternal(event, e)}
                        onMouseEnter={(e) => handleEventMouseEnter(event, e)}
                        onMouseLeave={handleEventMouseLeave}
                        aria-label={`${event.summary} from ${format(eventStart, 'HH:mm')} to ${format(eventEnd, 'HH:mm')}`}
                      >
                        <div className="font-medium truncate">
                          {event.summary}
                        </div>
                        <div className="opacity-90">
                          {format(eventStart, 'HH:mm')}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Custom Tooltip */}
      {tooltip.visible && (
        <div
          className="fixed bg-gray-900 text-white text-xs p-3 rounded-lg shadow-lg z-50 max-w-xs pointer-events-none"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: 'translateX(-50%) translateY(-100%)'
          }}
        >
          <div className="whitespace-pre-line font-medium">
            {tooltip.content}
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

export default WeekView;