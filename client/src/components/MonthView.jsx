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

    // Determine cell height based on number of rows
    const getRowHeight = () => {
      if (totalRows <= 5) return 'h-40'; // Standard height for 5 rows or less (160px)
      if (totalRows === 6) return 'h-32'; // Smaller for 6 rows (128px)
      return 'h-28'; // Smallest for more rows (112px)
    };

    const rowHeight = getRowHeight();

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dayEvents = getEventsForDate(events, day);
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isSelected = isSameDay(day, selectedDate);
        const isTodayDate = isToday(day);

        days.push(
          <div
            key={day}
            className={`relative ${rowHeight} p-4 border-r border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors overflow-hidden ${
              !isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'bg-white'
            } ${isSelected ? 'bg-blue-50' : ''}`}
            onClick={() => handleDateClick(cloneDay)}
          >
            <div className={`inline-flex items-center justify-center ${
              totalRows > 5 ? 'w-10 h-10 text-lg' : 'w-14 h-14 text-xl'
            } ${
              isTodayDate
                ? 'bg-blue-600 text-white rounded-full font-medium'
                : isSelected
                ? 'bg-blue-100 text-blue-600 rounded-full font-medium'
                : isCurrentMonth
                ? 'text-gray-900'
                : 'text-gray-400'
            }`}>
              {format(day, dayFormat)}
            </div>

            <div className={`${totalRows > 5 ? 'mt-2 space-y-1' : 'mt-3 space-y-2'} overflow-hidden`}>
              {dayEvents.slice(0, totalRows > 5 ? 1 : 2).map((event, index) => (
                <div key={`${event.id}-${index}`} className="text-xs">
                  {renderEventBar(event, 'w-full')}
                </div>
              ))}
              {dayEvents.length > (totalRows > 5 ? 1 : 2) && (
                <div className={`${
                  totalRows > 5 ? 'text-xs' : 'text-sm'
                } text-gray-700 px-1 py-1 bg-gray-100 rounded text-center font-medium`}>
                  +{dayEvents.length - (totalRows > 5 ? 1 : 2)}
                </div>
              )}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day} className="grid grid-cols-7">
          {days}
        </div>
      );
      days = [];
    }

    return <div className="h-full overflow-hidden">{rows}</div>;
  };

  return renderMonthView();
};

export default MonthView;