import { useState } from 'react';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';

const GoogleCalendar = ({ events = [], loading = false, onDateSelect, onEventClick, onSignOut }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState('month'); // month, week, day

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
        className={`${width} ${color.bg} ${color.text} text-base px-2 py-1 mb-1 rounded cursor-pointer hover:opacity-90 transition-opacity`}
        title={`${event.summary} ${event.start?.dateTime ? format(new Date(event.start.dateTime), 'HH:mm') : 'All day'}`}
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
        />;
      case 'day':
        return <DayView 
          currentDate={currentDate}
          events={events}
          handleEventClick={handleEventClick}
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
    </div>
  );
};

export default GoogleCalendar;