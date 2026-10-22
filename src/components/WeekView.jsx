import React, {useState} from 'react';
import {format,startOfWeek,addDays,startOfDay,setHours,isToday} from 'date-fns';
import { getEventTone } from '../utils/eventColors';

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
  handleEventClick,
  handleEventContextMenu,
  deletingId
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
    const rawDescription = event.description || '';
    const description = rawDescription.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
    const location = event.location || '';
    const lines = [timeRange, location, description].filter(Boolean).join('\n');

    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      content: lines
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
    <div className="min-h-full flex flex-col">
      {/* Weekday header */}
      <div className="flex border-b border-line bg-surface sticky top-0 z-30">
        <div className="w-11 sm:w-14 flex-shrink-0" />
        {weekdays.map((weekday, index) => {
          const isTodayCol = isToday(weekDays[index]);
          return (
            <div key={weekday} className="flex-1 min-w-0 border-l border-line">
              <div className="px-1 sm:px-2 pt-2.5 pb-2 flex flex-col sm:flex-row items-center sm:items-baseline gap-0.5 sm:gap-1.5">
                <span className={`text-[10px] sm:text-[11px] uppercase tracking-[0.08em] ${isTodayCol ? 'text-accent font-semibold' : 'text-muted'}`}>
                  <span className="sm:hidden">{weekday.slice(0, 1)}</span><span className="hidden sm:inline">{weekday.slice(0, 3)}</span>
                </span>
                <span className={`font-serif text-xl sm:text-2xl leading-none ${isTodayCol ? 'text-accent' : 'text-ink'}`}>
                  {format(weekDays[index], 'd')}
                </span>
              </div>

              {/* All-day events */}
              <div className="px-1 pb-1.5 space-y-0.5">
                {getEventsForDate(weekDays[index])
                  .filter(event => !event.start?.dateTime)
                  .map((event, eventIndex) => (
                    <div
                      key={`${event.id}-${eventIndex}`}
                      className={`${getEventTone(event).block} border-l-2 text-[11px] font-medium px-1.5 py-0.5 rounded-[4px] truncate cursor-pointer hover:brightness-[0.97] transition ${deletingId === event.id ? 'opacity-40 pointer-events-none' : ''}`}
                      onClick={(e) => handleEventClickInternal(event, e)}
                      onContextMenu={(e) => handleEventContextMenu?.(event, e)}
                      onMouseEnter={(e) => handleEventMouseEnter(event, e)}
                      onMouseLeave={handleEventMouseLeave}
                    >
                      {event.summary}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1">
        <div className="flex">
          <div className="w-11 sm:w-14 flex-shrink-0">
            {hours.map(h => (
              <div key={h} className="h-16 pr-2 text-right text-[11px] text-muted -translate-y-1.5">
                {h === 0 ? '' : format(setHours(startOfDay(currentDate), h), 'h a')}
              </div>
            ))}
          </div>

          {weekDays.map((date, dayIndex) => {
            const dayEvents = getEventsForDate(date);
            const isTodayDate = isToday(date);

            return (
              <div
                key={`day-${dayIndex}`}
                className={`flex-1 min-w-0 border-l border-line relative ${isTodayDate ? 'bg-accent-soft/25' : ''}`}
              >
                {hours.map(h => (
                  <div
                    key={h}
                    className="h-16 border-b border-line/70 cursor-pointer hover:bg-paper/70 transition-colors"
                    onClick={() => handleDateClick(setHours(date, h))}
                    title={getCellTitle(date, h)}
                  />
                ))}

                {isTodayDate && (
                  <div
                    className="absolute left-0 right-0 h-px bg-accent z-20 pointer-events-none"
                    style={{ top: `${currentTimePosition}px` }}
                  >
                    <div className="absolute -left-1 -top-[3.5px] w-2 h-2 bg-accent rounded-full" />
                  </div>
                )}

                {dayEvents
                  .filter(event => event.start?.dateTime)
                  .map((event, eventIndex) => {
                    const eventStart = new Date(event.start.dateTime);
                    const eventEnd = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(eventStart.getTime() + 60 * 60 * 1000);
                    const position = calculateEventPosition(eventStart, eventEnd);
                    const tone = getEventTone(event);

                    return (
                      <div
                        key={`${event.id}-${eventIndex}`}
                        className={`absolute left-0.5 right-1 ${tone.block} border-l-2 text-[11px] leading-tight px-1.5 py-1 rounded-[5px] z-10 overflow-hidden cursor-pointer hover:brightness-[0.97] transition ${deletingId === event.id ? 'opacity-40 pointer-events-none' : ''}`}
                        style={{
                          top: `${position.top + 1}px`,
                          height: `${Math.max(position.height - 2, 18)}px`
                        }}
                        onClick={(e) => handleEventClickInternal(event, e)}
                        onContextMenu={(e) => handleEventContextMenu?.(event, e)}
                        onMouseEnter={(e) => handleEventMouseEnter(event, e)}
                        onMouseLeave={handleEventMouseLeave}
                        aria-label={`${event.summary} from ${format(eventStart, 'h:mm a')} to ${format(eventEnd, 'h:mm a')}`}
                      >
                        <div className="font-semibold truncate">{event.summary}</div>
                        <div className="opacity-70">{format(eventStart, 'h:mm a')}</div>
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
          className="fixed bg-ink text-paper text-xs px-3 py-2 rounded-md shadow-lg z-50 max-w-xs pointer-events-none"
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
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-ink"></div>
        </div>
      )}
    </div>
  );
};

export default WeekView;