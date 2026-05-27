import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, LogOut, Trash2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import googleCalendarService from '../services/googleCalendar';

const GoogleCalendar = ({ events = [], loading = false, onDateSelect, onEventClick, onSignOut, onDeleteEvent, userCredential }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState('week'); // month, week, day
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const viewDropdownRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, event }
  const [deletingId, setDeletingId] = useState(null);
  const contextMenuRef = useRef(null);
  const [toast, setToast] = useState(null); // { message, id }
  const toastTimerRef = useRef(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: ''
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target)) {
        setViewDropdownOpen(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEventContextMenu = (event, e) => {
    e.preventDefault();
    e.stopPropagation();
    setTooltip({ visible: false, x: 0, y: 0, content: '' });
    setContextMenu({ x: e.clientX, y: e.clientY, event });
  };

  const showToast = (message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, id: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  const handleDeleteFromContextMenu = async () => {
    if (!contextMenu?.event) return;
    const ev = contextMenu.event;
    setContextMenu(null);
    setDeletingId(ev.id);
    try {
      if (userCredential?.accessToken) {
        googleCalendarService.setAccessToken(userCredential.accessToken);
        await googleCalendarService.deleteEvent(ev.calendarId || 'primary', ev.id);
      }
      onDeleteEvent?.(ev.id);
      showToast(`"${ev.summary || 'Event'}" deleted`);
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Could not delete event');
    } finally {
      setDeletingId(null);
    }
  };

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

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
    
    // If in week view, scroll to current time after a short delay
    if (view === 'week') {
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
          <div className="relative" ref={viewDropdownRef}>
            <button
              onClick={() => setViewDropdownOpen((o) => !o)}
              className="flex items-center gap-2 px-5 py-3 text-lg font-medium text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors shadow-sm"
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
              <ChevronDown size={18} className={`text-gray-500 transition-transform duration-200 ${viewDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {viewDropdownOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                {['month', 'week', 'day'].map((v) => (
                  <button
                    key={v}
                    onClick={() => { setView(v); setViewDropdownOpen(false); }}
                    className={`w-full text-left px-5 py-3 text-base font-medium transition-colors ${
                      view === v
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            )}
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
        onContextMenu={(e) => handleEventContextMenu(event, e)}
        onMouseEnter={(e) => handleEventMouseEnter(event, e)}
        onMouseLeave={handleEventMouseLeave}
        className={`${width} ${color.bg} ${color.text} text-base px-2 py-1 mb-1 rounded cursor-pointer hover:opacity-90 transition-opacity ${deletingId === event.id ? 'opacity-40 pointer-events-none' : ''}`}
      >
        <div className="truncate text-base leading-tight font-medium">
          {event.summary}
        </div>
        {event.start?.dateTime && (
          <div className="text-sm text-gray-600 mt-1">
            {format(new Date(event.start.dateTime), 'h:mm a')}
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
          handleEventContextMenu={handleEventContextMenu}
          deletingId={deletingId}
        />;
      case 'day':
        return <DayView
          currentDate={currentDate}
          events={events}
          handleEventClick={handleEventClick}
          handleEventContextMenu={handleEventContextMenu}
          deletingId={deletingId}
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
      
      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 font-medium truncate max-w-[180px]">
            {contextMenu.event.summary || contextMenu.event.title}
          </div>
          <hr className="border-gray-100 my-1" />
          <button
            onClick={handleDeleteFromContextMenu}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
            Delete event
          </button>
        </div>
      )}

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

      {/* Delete toast notification */}
      <div
        className={`fixed bottom-6 left-6 z-50 transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      >
        <div className="bg-gray-800 text-white text-sm px-4 py-3 rounded-lg shadow-xl flex items-center gap-3">
          <Trash2 size={14} className="text-gray-300 flex-shrink-0" />
          <span>{toast?.message}</span>
        </div>
      </div>
    </div>
  );
};

export default GoogleCalendar;