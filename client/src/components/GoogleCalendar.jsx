import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, LogOut, Trash2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import googleCalendarService from '../services/googleCalendar';
import { getEventTone } from '../utils/eventColors';

const GoogleCalendar = ({ events = [], loading = false, onDateSelect, onEventClick, onSignOut, onDeleteEvent, userCredential }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState('week'); // month, week, day
  const [contextMenu, setContextMenu] = useState(null); // { x, y, event }
  const [deletingId, setDeletingId] = useState(null);
  const contextMenuRef = useRef(null);
  const [toast, setToast] = useState(null); // { message, id }
  const toastTimerRef = useRef(null);
  const scrollRef = useRef(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: ''
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
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

  const scrollToNow = () => {
    // Week grid rows are 64px per hour; keep a couple of hours of context above "now"
    const hour = new Date().getHours();
    const top = (hour >= 8 && hour <= 22 ? hour - 2 : 7) * 64;
    scrollRef.current?.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  useEffect(() => {
    if (view === 'week') scrollToNow();
  }, [view]);

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
    
    if (view === 'week') scrollToNow();
  };

  const renderHeader = () => {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="font-serif text-[28px] leading-none text-ink whitespace-nowrap">
            {view === 'month' && <>{format(currentDate, 'MMMM')} <span className="text-muted">{format(currentDate, 'yyyy')}</span></>}
            {view === 'week' && <>{format(startOfWeek(currentDate), 'MMM d')} – {format(endOfWeek(currentDate), 'MMM d')}</>}
            {view === 'day' && <>{format(currentDate, 'EEEE')} <span className="text-muted">{format(currentDate, 'MMM d')}</span></>}
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={prevPeriod} aria-label="Previous" className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-paper transition-colors">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToToday}
              className="px-2.5 py-1 text-sm font-medium text-ink-soft rounded-md hover:bg-paper transition-colors"
            >
              Today
            </button>
            <button onClick={nextPeriod} aria-label="Next" className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-paper transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-paper p-1">
            {['month', 'week', 'day'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3.5 py-1 text-sm rounded-full transition-colors ${
                  view === v ? 'bg-surface text-ink font-medium shadow-[0_1px_2px_rgba(29,28,26,0.08)]' : 'text-muted hover:text-ink'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="p-2 text-muted hover:text-ink hover:bg-paper rounded-full transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={17} />
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
        <div key={i} className="px-3 py-2.5 text-xs font-medium uppercase tracking-[0.08em] text-muted border-r border-line last:border-r-0">
          {format(addDays(startDay, i), 'EEE')}
        </div>
      );
    }

    return <div className="grid grid-cols-7 border-b border-line">{days}</div>;
  };

  const renderEventBar = (event, width = 'w-full') => {
    const tone = getEventTone(event);
    return (
      <div
        onClick={(e) => handleEventClick(event, e)}
        onContextMenu={(e) => handleEventContextMenu(event, e)}
        onMouseEnter={(e) => handleEventMouseEnter(event, e)}
        onMouseLeave={handleEventMouseLeave}
        className={`${width} ${tone.block} flex items-baseline gap-1.5 border-l-2 rounded-[4px] px-1.5 py-0.5 text-xs cursor-pointer hover:brightness-[0.97] transition ${deletingId === event.id ? 'opacity-40 pointer-events-none' : ''}`}
      >
        {event.start?.dateTime && (
          <span className="shrink-0 opacity-70">{format(new Date(event.start.dateTime), 'h:mmaaaaa')}</span>
        )}
        <span className="truncate font-medium">{event.summary}</span>
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
      <div className="bg-surface rounded-2xl border border-line h-full animate-pulse">
        <div className="h-16 border-b border-line" />
        <div className="grid grid-cols-7 h-[calc(100%-4rem)]">
          {Array(35).fill(0).map((_, i) => (
            <div key={i} className="border-r border-b border-line p-3">
              <div className="w-6 h-4 bg-paper rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-line w-full h-full flex flex-col overflow-hidden">
      {renderHeader()}
      {view === 'month' && renderDaysOfWeek()}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-quiet">
        {renderContent()}
      </div>
      
      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-surface rounded-lg shadow-[0_8px_24px_-8px_rgba(29,28,26,0.25)] border border-line py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs text-muted font-medium truncate max-w-[200px]">
            {contextMenu.event.summary || contextMenu.event.title}
          </div>
          <hr className="border-line my-1" />
          <button
            onClick={handleDeleteFromContextMenu}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-accent-soft transition-colors"
          >
            <Trash2 size={14} />
            Delete event
          </button>
        </div>
      )}

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

      {/* Delete toast notification */}
      <div
        className={`fixed bottom-6 left-6 z-50 transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      >
        <div className="bg-ink text-paper text-sm px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2.5">
          <Trash2 size={14} className="opacity-60 flex-shrink-0" />
          <span>{toast?.message}</span>
        </div>
      </div>
    </div>
  );
};

export default GoogleCalendar;