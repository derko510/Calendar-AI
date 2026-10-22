import { format, addDays, isSameMonth, isSameDay, isToday } from 'date-fns';
import { getEventsForDate } from '../utils/dateUtils';

const MonthView = ({ 
  currentDate, 
  selectedDate, 
  events, 
  startDate, 
  endDate, 
  monthStart, 
  dayFormat, 
  handleDateClick, 
  renderEventBar 
}) => {
  const renderMonthView = () => {
    const rows = [];
    let days = [];
    let day = startDate;
    let totalRows = 0;

    // Count total rows needed
    let tempDay = startDate;
    while (tempDay <= endDate) {
      tempDay = addDays(tempDay, 7);
      totalRows++;
    }

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dayEvents = getEventsForDate(events, day);
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isSelected = isSameDay(day, selectedDate);
        const isTodayDate = isToday(day);

        const maxVisible = totalRows > 5 ? 2 : 3;

        days.push(
          <div
            key={day}
            className={`relative min-h-0 p-1.5 border-r border-b border-line last:border-r-0 cursor-pointer transition-colors overflow-hidden ${
              isSelected ? 'bg-paper' : 'hover:bg-paper/60'
            }`}
            onClick={() => handleDateClick(cloneDay)}
          >
            <div className={`ml-0.5 mb-1 inline-flex items-center justify-center h-6 min-w-6 px-1 text-[13px] rounded-full ${
              isTodayDate
                ? 'bg-accent text-white font-semibold'
                : isCurrentMonth
                ? 'text-ink'
                : 'text-muted/50'
            }`}>
              {format(day, dayFormat)}
            </div>

            <div className="space-y-0.5">
              {dayEvents.slice(0, maxVisible).map((event, index) => (
                <div key={`${event.id}-${index}`}>
                  {renderEventBar(event, 'w-full')}
                </div>
              ))}
              {dayEvents.length > maxVisible && (
                <div className="px-1.5 text-[11px] text-muted">
                  {dayEvents.length - maxVisible} more
                </div>
              )}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day} className="grid grid-cols-7 flex-1 min-h-[96px]">
          {days}
        </div>
      );
      days = [];
    }

    return <div className="h-full flex flex-col">{rows}</div>;
  };

  return renderMonthView();
};

export default MonthView;