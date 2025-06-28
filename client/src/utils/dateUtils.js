import { format, parseISO, startOfDay, endOfDay, isSameDay, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

export const formatEventTime = (dateTimeString) => {
  if (!dateTimeString) return '';
  
  const date = parseISO(dateTimeString);
  return format(date, 'h:mm a');
};

export const formatEventDate = (dateTimeString) => {
  if (!dateTimeString) return '';
  
  const date = parseISO(dateTimeString);
  return format(date, 'MMM d, yyyy');
};

export const formatFullDateTime = (dateTimeString) => {
  if (!dateTimeString) return '';
  
  const date = parseISO(dateTimeString);
  return format(date, 'MMM d, yyyy h:mm a');
};

export const isToday = (dateTimeString) => {
  if (!dateTimeString) return false;
  
  const date = parseISO(dateTimeString);
  return isSameDay(date, new Date());
};

export const getDateRange = (view, date = new Date()) => {
  switch (view) {
    case 'day':
      return {
        start: startOfDay(date),
        end: endOfDay(date)
      };
    case 'week':
      return {
        start: startOfWeek(date, { weekStartsOn: 0 }),
        end: endOfWeek(date, { weekStartsOn: 0 })
      };
    case 'month':
      return {
        start: startOfMonth(date),
        end: endOfMonth(date)
      };
    default:
      return {
        start: startOfDay(date),
        end: endOfDay(addDays(date, 7))
      };
  }
};

export const getEventsForDate = (events, date) => {
  return events.filter(event => {
    const eventDate = event.start?.dateTime || event.start?.date;
    if (!eventDate) return false;
    
    return isSameDay(parseISO(eventDate), date);
  });
};

export const groupEventsByDate = (events) => {
  const grouped = {};
  
  events.forEach(event => {
    const eventDate = event.start?.dateTime || event.start?.date;
    if (!eventDate) return;
    
    const dateKey = format(parseISO(eventDate), 'yyyy-MM-dd');
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(event);
  });
  
  return grouped;
};