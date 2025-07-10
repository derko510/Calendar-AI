import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';

const GoogleCalendar = ({ events = [], loading = false, onDateSelect, onEventClick, onSignOut }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState(() => {
    // Load saved view from localStorage, default to 'month'
    return localStorage.getItem('calendarView') || 'month';
  });
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: ''
  });

  // Save view to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('calendarView', view);
  }, [view]);

  // Auto-scroll to current time when switching to week or day view
  useEffect(() => {
    if (view === 'week' || view === 'day') {
      scrollToCurrentTime();
    }
  }, [view]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const dayFormat = "d";

  const handleDateClick = (day) => {
    setSelectedDate(day);
    onDateSelect?.(day);
  };

  const handleEventClick = (event, e) => {
    e.stopPropagation();
    onEventClick?.(event);
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
    
    let timeRange;
    if (event.start?.dateTime) {
      timeRange = `${format(eventStart, 'h:mm a')} - ${format(eventEnd, 'h:mm a')}`;
    } else {
      timeRange = 'All day';
    }
    
    // Build tooltip content like Google Calendar
    const title = event.summary || event.title || 'Untitled Event';
    const location = event.location ? `📍 ${event.location}` : '';
    const description = event.description ? `📝 ${event.description}` : '';
    const organizer = event.organizer?.displayName || event.organizer?.email || '';
    const attendeesCount = event.attendees ? event.attendees.length : 0;
    
    let tooltipParts = [
      `🗓️ ${title}`,
      `⏰ ${timeRange}`
    ];
    
    if (location) tooltipParts.push(location);
    if (organizer) tooltipParts.push(`👤 ${organizer}`);
    if (attendeesCount > 0) tooltipParts.push(`👥 ${attendeesCount} attendee${attendeesCount > 1 ? 's' : ''}`);
    if (description && description.length < 100) tooltipParts.push(description);
    
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      content: tooltipParts.join('\n'),
      event: {
        title,
        timeRange,
        location: event.location,
        description: event.description,
        organizer,
        attendeesCount
      }
    });
  };

  /**
   * Hides tooltip when mouse leaves event.
   */
  const handleEventMouseLeave = () => {
    setTooltip({ visible: false, x: 0, y: 0, content: '' });
  };

  const nextPeriod = () => {
    if (view === 'month') {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (view === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else if (view === 'day') {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  const prevPeriod = () => {
    if (view === 'month') {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (view === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else if (view === 'day') {
      setCurrentDate(addDays(currentDate, -1));
    }
  };

  const scrollToCurrentTime = () => {
    setTimeout(() => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimePosition = (currentHour * 64) + (currentMinutes / 60 * 64);
      
      // Find the scrollable container and scroll to current time
      const scrollContainer = document.querySelector('.flex-1.overflow-y-auto');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: Math.max(0, currentTimePosition - 200), // Offset to center the red line
          behavior: 'smooth'
        });
      }
    }, 100); // Small delay to ensure the component has updated
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
    
    // Scroll to current time for week and day views
    if (view === 'week' || view === 'day') {
      scrollToCurrentTime();
    }
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-12 py-8 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-8">
          <button
            onClick={goToToday}
            className="px-8 py-4 text-lg font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={prevPeriod}
              className="p-4 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft size={32} className="text-gray-600" />
            </button>
            <button
              onClick={nextPeriod}
              className="p-4 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronRight size={32} className="text-gray-600" />
            </button>
          </div>

          <h1 className="text-4xl font-normal text-gray-700">
            {view === 'month' && format(currentDate, 'MMMM yyyy')}
            {view === 'week' && `${format(startOfWeek(currentDate), 'MMM d')} - ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`}
            {view === 'day' && format(currentDate, 'EEEE, MMMM d, yyyy')}
          </h1>
        </div>

        <div className="flex items-center space-x-8">
          <div className="flex bg-gray-100 rounded-xl p-2">
            <button
              onClick={() => setView('month')}
              className={`px-6 py-3 text-lg font-medium rounded-lg transition-colors ${
                view === 'month'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-6 py-3 text-lg font-medium rounded-lg transition-colors ${
                view === 'week'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-6 py-3 text-lg font-medium rounded-lg transition-colors ${
                view === 'day'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Day
            </button>
          </div>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="inline-flex items-center px-6 py-4 text-lg font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut size={20} className="mr-3" />
              Sign Out
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderDaysOfWeek = () => {
    const days = [];
    let startDay = startOfWeek(currentDate, { weekStartsOn: 0 });

    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="p-6 text-xl font-medium text-gray-500 text-center border-r border-gray-200 last:border-r-0 h-24 flex items-center justify-center">
          {format(addDays(startDay, i), 'EEEE').toUpperCase()}
        </div>
      );
    }

    return <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">{days}</div>;
  };

  const renderEventBar = (event, width = 'w-full') => {
    const colors = [
      { bg: 'bg-blue-500', text: 'text-white' },
      { bg: 'bg-green-500', text: 'text-white' }, 
      { bg: 'bg-purple-500', text: 'text-white' },
      { bg: 'bg-red-500', text: 'text-white' },
      { bg: 'bg-yellow-400', text: 'text-gray-900' },
      { bg: 'bg-indigo-500', text: 'text-white' },
      { bg: 'bg-pink-500', text: 'text-white' },
      { bg: 'bg-orange-500', text: 'text-white' }
    ];
    
    // Safe color index calculation
    let colorIndex = 0;
    if (event.id && typeof event.id === 'string' && event.id.length > 0) {
      const lastChar = event.id.slice(-1);
      const parsedIndex = parseInt(lastChar);
      colorIndex = isNaN(parsedIndex) ? 0 : parsedIndex % colors.length;
    } else if (event.summary) {
      // Fallback: use summary hash if no ID
      colorIndex = event.summary.length % colors.length;
    }
    
    const color = colors[colorIndex];

    return (
      <div
        onClick={(e) => handleEventClick(event, e)}
        onMouseEnter={(e) => handleEventMouseEnter(event, e)}
        onMouseLeave={handleEventMouseLeave}
        className={`${width} ${color.bg} ${color.text} text-base px-2 py-1 mb-1 rounded cursor-pointer hover:opacity-90 transition-opacity`}
      >
        <div className="truncate text-base leading-tight font-medium">
          {event.summary}
        </div>
        {event.start?.dateTime && (
          <div className="text-sm text-gray-600 mt-1">
            {format(new Date(event.start.dateTime), 'HH:mm')}
          </div>
        )}
      </div>
    );
  };




  const renderContent = () => {
    switch (view) {
      case 'week':
        return <WeekView 
          currentDate={currentDate}
          events={events}
          handleDateClick={handleDateClick}
          handleEventClick={handleEventClick}
          handleEventMouseEnter={handleEventMouseEnter}
          handleEventMouseLeave={handleEventMouseLeave}
        />;
      case 'day':
        return <DayView 
          currentDate={currentDate}
          events={events}
          handleEventClick={handleEventClick}
          handleEventMouseEnter={handleEventMouseEnter}
          handleEventMouseLeave={handleEventMouseLeave}
        />;
      default:
        return <MonthView 
          currentDate={currentDate}
          selectedDate={selectedDate}
          events={events}
          startDate={startDate}
          endDate={endDate}
          monthStart={monthStart}
          dayFormat={dayFormat}
          handleDateClick={handleDateClick}
          renderEventBar={renderEventBar}
        />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white h-screen">
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 border-b border-gray-200"></div>
          <div className="grid grid-cols-7 h-20 border-b border-gray-200">
            {Array(7).fill(0).map((_, i) => (
              <div key={i} className="bg-gray-100 border-r border-gray-200"></div>
            ))}
          </div>
          <div className="grid grid-cols-7 h-[48rem]">
            {Array(35).fill(0).map((_, i) => (
              <div key={i} className="bg-gray-50 border-r border-b border-gray-200 p-4">
                <div className="w-12 h-12 bg-gray-200 rounded mb-4"></div>
                <div className="space-y-2">
                  <div className="h-8 bg-gray-200 rounded w-full"></div>
                  <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg shadow-lg border-2 border-gray-300 w-full h-[calc(100vh-6rem)] flex flex-col overflow-hidden">
      {renderHeader()}
      {view === 'month' && renderDaysOfWeek()}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>
      
      {/* Enhanced Google-style Tooltip */}
      {tooltip.visible && (
        <div
          className="fixed bg-white border border-gray-300 shadow-2xl rounded-lg z-50 max-w-sm pointer-events-none"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: 'translateX(-50%) translateY(-100%)'
          }}
        >
          <div className="p-4">
            {/* Event Title */}
            {tooltip.event && (
              <div className="space-y-2">
                <div className="font-semibold text-gray-900 text-sm leading-tight">
                  {tooltip.event.title}
                </div>
                
                {/* Time */}
                <div className="flex items-center text-gray-600 text-xs">
                  <span className="mr-1">⏰</span>
                  {tooltip.event.timeRange}
                </div>
                
                {/* Location */}
                {tooltip.event.location && (
                  <div className="flex items-center text-gray-600 text-xs">
                    <span className="mr-1">📍</span>
                    <span className="truncate">{tooltip.event.location}</span>
                  </div>
                )}
                
                {/* Organizer */}
                {tooltip.event.organizer && (
                  <div className="flex items-center text-gray-600 text-xs">
                    <span className="mr-1">👤</span>
                    <span className="truncate">{tooltip.event.organizer}</span>
                  </div>
                )}
                
                {/* Attendees */}
                {tooltip.event.attendeesCount > 0 && (
                  <div className="flex items-center text-gray-600 text-xs">
                    <span className="mr-1">👥</span>
                    {tooltip.event.attendeesCount} attendee{tooltip.event.attendeesCount > 1 ? 's' : ''}
                  </div>
                )}
                
                {/* Description */}
                {tooltip.event.description && tooltip.event.description.length < 100 && (
                  <div className="text-gray-700 text-xs pt-2 border-t border-gray-200 mt-2">
                    <span className="text-gray-500 mr-1">📝</span>
                    <span className="leading-relaxed">{tooltip.event.description}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Fallback for simple content */}
            {!tooltip.event && (
              <div className="whitespace-pre-line text-gray-900 text-xs">
                {tooltip.content}
              </div>
            )}
          </div>
          
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 translate-y-[-1px] w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-300"></div>
        </div>
      )}
    </div>
  );
};

export default GoogleCalendar;